const parseDistinguishedName            = require('./service.parseDistinguishedName');
const isDistinguishedName               = require('./service.isDistinguishedName');
let log                                 = require('./service.log');

/**
 * Gets the ActiveDirectory LDAP query string for a group search.
 *
 * @private
 * @param {String} groupName The name of the group
 * @returns {String}
 */
function getGroupQueryFilter(groupName) {
    log.trace('getGroupQueryFilter(%s)', groupName);
    var self = this;

    if (!groupName) return ('(objectCategory=Group)');
    if (isDistinguishedName.call(self, groupName)) {
        return ('(&(objectCategory=Group)(distinguishedName=' + parseDistinguishedName(groupName) + '))');
    }
    return ('(&(objectCategory=Group)(cn=' + groupName + '))');
}

module.exports = getGroupQueryFilter;