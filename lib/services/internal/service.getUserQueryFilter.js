
const parseDistinguishedName            = require('./service.parseDistinguishedName');
const isDistinguishedName               = require('./service.isDistinguishedName');
const log                                 = require('./service.log');
/**
 * Gets the ActiveDirectory LDAP query string for a user search.
 *
 * @private
 * @param {String} username The samAccountName or userPrincipalName (email) of the user.
 * @returns {String}
 */
function getUserQueryFilter(username) {
    log.trace('getUserQueryFilter(%s)', username);
    var self = this;

    if (!username) return ('(objectCategory=User)');
    if (isDistinguishedName.call(self, username)) {
        return ('(&(objectCategory=User)(distinguishedName=' + parseDistinguishedName(username) + '))');
    }

    return ('(&(objectCategory=User)(|(sAMAccountName=' + username + ')(userPrincipalName=' + username + ')))');
}

module.exports = getUserQueryFilter;