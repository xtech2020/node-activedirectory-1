const _     = require('underscore');
const log   = require('./service.log');
const re    = require('../../configs/config.re');


/**
 * Checks to see if the LDAP result describes a user entry.
 * @param {Object} item The LDAP result to inspect.
 * @returns {Boolean}
 */
function isUserResult(item) {
    log.trace('isUserResult(%j)', item);

    if (!item) return (false);
    if (item.userPrincipalName) return (true);
    if (item.objectCategory) {
        re.isUserResult.lastIndex = 0; // Reset the regular expression
        return (re.isUserResult.test(item.objectCategory));
    }
    if ((item.objectClass) && (item.objectClass.length > 0)) {
        return (_.any(item.objectClass, function (c) { return (c.toLowerCase() === 'user'); }));
    }
    return (false);
}

module.exports = isUserResult;