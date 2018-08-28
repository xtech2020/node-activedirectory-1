const _     = require('underscore');
let log     = require('./internal/service.log');
/**
 * Checks to see if the specified user is a member of the specified group.
 *
 * @param {Object} [opts] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {String} username The username to check for membership.
 * @param {String} groupName The group to check for membership.
 * @param {Function} callback The callback to execute when completed. callback(err: {Object}, result: {Boolean})
 */
function isUserMemberOf(opts, username, groupName, callback) {
    var self = this;

    return new Promise((resolve, reject) => {
        if (typeof (groupName) === 'function') {
            callback = groupName;
            groupName = username;
            username = opts;
            opts = undefined;
        }
        log.trace('isUserMemberOf(%j,%s,%s)', opts, username, groupName);
    
        opts = _.defaults(_.omit(opts || {}, 'attributes'), {
            attributes: ['cn', 'dn']
        });
        self.getGroupMembershipForUser(opts, username, function (err, groups) {
            if (err) {
                if(callback){
                    callback(err);
                }                
                return reject(err);
            }
            if ((!groups) || (groups.length === 0)) {
                log.info('"%s" IS NOT a member of "%s". No groups found for user.', username, groupName);
                if(callback){
                    callback(null, false);
                }
                return resolve(false);
            }
    
            // Check to see if the group.distinguishedName or group.cn matches the list of
            // retrieved groups.
            var lowerCaseGroupName = (groupName || '').toLowerCase();
            var result = _.any(groups, function (item) {
                return (((item.dn || '').toLowerCase() === lowerCaseGroupName) ||
                    ((item.cn || '').toLowerCase() === lowerCaseGroupName));
            });
            log.info('"%s" %s a member of "%s"', username, result ? 'IS' : 'IS NOT', groupName);
            if(callback){
                callback(null, result);
            }
            return resolve(result);            
        });
    });
    
};

module.exports = isUserMemberOf;