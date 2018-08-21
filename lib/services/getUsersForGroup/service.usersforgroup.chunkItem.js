

const _                                 = require('underscore');
const parseDistinguishedName            = require('../internal/service.parseDistinguishedName');
const joinAttributes                    = require('../internal/service.joinAttributes');
const getRequiredLdapAttributesForUser  = require('../internal/service.getRequiredLdapAttributesForUser');
const search                            = require('../internal/service.search');
const pickAttributes                    = require('../internal/service.pickAttributes');
const User                              = require('../../models/user');
const maxPromises                       = require('limitpromises');
const maxPromiseConfig                        = require('../../configs/config.maxPromiseGroup');

const chunkItem = function(members, opts, self) {
    // We're going to build up a bulk LDAP query so we can reduce
    // the number of round trips to the server. We need to get
    // additional details about each 'member' to determine if
    // it is a group or another user. If it's a group, we need
    // to recursively retrieve the members of that group.
    let users = [];
    return new Promise((resolve, reject) => {
        var filter = _.reduce(members || [], function (memo, member, index) {
            return (memo + '(distinguishedName=' + parseDistinguishedName(member) + ')');
        }, '');
        filter = '(&(|(objectCategory=User)(objectCategory=Group))(|' + filter + '))';
    
        var localOpts = {
            filter: filter,
            scope: 'sub',
            attributes: joinAttributes((opts || {}).attributes || defaultAttributes.user || [],
                getRequiredLdapAttributesForUser(opts), ['groupType'])
        };
        search.call(self, localOpts, async function onSearch(err, members){
            if (err) {
                reject(err);
            }
                       
            
            let usersResolved = maxPromises(member => {
                return new Promise( (resolve, reject) => {
                    if(member){        
                        if(!member.groupType){
                            let user = new User(pickAttributes(member, (opts || {}).attributes || defaultAttributes.user));
                            self.emit(user);
                            users.push(user);
                            resolve(user);
                        } else {
                            self.getUsersForGroup(opts, member.cn).then(nestedUsers => {
                                users = [].concat(users,nestedUsers);
                                resolve();
                            }, err => {
                                reject(err);
                            });
                        }
                    }
                }); 
            }, members, 2500, "getChunkItem");

            try{
                await Promise.all(usersResolved.map( userResolved => { return userResolved.promiseFunc }));
                resolve(users);
            } catch(err) {
                reject(err);
            } 
        });
    });  
}

module.exports = chunkItem;