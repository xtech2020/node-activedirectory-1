const _             = require('underscore');
const defaultOpts   = require('../../configs/config.defaultClientOpts');
/**
 * From the list of options, retrieves the ldapjs client specific options.
 *
 * @param {Object} opts The opts to parse.
 * @returns {Object} The ldapjs opts.
 */
const getLdapClientOpts = function (Opts) {

    let opts = (_.pick(Opts || {},
        // Client
        'url',
        'host', 'port', 'secure', 'tlsOptions',
        'socketPath', 'log', 'timeout', 'idleTimeout',
        'reconnect', 'queue', 'queueSize', 'queueTimeout',
        'queueDisable', 'bindDN', 'bindCredentials',
        'maxConnections', 'reconnect', 'checkInterval', 'maxIdleTime'
    ));

    for(key in defaultOpts){
        opts[key] = opts[key] || defaultOpts[key];
    }

    return opts;
}

module.exports = getLdapClientOpts;