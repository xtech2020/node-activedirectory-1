const _     = require('underscore');

/**
 * From the list of options, retrieves the ldapjs search specific options.
 *
 * @param {Object} opts The opts to parse.
 * @returns {Object} The ldapjs opts.
 */
const getLdapSearchOpts = (opts) => {
    return (_.pick(opts || {},
        // Search
        'filter', 'scope', 'attributes', 'controls',
        'paged', 'sizeLimit', 'timeLimit', 'typesOnly',
        'derefAliases'
    ));
}

module.exports = getLdapSearchOpts;