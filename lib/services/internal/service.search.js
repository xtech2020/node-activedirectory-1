
const ldap                              = require('ldapjs');
const _                                 = require('underscore');
const Url                               = require('url');
const createClient                      = require('./service.createClient');
const truncateLogOutput                 = require('./service.truncateLogOutput');
const getLdapOpts                       = require('./service.getLdapOpts');
const isAllowedReferral                 = require('./service.isAllowedReferral');
const log                               = require('./service.log');
const limitpromises                     = require('limitpromises');
const maxPromiseConfig                  = require('../../configs/config.maxPromiseGroup');
const defaultPageSize                   = 1000; // The maximum number of results that AD will return in a single call. Default=1000


/**
 * Performs a search on the LDAP tree.
 * 
 * @private
 * @param {String} [baseDN] The optional base directory where the LDAP query is to originate from. If not specified, then starts at the root.
 * @param {Object} [opts] LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {Function} callback The callback to execure when completed. callback(err: {Object}, results: {Array[Object]}})
 */
function search (baseDN, opts, callback) {
    let searchStarted = new Date();
    var self = this;

    if (typeof (opts) === 'function') {
        callback = opts;
        opts = baseDN;
        baseDN = undefined;
    }
    if (typeof (baseDN) === 'object') {
        opts = baseDN;
        baseDN = undefined;
    }
    opts || (opts = {});
    baseDN || (baseDN = opts.baseDN) || (baseDN = self.baseDN);
    log.trace('search(%s,%j)', baseDN, opts);

    var isDone = false;
    var pendingReferrals = [];
    var pendingRangeRetrievals = 0;
    var client = createClient.call(self, null, opts);
    client.on('error', onClientError);

    /**
     * Call to remove the specified referral client.
     * @param {Object} client The referral client to remove.
     */
    function removeReferral(client) {
        if (!client) return;

        client.unbind();
        var indexOf = pendingReferrals.indexOf(client);
        if (indexOf >= 0) {
            pendingReferrals.splice(indexOf, 1);
        }
    }

    /**
     * The default entry parser to use. Does not modifications.
     * @params {Object} entry The original / raw ldapjs entry to augment
     * @params {Function} callback The callback to execute when complete.
     */
    var entryParser = (opts || {}).entryParser || (self.opts || {}).entryParser || function onEntryParser(item, raw, callback) {
        callback(item);
    };

    /**
     * Occurs when a search entry is received. Cleans up the search entry and pushes it to the result set.
     * @param {Object} entry The entry received.
     */
    function onSearchEntry(entry) {
        const parseRangeAttributes  = require('./service.parseRangeAttributes');

        log.trace('onSearchEntry(%j)', entry);
        var result = entry.object;
        delete result.controls; // Remove the controls array returned as part of the SearchEntry

        // Some attributes can have range attributes (paging). Execute the query
        // again to get additional items.
        pendingRangeRetrievals++;
        parseRangeAttributes.call(self, result, opts, function (err, item) {
            pendingRangeRetrievals--;

            if (err) item = entry.object;
            entryParser(item, entry.raw, function (item) {
                if (item) results.push(item);
                if ((!pendingRangeRetrievals) && (isDone)) {
                    onSearchEnd();
                }
            });
        });
    }

    /**
     * Occurs when a search reference / referral is received. Follows the referral chase if
     * enabled.
     * @param {Object} ref The referral.
     */
    function onReferralChase(ref) {
        var index = 0;
        var referralUrl;
        // Loop over the referrals received.
        while (referralUrl = (ref.uris || [])[index++]) {
            if (isAllowedReferral(referralUrl)) {
                log.debug('Following LDAP referral chase at %s', referralUrl);
                var referralClient = createClient.call(self, referralUrl, opts);
                pendingReferrals.push(referralClient);

                var referral = Url.parse(referralUrl);
                var referralBaseDn = (referral.pathname || '/').substring(1);
                referralClient.search(referralBaseDn, getLdapOpts(opts), controls, function (err, res) {
                    /**
                     * Occurs when a error is encountered with the referral client.
                     * @param {Object} err The error object or string.
                     */
                    function onReferralError(err) {
                        log.error(err, '[%s] An error occurred chasing the LDAP referral on %s (%j)',
                            (err || {}).errno, referralBaseDn, opts);
                        removeReferral(referralClient);
                    }
                    // If the referral chase / search failed, fail silently.
                    if (err) {
                        onReferralError(err);
                        return;
                    }

                    res.on('searchEntry', onSearchEntry);
                    res.on('searchReference', onReferralChase);
                    res.on('error', onReferralError);
                    res.on('end', function (result) {
                        removeReferral(referralClient);
                        onSearchEnd();
                    });
                });
            }
        }
    }

    /**
     * Occurs when a client / search error occurs.
     * @param {Object} err The error object or string.
     * @param {Object} res The optional server response.
     */
    function onClientError(err, res) {
        if ((err || {}).name === 'SizeLimitExceededError') {
            onSearchEnd(res);
            return;
        }

        if((err || {}).errno === 'ETIMEDOUT'){
            err.timeoutAfter = (new Date() - searchStarted);
        }

        client.unbind();
        log.error(err, '[%s] An error occurred performing the requested LDAP search on %s (%j)',
            (err || {}).errno || 'UNKNOWN', baseDN, opts);
        if (callback) callback(err);
    }

    /**
     * Occurs when a search results have all been processed.
     * @param {Object} result
     */
    function onSearchEnd(result) {
        if ((!pendingRangeRetrievals) && (pendingReferrals.length <= 0)) {
            client.unbind();
            log.info('Active directory search (%s) for "%s" returned %d entries.',
                baseDN, truncateLogOutput(opts.filter),
                (results || []).length);
            if (callback) callback(null, results);
        }
    }

    var results = [];

    var controls = opts.controls || (opts.controls = []);
    // Add paging results control by default if not already added.
    if (!_.any(controls, function (control) { return (control instanceof ldap.PagedResultsControl); })) {
        log.debug('Adding PagedResultControl to search (%s) with filter "%s" for %j',
            baseDN, truncateLogOutput(opts.filter), _.any(opts.attributes) ? opts.attributes : '[*]');
        controls.push(new ldap.PagedResultsControl({ value: { size: defaultPageSize } }));
    }
    if (opts.includeDeleted) {
        if (!_.any(controls, function (control) { return (control.type === '1.2.840.113556.1.4.417'); })) {
            log.debug('Adding ShowDeletedOidControl(1.2.840.113556.1.4.417) to search (%s) with filter "%s" for %j',
                baseDN, truncateLogOutput(opts.filter), _.any(opts.attributes) ? opts.attributes : '[*]');
            controls.push(new ldap.Control({ type: '1.2.840.113556.1.4.417', criticality: true }));
        }
    }

    log.debug('Querying active directory (%s) with filter "%s" for %j',
        baseDN, 
        truncateLogOutput(opts.filter), 
        _.any(opts.attributes) ? opts.attributes : '[*]'
    );
    
    // We want to limit the total of the searches, we will use [true] as InputValues as we don't use it anyways in the function
    limitpromises(Input => {
        return new Promise((resolve, reject) => {
            client.search(baseDN, getLdapOpts(opts), controls, function onSearch(err, res) {
                if (err) {
                    if (callback) callback(err);
                    reject(err);
                    return;
                }
        
                res.on('searchEntry', entry => {
                    onSearchEntry(entry);
                    resolve();
                });                
                res.on('searchReference', ref => {
                    onReferralChase(ref);
                    resolve();
                });
                res.on('error', function (err) { 
                    onClientError(err, res);
                    return resolve(); 
                });
                res.on('end', function (result) {
                    isDone = true; // Flag that the primary query is complete
                    onSearchEnd(result);
                    return resolve();
                });
            });
        });        
    }, [true], self.opts.maxSearchesAtOnce || maxPromiseConfig.maxSearchesAtOnce, "searches", {
        Reject : {
            rejectBehaviour : "retry",
            retryAttempts : 1
        }
    });    
}

module.exports = search;