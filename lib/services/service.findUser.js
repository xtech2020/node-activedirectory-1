
const _                                 = require('underscore');
const User                              = require('../models/user');
const joinAttributes                    = require('./internal/service.joinAttributes');
const includeGroupMembershipFor         = require('./internal/service.includeGroupMembershipFor');
const search                            = require('./internal/service.search');
const truncateLogOutput                 = require('./internal/service.truncateLogOutput');
const pickAttributes                    = require('./internal/service.pickAttributes');
const getRequiredLdapAttributesForUser  = require('./internal/service.getRequiredLdapAttributesForUser');
const getUserQueryFilter                = require('./internal/service.getUserQueryFilter');
const getGroupMembershipForDN           = require('./service.getGroupMembershipForDn');
let log                                 = require('./internal/service.log');
let defaultAttributes                   = require('../configs/config.defaultAttributes');

/**
 * Retrieves the specified user.
 *
 * @public
 * @param {Object} [opts] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {String} username The username to retrieve information about. Optionally can pass in the distinguishedName (dn) of the user to retrieve.
 * @param {Boolean} [includeMembership] OBSOLETE; NOT NOT USE. Indicates if the results should include group memberships for the user. Defaults to false.
 * @param {Function} callback The callback to execute when completed. callback(err: {Object}, user: {User})
 */
function findUser(opts, username, includeMembership, callback) {
    var self = this;

    if (typeof (includeMembership) === 'function') {
        callback = includeMembership;
        includeMembership = undefined;
    }
    if (typeof (username) === 'function') {
        callback = username;
        username = opts;
        opts = undefined;
    }
    if (typeof (username) === 'boolean') {
        includeMembership = username;
        username = opts;
    }
    if (typeof (opts) === 'string') {
        username = opts;
        opts = undefined;
    }
    log.trace('findUser(%j,%s,%s)', opts, username, includeMembership);

    var localOpts = _.defaults(_.omit(opts || {}, 'attributes'), {
        filter: getUserQueryFilter.call(self, username),
        scope: 'sub',
        attributes: joinAttributes((opts || {}).attributes || defaultAttributes.user || [], getRequiredLdapAttributesForUser(opts))
    });
    search.call(self, localOpts, function onSearch(err, results) {
        if (err) {
            if (callback) callback(err);
            return;
        }

        if ((!results) || (results.length === 0)) {
            log.warn('User "%s" not found for query "%s"', username, truncateLogOutput(localOpts.filter));
            if (callback) callback();
            return;
        }

        var user = new User(pickAttributes(results[0], (opts || {}).attributes || defaultAttributes.user));
        log.info('%d user(s) found for query "%s". Returning first user: %j', results.length, truncateLogOutput(localOpts.filter), user);

        // Also retrieving user group memberships?
        if (includeGroupMembershipFor(opts, 'user') || includeMembership) {
            getGroupMembershipForDN.call(self, opts, user.dn, function (err, groups) {
                if (err) {
                    if (callback) callback(err);
                    return;
                }

                user.groups = groups;
                self.emit('user', user);
                if (callback) callback(err, user);
            });
        }
        else {
            self.emit('user', user);
            if (callback) callback(err, user);
        }
    });
};

module.exports = findUser;