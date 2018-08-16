const async                             = require('async');
const _                                 = require('underscore');
const User                              = require('../models/user');
const Group                             = require('../models/group');
const joinAttributes                    = require('./internal/service.joinAttributes');
const getRequiredLdapAttributesForGroup = require('./internal/service.getRequiredLdapAttributesForUser');
const includeGroupMembershipFor         = require('./internal/service.includeGroupMembershipFor');
const search                            = require('./internal/service.search');
const truncateLogOutput                 = require('./internal/service.truncateLogOutput');
const pickAttributes                    = require('./internal/service.pickAttributes');
const getRequiredLdapAttributesForUser  = require('./internal/service.getRequiredLdapAttributesForUser');
const isGroupResult                     = require('./internal/service.isGroupResult');
const isUserResult                      = require('./internal/service.isUserResult');

const getGroupMembershipForDN           = require('./service.getGroupMembershipForDn');

let log                                 = require('./internal/service.log');
let defaultAttributes                   = require('../configs/config.defaultAttributes');


/**
 * Perform a generic search for the specified LDAP query filter. This function will return both
 * groups and users that match the specified filter. Any results not recognized as a user or group
 * (i.e. computer accounts, etc.) can be found in the 'other' attribute / array of the result.
 *
 * @public
 * @param {Object} [opts] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }. Optionally, if only a string is provided, then the string is assumed to be an LDAP filter.
 * @param {Function} callback The callback to execute when completed. callback(err: {Object}, { users: [ User ], groups: [ Group ], other: [ ] )
 */
function find(opts, callback) {
    var self = this;

    if (typeof (opts) === 'function') {
        callback = opts;
        opts = undefined;
    }
    if (typeof (opts) === 'string') {
        opts = {
            filter: opts
        };
    }
    log.trace('find(%j)', opts);

    var localOpts = _.defaults(_.omit(opts || {}, 'attributes'), {
        scope: 'sub',
        attributes: joinAttributes((opts || {}).attributes || [], defaultAttributes.group || [], defaultAttributes.user || [],
            getRequiredLdapAttributesForGroup(opts), getRequiredLdapAttributesForUser(opts),
            ['objectCategory'])
    });
    search.call(self, localOpts, function onFind(err, results) {
        if (err) {
            if (callback) callback(err);
            return;
        }

        if ((!results) || (results.length === 0)) {
            log.warn('No results found for query "%s"', truncateLogOutput(localOpts.filter));
            if (callback) callback();
            self.emit('done');
            return;
        }

        var result = {
            users: [],
            groups: [],
            other: []
        };

        // Parse the results in parallel.
        async.forEach(results, function (item, asyncCallback) {
            if (isGroupResult(item)) {
                var group = new Group(pickAttributes(item, (opts || {}).attributes || defaultAttributes.group));
                result.groups.push(group);
                // Also retrieving user group memberships?
                if (includeGroupMembershipFor(opts, 'group')) {
                    getGroupMembershipForDN.call(self, opts, group.dn, function (err, groups) {
                        if (err) return (asyncCallback(err));

                        group.groups = groups;
                        self.emit('group', group);
                        asyncCallback();
                    });
                } else {
                    self.emit('group', group);
                    asyncCallback();
                }
            }
            else if (isUserResult(item)) {
                var user = new User(pickAttributes(item, (opts || {}).attributes || defaultAttributes.user));
                result.users.push(user);
                // Also retrieving user group memberships?
                if (includeGroupMembershipFor(opts, 'user')) {
                    getGroupMembershipForDN.call(self, opts, user.dn, function (err, groups) {
                        if (err) return (asyncCallback(err));

                        user.groups = groups;
                        self.emit('user', user);
                        asyncCallback();
                    });
                } else {
                    self.emit('user', user);
                    asyncCallback();
                }
            }
            else {
                var other = pickAttributes(item, (opts || {}).attributes || _.union(defaultAttributes.user, defaultAttributes.group));
                result.other.push(other);
                self.emit('other', other);
                asyncCallback();
            }

        }, function (err) {
            if (err) {
                if (callback) callback(err);
                return;
            }

            log.info('%d group(s), %d user(s), %d other found for query "%s". Results: %j',
                result.groups.length, result.users.length, result.other.length,
                truncateLogOutput(opts.filter), result);
            self.emit('groups', result.groups);
            self.emit('users', result.users);

            if (callback) callback(null, result);
        });
    });
};

module.exports = find;