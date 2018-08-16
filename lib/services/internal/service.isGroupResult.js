const _                                 = require('underscore');
let log                                 = require('./service.log');
const re                                = require('../../configs/config.re');


/**
 * Checks to see if the LDAP result describes a group entry.
 * @param {Object} item The LDAP result to inspect.
 * @returns {Boolean}
 */
function isGroupResult(item) {
    log.trace('isGroupResult(%j)', item);

    if (!item) return (false);
    if (item.groupType) return (true);
    if (item.objectCategory) {
        re.isGroupResult.lastIndex = 0; // Reset the regular expression
        return (re.isGroupResult.test(item.objectCategory));
    }
    if ((item.objectClass) && (item.objectClass.length > 0)) {
        return (_.any(item.objectClass, function (c) { return (c.toLowerCase() === 'group'); }));
    }
    return (false);
}

module.exports = isGroupResult;