const _                 = require('underscore');
const ldap              = require('ldapjs');
const log               = require('./service.log');
const getLdapClientOpts = require('./service.getLdapClientOpts');

/**
 * Factory to create the LDAP client object.
 *
 * @private
 * @param {String} url The url to use when creating the LDAP client.
 * @param {object} opts The optional LDAP client options.
 */
const createClient = function(url, opts) {
    // Attempt to get Url from this instance.
    url = url || this.url || (this.opts || {}).url || (opts || {}).url;
    if (!url) {
        throw 'No url specified for ActiveDirectory client.';
    }
    log.trace('createClient(%s)', url);

    var opts = getLdapClientOpts(_.defaults({}, { url: url }, opts, this.opts));
    log.debug('Creating ldapjs client for %s. Opts: %j', opts.url, _.omit(opts, 'url', 'bindDN', 'bindCredentials'));
    var client = ldap.createClient(opts);
    return (client);
}

module.exports = createClient;