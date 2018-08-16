let log         = require('./service.log');

/**
 * Parses the distinguishedName (dn) to remove any invalid characters or to
 * properly escape the request.
 *
 * @private
 *   @param dn {String} The dn to parse.
 * @returns {String}
 */

const parseDistinguishedName = dn => {
    log.trace('parseDistinguishedName(%s)', dn);
    if (!dn) return (dn);

    dn = dn.replace(/"/g, '\\"');
    return (dn.replace('\\,', '\\\\,'));
}

module.exports = parseDistinguishedName;