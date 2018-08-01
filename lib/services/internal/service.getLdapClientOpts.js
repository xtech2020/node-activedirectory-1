const _         = require('underscore');
/**
 * From the list of options, retrieves the ldapjs client specific options.
 *
 * @param {Object} opts The opts to parse.
 * @returns {Object} The ldapjs opts.
 */
const getLdapClientOpts = function (opts) {
    return (_.pick(opts || {},
        // Client
        'url',
        'host', 'port', 'secure', 'tlsOptions',
        'socketPath', 'log', 'timeout', 'idleTimeout',
        'reconnect', 'queue', 'queueSize', 'queueTimeout',
        'queueDisable', 'bindDN', 'bindCredentials',
        'maxConnections'
    ));
}

module.exports = getLdapClientOpts;