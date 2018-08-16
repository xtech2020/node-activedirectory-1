const _                                 = require('underscore');
const User                              = require('../models/user');
const joinAttributes                    = require('./internal/service.joinAttributes');
const includeGroupMembershipFor         = require('./internal/service.includeGroupMembershipFor');
const search                            = require('./internal/service.search');
const truncateLogOutput                 = require('./internal/service.truncateLogOutput');
const pickAttributes                    = require('./internal/service.pickAttributes');
const getRequiredLdapAttributesForUser  = require('./internal/service.getRequiredLdapAttributesForUser');
const getCompoundFilter                 = require('./internal/service.getCompoundFilter');
const isUserResult                      = require('./internal/service.isUserResult');
const getGroupMembershipForDN           = require('./service.getGroupMembershipForDn');

let log                                 = require('./internal/service.log');
let defaultAttributes                   = require('../configs/config.defaultAttributes');

/**
 * Perform a generic search for users that match the specified filter. The default LDAP filter for users is
 * specified as (&(|(objectClass=user)(objectClass=person))(!(objectClass=computer))(!(objectClass=group)))
 *
 * @public
 * @param {Object} [opts] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }. Optionally, if only a string is provided, then the string is assumed to be an LDAP filter that will be appended as the last parameter in the default LDAP filter.
 * @param {Boolean} [includeMembership] OBSOLETE; NOT NOT USE. Indicates if the results should include group memberships for the user. Defaults to false.
 * @param {Function} callback The callback to execute when completed. callback(err: {Object}, users: [ User ])
 */
function findUsers(opts, includeMembership, callback) {
    var self = this;
    var defaultUserFilter = '(|(objectClass=user)(objectClass=person))(!(objectClass=computer))(!(objectClass=group))';
    return new Promise((resolve, reject) => {
        if (typeof (includeMembership) === 'function') {
            callback = includeMembership;
            includeMembership = false;
        }
        if (typeof (opts) === 'function') {
            callback = opts;
            opts = '';
        }
        if ((typeof (opts) === 'string') && (opts)) {
            opts = {
                filter: '(&' + defaultUserFilter + getCompoundFilter(opts) + ')'
            };
        }
        log.trace('findUsers(%j,%s)', opts, includeMembership);

        var localOpts = _.defaults(_.omit(opts || {}, 'attributes'), {
            filter: '(&' + defaultUserFilter + ')',
            scope: 'sub',
            attributes: joinAttributes((opts || {}).attributes || defaultAttributes.user || [],
                getRequiredLdapAttributesForUser(opts), ['objectCategory'])
        });
        search.call(self, localOpts, function onSearch(err, results) {
            if (err) {
                if (callback){
                    callback(err);
                } 
                return reject(err);
            }

            if ((!results) || (results.length === 0)) {
                log.warn('No users found matching query "%s"', truncateLogOutput(localOpts.filter));
                if (callback){
                    callback();
                } 
                return resolve([]);
            }

            var users = [];

            
            for(ind in results){
                var result = results[ind];
                if(isUserResult(result)) {
                    var user = new User(pickAttributes(result, (opts || {}).attributes|| defaultAttributes.user));
                    users.push(user);

                    // Also retrieving user group memberships?
                    if (includeGroupMembershipFor(opts, 'user') || includeMembership) {
                        getGroupMembershipForDN.call(self, opts, user.dn, function (err, groups) {
                            if (err){
                                if(callback){
                                    callback(err, null);
                                }
                                return reject(err)
                            }

                            user.groups = groups;
                            self.emit('user', user);
                        });
                    }
                    else {
                        self.emit('user', user);
                    }
                }               
            }
            if(callback){
                callback(null, users);
            }
            return resolve(users)
        });
        // // Parse the results in parallel.
        // async.forEach(results, function (result, asyncCallback) {
        //     if (isUserResult(result)) {
        //         var user = new User(pickAttributes(result, (opts || {}).attributes || defaultAttributes.user));
        //         users.push(user);

        //         // Also retrieving user group memberships?
        //         if (includeGroupMembershipFor(opts, 'user') || includeMembership) {
        //             getGroupMembershipForDN.call(self, opts, user.dn, function (err, groups) {
        //                 if (err) return (asyncCallback(err));

        //                 user.groups = groups;
        //                 self.emit('user', user);
        //                 asyncCallback();
        //             });
        //         }
        //         else {
        //             self.emit('user', user);
        //             asyncCallback();
        //         }
        //     }
        //     else asyncCallback();
        // }, function (err) {
        //     if (err) {
        //         if (callback) callback(err);
        //         return;
        //     }

        //     log.info('%d user(s) found for query "%s". Users: %j', users.length, truncateLogOutput(opts.filter), users);
        //     self.emit('users', users);
        //     if (callback) callback(null, users);
        // });
    });
};

module.exports = findUsers;