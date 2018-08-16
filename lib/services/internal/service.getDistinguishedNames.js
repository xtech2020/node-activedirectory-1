
const _                                 = require('underscore');
const joinAttributes                    = require('./service.joinAttributes');
const search                            = require('./service.search');
const truncateLogOutput                 = require('./service.truncateLogOutput');

let log                                 = require('./service.log');



/**
 * For the specified filter, return the distinguishedName (dn) of all the matched entries.
 *
 * @private
 * @param {Object} [opts] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @params {Object|String} filter The LDAP filter to execute. Optionally a custom LDAP query object can be specified. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {Function} callback The callback to execute when completed. callback(err: {Object}, dns: {Array[String]})
 */
function getDistinguishedNames(opts, filter, callback) {
    var self = this;

    if (typeof (filter) === 'function') {
        callback = filter;
        filter = opts;
        opts = undefined;
    }
    if (typeof (opts) === 'string') {
        filter = opts;
        opts = undefined;
    }
    log.trace('getDistinguishedNames(%j,%j)', opts, filter);

    opts = _.defaults(_.omit(opts || {}, 'attributes'), {
        filter: filter,
        scope: 'sub',
        attributes: joinAttributes((opts || {}).attributes || [], ['dn'])
    });
    search.call(self, opts, function (err, results) {
        if (err) {
            if (callback) callback(err);
            return;
        }

        // Extract just the DN from the results
        var dns = _.map(results, function (result) {
            return (result.dn);
        });
        log.info('%d distinguishedName(s) found for LDAP query: "%s". Results: %j',
            results.length, truncateLogOutput(opts.filter), results);
        callback(null, dns);
    });
}

module.exports = getDistinguishedNames;