const _                 = require('underscore');
const getLdapClientOpts = require('./service.getLdapClientOpts');
const getLdapSearchOpts = require('./service.getLdapSearchOpts');
/**
 * From the list of options, retrieves the ldapjs specific options.
 *
 * @param {Object} opts The opts to parse.
 * @returns {Object} The ldapjs opts.
 */
const getLdapOpts = (opts) => {
    return (_.defaults({}, getLdapClientOpts(opts), getLdapSearchOpts(opts)));
}
module.exports = getLdapOpts;