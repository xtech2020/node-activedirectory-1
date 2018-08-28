const parseRangeAttributes      = require('../service.parseRangeAttributes');
const pendingRangeRetrievals    = require('./service.search.pendingRangeRetrievals');
const log                       = require('../service.log');

/**
* Occurs when a search entry is received. Cleans up the search entry and pushes it to the result set.
* @param {Object} entry The entry received.
* @param {Object} self The ActiveDirectory Object
* @param {Object} opts Options
* @param {Function} resolve Resolve the search
* @param {Function} reject Reject the search
*/
function onSearchEntry(entry, self, opts, isDone, results, resolve, reject) {
    /**
    * The default entry parser to use. Does not modifications.
    * @params {Object} entry The original / raw ldapjs entry to augment
    * @params {Function} callback The callback to execute when complete.
    */
    let entryParser = (opts || {}).entryParser || (self.opts || {}).entryParser || function onEntryParser(item, raw, callback) {
        callback(item);
    };

    log.trace('onSearchEntry(%j)', entry);
    let result = entry.object;
    delete result.controls; // Remove the controls array returned as part of the SearchEntry

    // Some attributes can have range attributes (paging). Execute the query
    // again to get additional items.
    pendingRangeRetrievals.addOne();
    parseRangeAttributes.call(self, result, opts, function (err, item) {
        pendingRangeRetrievals.substractOne();

        if (err) item = entry.object;
        entryParser(item, entry.raw, function (item) {
            if (item) results.push(item);
            if ((!pendingRangeRetrievals.get()) && (isDone)) {
                onSearchEnd(client, baseDN, opts, results, isDone, callback, resolve, reject);
            }
        });
    });
}

module.exports = onSearchEntry;