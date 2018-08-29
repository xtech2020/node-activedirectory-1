const pendingRangeRetrievals        = require('./service.search.pendingRangeRetrievals');
const pendingReferrals              = require('./service.search.pendingReferrals');
const log                           = require('../service.log');
const truncateLogOutput             = require('../service.truncateLogOutput');
/**
 * Occurs when a search results have all been processed.
 * @param {Object} client The ActiveDirectory Object
 * @param {String} baseDN
 * @param {Object} opts
 * @param {Array} results The search results
 * @param {Function} resolve resolve the search
 * @param {Function} reject reject the search
 */
function onSearchEnd(client, baseDN, opts, results, resolve, reject) {
    if ((!pendingRangeRetrievals.get()) && (pendingReferrals.get().length <= 0)) {
        if(client.connected){
            client.unbind( () => {
                return resolve(results);        
            });
        } else {
            return resolve(results);        
        }        
    }
}

module.exports = onSearchEnd;