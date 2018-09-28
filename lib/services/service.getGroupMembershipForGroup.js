const _                                 = require('underscore');
const Group                             = require('../models/group');

const pickAttributes                    = require('./internal/service.pickAttributes');
const getGroupDistinguishedName         = require('./internal/service.getGroupDistinguishedName');
const getGroupMembershipForDN           = require('./service.getGroupMembershipForDn');
const log                               = require('./internal/service.log');

const defaultAttributes                 = require('../configs/config.defaultAttributes');
const updateBaseDn                      = require('./internal/service.updateBaseDn');

/**
 * For the specified group, get all of the groups that the group is a member of.
 *
 * @public
 * @param {Object} [opts] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {String} groupName The group to retrieve membership information about.
 * @param {Function} [callback] The callback to execute when completed. callback(err: {Object}, groups: {Array[Group]})
 */
function getGroupMembershipForGroup(opts, groupName, callback) {
    var self = this;

    if (typeof (groupName) === 'function') {
        callback = groupName;
        groupName = opts;
        opts = undefined;
    }
    return new Promise((resolve, reject) => {
        log.trace('getGroupMembershipForGroup(%j,%s)', opts, groupName);
        updateBaseDn(self.opts, "group");
        getGroupDistinguishedName.call(self, opts, groupName, function (err, dn) {
            if (err) {
                if (callback){
                    callback(err);
                } 
                return reject(err);
            }
    
            if (!dn) {
                log.warn('Could not find a distinguishedName for the specified group name: "%s"', groupName);
                if (callback){
                    callback(null, []);
                }
                return resolve([]);
            }
            getGroupMembershipForDN.call(self, opts, dn, function (err, groups) {
                if (err) {
                    if (callback){
                        callback(err);
                    }
                    return reject(err);
                }
    
                var results = [];
                _.each(groups, function (group) {
                    var result = new Group(pickAttributes(group, (opts || {}).attributes || defaultAttributes.group));
                    self.emit(result);
                    results.push(result);
                });
                if (callback){
                    callback(null, results);
                }
                return resolve(results);
            });
        });
    });
   
};


module.exports = getGroupMembershipForGroup;