
const parseDistinguishedName            = require('./service.parseDistinguishedName');
const isDistinguishedName               = require('./service.isDistinguishedName');
const log                                 = require('./service.log');
/**
 * Gets the ActiveDirectory LDAP query string for a user search.
 *
 * @private
 * @param {String|String[]} username The samAccountName(s) or userPrincipalName(s) (email) of the user.
 * @returns {String}
 */
function getUserQueryFilter(username) {
    log.trace('getUserQueryFilter(%s)', username);
    var self = this;
    let filter;

    // if username is acually an array of multiple usernames create an or query
    if (!username) return ('(objectCategory=User)');
    if(typeof(username) === 'object'){
        filter = '(|';
        for(ind in username){
            filter += getSingleQueryFilter(username[ind], self);
        }
        filter += ')';
    // if its a single username 
    } else {
        filter = getSingleQueryFilter(username, self);
    }

    return filter;
}

function getSingleQueryFilter(username, adObject){
    
    if (isDistinguishedName.call(adObject, username)) {
        return ('(&(objectCategory=User)(distinguishedName=' + parseDistinguishedName(username) + '))');
    } else {
        return ('(&(objectCategory=User)(|(sAMAccountName=' + username + ')(userPrincipalName=' + username + ')))');
    }

    
}

module.exports = getUserQueryFilter;