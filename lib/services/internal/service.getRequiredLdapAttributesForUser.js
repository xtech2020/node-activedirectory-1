const _                             = require('underscore');
const includeGroupMembershipFor     = require('./service.includeGroupMembershipFor');
const shouldIncludeAllAttributes    = require('./service.shouldIncludeAllAttributes');

/**
 * Gets the required ldap attributes for user related queries in order to
 * do recursive queries, etc.
 *
 * @private
 * @params {Object} [opts] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 */
const getRequiredLdapAttributesForUser = opts => {
    if (shouldIncludeAllAttributes((opts || {}).attributes)) {
        return ([]);
    }
    return (_.union(['dn', 'cn'],
        includeGroupMembershipFor(opts, 'user') ? ['member'] : []));
}

module.exports = getRequiredLdapAttributesForUser;