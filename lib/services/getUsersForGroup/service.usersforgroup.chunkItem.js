

const _                                 = require('underscore');
const parseDistinguishedName            = require('../internal/service.parseDistinguishedName');
const joinAttributes                    = require('../internal/service.joinAttributes');
const getRequiredLdapAttributesForUser  = require('../internal/service.getRequiredLdapAttributesForUser');
const search                            = require('../internal/service.search');
const pickAttributes                    = require('../internal/service.pickAttributes');
const User                              = require('../../models/user');

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
        search.call(self, localOpts, (err, members) => {
            if (err) {
                reject(err);
            }
            let usersResolved = [];
            for(index in members){
                let member = members[index];
                
                let resolvable = getResolvable();
                usersResolved.push(resolvable);

                if(!member.groupType){
                    let user = new User(pickAttributes(member, (opts || {}).attributes || defaultAttributes.user));
                    self.emit(user);
                    users.push(user);
                    resolvable.resolveProm();
                } else {
                    self.getUsersForGroup(opts, member.cn).then((nestedUsers) => {
                        users = [].concat(users,nestedUsers);
                        resolvable.resolveProm();
                    }, err => {
                        reject(err);
                    });
                }
            }
            Promise.all(usersResolved.map(userResolved => {return userResolved.prom})).then(() => {
                resolve(users);
            }, err => {
                reject(err);
            });
            
        });
    });  
}

const getResolvable = () => {
    let resolveProm;
    let prom = new Promise((resolve, reject) => {
        resolveProm = resolve;    
    });
    return { resolveProm, prom }
}

module.exports = chunkItem;