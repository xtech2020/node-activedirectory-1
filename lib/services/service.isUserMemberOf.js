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
        if (typeof (groupName) === 'function' || !groupName) {
            callback = groupName;
            groupName = username;
            username = opts;
            opts = undefined;
        }
        log.trace('isUserMemberOf(%j,%s,%s)', opts, username, groupName);
    
        opts = _.defaults(_.omit(opts || {}, 'attributes'), {
            attributes: ['cn', 'dn']
        });
        let usersOfGroup    = self.getUsersForGroup(opts, groupName);
        let user            = self.findUser(opts, username);

        Promise.all([usersOfGroup, user]).then(data => {
            let usersOfGroup = data[0];
            let user = data[1];
            
            if(usersOfGroup.map(userOfGroup => {
                return userOfGroup.dn;
            }).indexOf(user.dn) !== -1){
                if(callback){
                    callback(null, true);
                }
                return resolve(true); 
            } else {
                log.info('"%s" IS NOT a member of "%s". No groups found for user.', username, groupName);
                if(callback){
                    callback(null, false);
                }
                return resolve(false);
            }
        }, err => {
            if(callback){
                callback(err);
            }                
            return reject(err);
        });
    });    
};

module.exports = isUserMemberOf;