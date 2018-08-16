let log                                             = require('./service.log');

/**
 * Gets a properly formatted LDAP compound filter. This is a very simple approach to ensure that the LDAP
 * compound filter is wrapped with an enclosing () if necessary. It does not handle parsing of an existing
 * compound ldap filter.
 * @param {String} filter The LDAP filter to inspect.
 * @returns {String}
 */
function getCompoundFilter(filter) {
    log.trace('getCompoundFilter(%s)', filter);

    if (!filter) return (false);
    if ((filter.charAt(0) === '(') && (filter.charAt(filter.length - 1) === ')')) {
        return (filter);
    }
    return ('(' + filter + ')');
}

module.exports = getCompoundFilter;