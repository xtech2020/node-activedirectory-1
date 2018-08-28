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
 * @param {Function} callback The Callback of the search
 * @param {Function} resolve resolve the search
 * @param {Function} reject reject the search
 */
function onSearchEnd(client, baseDN, opts, results, callback, resolve, reject) {
    if ((!pendingRangeRetrievals.get()) && (pendingReferrals.get().length <= 0)) {
        client.unbind();
        log.info('Active directory search (%s) for "%s" returned %d entries.',
            baseDN, truncateLogOutput(opts.filter),
            (results || []).length);
        if (callback) callback(null, results);
        if (resolve) resolve(results);
        return;
    }
}

module.exports = onSearchEnd;