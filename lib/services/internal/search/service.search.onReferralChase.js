const limitpromises                     = require('limitpromises');
const Url                               = require('url');
const removeReferral                    = require('./service.search.removeReferral');
const pendingReferrals                  = require('./service.search.pendingReferrals');
const isAllowedReferral                 = require('../service.isAllowedReferral');
const createClient                      = require('../service.createClient');

    
    
/**
 * Occurs when a search reference / referral is received. Follows the referral chase if
 * enabled.
 * @param {Object} self The ActiveDirectory Object
 * @param {Object} ref The referral.
 * @param {Function} resolve Resolve the Search
 * @param {Function} reject Reject the search
 */
function onReferralChase(self, ref, opts, controls, results, resolve, reject) {
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

            
            let refCliSearch = limitpromises(Input => {
                return new Promise((resolve, reject) => {
                    referralClient.search(referralBaseDn, getLdapOpts(opts), controls, (err, res) => {
                        
                        // If the referral chase / search failed, fail silently.
                        if (err) {
                            onReferralError(err);
                            return;
                        }

                        return resolve(res);
                    });
                })
            }, [true], self.opts.maxSearchesAtOnce || maxPromiseConfig.maxSearchesAtOnce, "searches", maxPromiseConfig.searchTimeoutAndReject)
            
            Promise.all(refCliSearch.map(r => {return r.result})).then(results => {
                let res = results[0];
                res.on('searchEntry', entry => {
                    onSearchEntry(entry, self, opts, isDone, results, resolve, reject);
                });
                res.on('searchReference', ref => {
                    onReferralChase(self, ref, opts, controls, results, resolve, reject); 
                });
                res.on('error', onReferralError);
                res.on('end', function (result) {
                    removeReferral(referralClient);
                });
            });
        }
    }
}

/**
* Occurs when a error is encountered with the referral client.
* @param {Object} err The error object or string.
* @param {}
*/
function onReferralError(err, referralBaseDn, opts, referralClient) {
    log.error(err, '[%s] An error occurred chasing the LDAP referral on %s (%j)',
        (err || {}).errno, referralBaseDn, opts);
    removeReferral(referralClient);
}

module.exports = onReferralChase;