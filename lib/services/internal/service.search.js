
const ldap                              = require('ldapjs');
const _                                 = require('underscore');
const createClient                      = require('./service.createClient');
const truncateLogOutput                 = require('./service.truncateLogOutput');
const getLdapOpts                       = require('./service.getLdapOpts');
const log                               = require('./service.log');
const limitpromises                     = require('limitpromises');
const maxPromiseConfig                  = require('../../configs/config.maxPromiseGroup');

const onClientError                     = require('./search/service.search.onClientError');
const onSearchEnd                       = require('./search/service.onSearchEnd');
const onSearchEntry                     = require('./search/service.search.onSearchEntry');
const onReferralChase                   = require('./search/service.search.onReferralChase');

const defaultPageSize                   = 1000; // The maximum number of results that AD will return in a single call. Default=1000

const updateBaseDn                      = require('./service.updateBaseDn');


/**
 * Performs a search on the LDAP tree.
 * 
 * @private
 * @param {String} [baseDN] The optional base directory where the LDAP query is to originate from. If not specified, then starts at the root.
 * @param {Object} [opts] LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {Function} callback The callback to execure when completed. callback(err: {Object}, results: {Array[Object]}})
 */
function search (baseDN, opts, callback) {
    return new Promise((resolve, reject) => {
        let searchStarted = new Date();
        let self = this;
        let results = [];
        let isDone = false;

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
        let s = limitpromises(Input => {
            return new Promise((resolve, reject) => {
                var client = createClient.call(self, null, opts);
                client.on('error', err => {
                    onClientError(err, client, searchStarted, baseDN, opts, results, resolve, reject)   
                });

                client.search(baseDN, getLdapOpts(opts), controls, function onSearch(err, res) {
                    if (err) {
                        reject(err);
                    }
            
                    res.on('searchEntry', entry => {
                        onSearchEntry(entry, client, baseDN, self, opts, isDone, results, resolve, reject);
                    });                
                    res.on('searchReference', ref => {
                        onReferralChase(self, client, ref, opts, controls, results, resolve, reject);
                    });
                    res.on('error', function (err) { 
                        onClientError(err, client, searchStarted, baseDN, opts, results, resolve, reject);
                    });
                    res.on('end', function (result) {
                        isDone = true; // Flag that the primary query is complete
                        onSearchEnd(client, baseDN, opts, results, resolve, reject);
                    });

                });
            });        
        }, [true], self.opts.maxSearchesAtOnce || maxPromiseConfig.maxSearchesAtOnce, "searches", maxPromiseConfig.searchTimeoutAndReject);    

        Promise.all(s.map(r => {return r.result})).then(results => {
            updateBaseDn(self.opts, "default");
            if(callback){
                callback(null, results[0]);
            }
            return resolve(results[0]);
            
            
        }, err => {
            if(callback){
                callback(err);
            }
            return reject(err);
            
        });
    })
    
}

module.exports = search;