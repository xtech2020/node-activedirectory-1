const _                                 = require('underscore');
const Group                             = require('../models/group');
const joinAttributes                    = require('./internal/service.joinAttributes');
const getRequiredLdapAttributesForGroup = require('./internal/service.getRequiredLdapAttributesForUser');
const includeGroupMembershipFor         = require('./internal/service.includeGroupMembershipFor');
const search                            = require('./internal/service.search');
const truncateLogOutput                 = require('./internal/service.truncateLogOutput');
const pickAttributes                    = require('./internal/service.pickAttributes');
const getCompoundFilter                 = require('./internal/service.getCompoundFilter');
const isGroupResult                     = require('./internal/service.isGroupResult');
let log                                 = require('./internal/service.log');

const getGroupMembershipForDN           = require('./service.getGroupMembershipForDn');


let defaultAttributes                   = require('../configs/config.defaultAttributes');


/**
 * Perform a generic search for groups that match the specified filter. The default LDAP filter for groups is
 * specified as (&(objectClass=group)(!(objectClass=computer))(!(objectClass=user))(!(objectClass=person)))
 *
 * @public
 * @param {Object} [opts] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }. Optionally, if only a string is provided, then the string is assumed to be an LDAP filter that will be appended as the last parameter in the default LDAP filter.
 * @param {Function} callback The callback to execute when completed. callback(err: {Object}, groups: [ Group ])
 */
function findGroups(opts, callback) {
    var self = this;
    var defaultGroupFilter = '(objectClass=group)(!(objectClass=computer))(!(objectClass=user))(!(objectClass=person))';

    if (typeof (opts) === 'function') {
        callback = opts;
        opts = '';
    }
    if ((typeof (opts) === 'string') && (opts)) {
        opts = {
            filter: '(&' + defaultGroupFilter + getCompoundFilter(opts) + ')'
        };
    }

    log.trace('findGroups(%j)', opts);

    var localOpts = _.defaults(_.omit(opts || {}, 'attributes'), {
        filter: '(&' + defaultGroupFilter + ')',
        scope: 'sub',
        attributes: joinAttributes((opts || {}).attributes || defaultAttributes.group || [], getRequiredLdapAttributesForGroup(opts),
            ['groupType'])
    });
    search.call(self, localOpts, function onSearch(err, results) {
        if (err) {
            if (callback) callback(err);
            return;
        }

        if ((!results) || (results.length === 0)) {
            log.warn('No groups found matching query "%s"', truncateLogOutput(localOpts.filter));
            if (callback) callback();
            return;
        }

        var groups = [];

        return new Promise((resolve, reject) => {
            for(ind in results){
                let result = results[ind];
                if (isGroupResult(results[ind])){
                    var group = new Group(pickAttributes(result, (opts || {}).attributes || defaultAttributes.user));
                    groups.push(group);
                    // Also retrieving user group memberships?
                    if (includeGroupMembershipFor(opts, 'group')) {
                        getGroupMembershipForDN.call(self, opts, group.dn, function (err, groups) {
                            if (err){
                                reject(err);
                                if(callback){
                                    callback(err, null);
                                }                               
                                return;
                            }

                            group.groups = groups;
                            self.emit('group', group);
                        });
                    } else {
                        self.emit('group', group);
                    }
                }                
            }
            if(callback){
                callback(null, groups)
            }
            resolve(groups);
            return;
        });

        // // Parse the results in parallel.
        // async.forEach(results, function (result, asyncCallback) {
        //     if (isGroupResult(result)) {
        //         var group = new Group(pickAttributes(result, (opts || {}).attributes || defaultAttributes.user));
        //         groups.push(group);

        //         // Also retrieving user group memberships?
        //         if (includeGroupMembershipFor(opts, 'group')) {
        //             getGroupMembershipForDN.call(self, opts, group.dn, function (err, groups) {
        //                 if (err) return (asyncCallback(err));

        //                 group.groups = groups;
        //                 self.emit('group', group);
        //                 asyncCallback();
        //             });
        //         }
        //         else {
        //             self.emit('group', group);
        //             asyncCallback();
        //         }
        //     }
        //     else asyncCallback();
        // }, function (err) {
            
        //     f (err) {
        //         if (callback) callback(err);
        //         return;
        //     }

        //     log.info('%d group(s) found for query "%s". Groups: %j', groups.length, truncateLogOutput(localOpts.filter), groups);
        //     self.emit('groups', groups);
        //     if (callback) callback(null, groups);
        // });
    });
};

module.exports = findGroups;