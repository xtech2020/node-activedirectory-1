const _                                 = require('underscore');
const Group                             = require('../models/group');
const joinAttributes                    = require('./internal/service.joinAttributes');
const getRequiredLdapAttributesForGroup = require('./internal/service.getRequiredLdapAttributesForUser');
const includeGroupMembershipFor         = require('./internal/service.includeGroupMembershipFor');
const search                            = require('./internal/service.search');
const truncateLogOutput                 = require('./internal/service.truncateLogOutput');
const pickAttributes                    = require('./internal/service.pickAttributes');
const getGroupQueryFilter               = require('./internal/service.getGroupQueryFilter');
const getGroupMembershipForDN           = require('./service.getGroupMembershipForDn');

const updateBaseDn              	    = require('ad-promise/lib/services/internal/service.updateBaseDn');

const log                                = require('./internal/service.log');
let defaultAttributes                  = require('../configs/config.defaultAttributes');


/**
 * Retrieves the specified group.
 *
 * @public
 * @param {Object} [opts] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {String} groupName The group (cn) to retrieve information about. Optionally can pass in the distinguishedName (dn) of the group to retrieve.
 * @param {Function} callback The callback to execute when completed. callback(err: {Object}, group: {Group})
 */
function findGroup(opts, groupName, callback) {
    if (typeof (groupName) === 'function' || !groupName) {
        callback = groupName;
        groupName = opts;
        opts = undefined;
    }
    if (typeof (opts) === 'string') {
        groupName = opts;
        opts = undefined;
    }
    var self = this;
    return new Promise((resolve, reject) => {
        
        log.trace('findGroup(%j,%s)', opts, groupName);
    
        var localOpts = _.defaults(_.omit(opts || {}, 'attributes'), {
            filter: getGroupQueryFilter.call(self, groupName),
            scope: 'sub',
            attributes: joinAttributes((opts || {}).attributes || defaultAttributes.group, getRequiredLdapAttributesForGroup(opts))
        });
        updateBaseDn(self, 'group');
        search.call(self, localOpts, function onSearch(err, results) {
            // Ignore ECONNRESET ERRORS
            if (err) {
                if((err || {}).errno !== 'ECONNRESET'){
                    if(callback){
                        callback(err);
                    }
                    return reject(err);
                }
            }
    
            if ((!results) || (results.length === 0)) {
                log.warn('Group "%s" not found for query "%s"', groupName, truncateLogOutput(localOpts.filter));
                if (callback){
                    callback(null, {});
                } 
                return resolve({});
            }
    
            var group = new Group(pickAttributes(results[0], (opts || {}).attributes || defaultAttributes.group));
            log.info('%d group(s) found for query "%s". Returning first group: %j',
                results.length, truncateLogOutput(localOpts.filter), group);
            // Also retrieving user group memberships?
            if (includeGroupMembershipFor(opts, 'group')) {
                getGroupMembershipForDN.call(self, opts, group.dn, function (err, groups) {
                    if (err) {
                        if (callback){
                            callback(err);
                        } 
                        return reject(err);
                    }
    
                    group.groups = groups;
                    self.emit('group', group);
                    if (callback){
                        callback(null, group);
                    }
                    return resolve(group);
                });
            }
            else {
                self.emit('group', group);
                if(err){
                    if (callback){
                        callback(err, group);
                    }
                    return reject(err);                
                }
                if(callback){
                    callback(null, group);
                }
                return resolve(group);                
            }
        });
    });    
};

module.exports = findGroup;