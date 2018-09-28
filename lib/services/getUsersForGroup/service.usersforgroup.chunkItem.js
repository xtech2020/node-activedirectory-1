

const _                                 = require('underscore');
const parseDistinguishedName            = require('../internal/service.parseDistinguishedName');
const joinAttributes                    = require('../internal/service.joinAttributes');
const getRequiredLdapAttributesForUser  = require('../internal/service.getRequiredLdapAttributesForUser');
const search                            = require('../internal/service.search');
const pickAttributes                    = require('../internal/service.pickAttributes');
const User                              = require('../../models/user');
const limitpromises                     = require('limitpromises');
const maxPromiseConfig                  = require('../../configs/config.maxPromiseGroup');
const defaultAttributes                 = require('../../configs/config.defaultAttributes');

const updateBaseDn                      = require('../internal/service.updateBaseDn');

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
        // We need to limit the Searches. Too many of them will cause timeouts. the more calls the more performant
        // but the more risk you'll get timeout errors
        
        let searchResults = limitpromises(() => {
            return new Promise(async (resolve, reject) => {
                
                updateBaseDn(self, 'user');
                let users = await search.call(self, localOpts);
                updateBaseDn(self, 'group');
                let groups = await search.call(self, localOpts);

                Promise.all([users, groups]).then(data => {
                    let members = [].concat(data[0], data[1]);
                    return resolve(members);
                }, err => {
                    return reject(err);
                })
                search.call(self, localOpts, function onSearch(err, members){
                    if(err){
                        return reject(err)
                    }
                    return resolve(members)
                });
            })
        }, [members], maxPromiseConfig.chunksItems, "members", {
            Reject : {
                rejectBehaviour : "retry",
                retryAttempts : 15
            },
            // Timeout : {
            //     timeoutBehaviour : "retry",
            //     timeoutMillis : 300,
            //     retryAttempts : 10
            // },
            // Reject : {
            //     rejectBehaviour : "none"
            // }
        });
        


        Promise.all(searchResults.map(res => {return res.result})).then(async Members =>{
            Members = Members[0];
            let nestedUsersArr = [];
            for(let member of Members){
                if(member){        
                    if(!member.groupType){
                        let user = new User(pickAttributes(member, (opts || {}).attributes || defaultAttributes.user));
                        self.emit(user);
                        users.push(user);                      
                    } else {
                        let nestedUsers = self.getUsersForGroup(opts, member.cn);
                        nestedUsersArr.push(nestedUsers);
                    }
                }
            }
            Promise.all(nestedUsersArr).then(AllNestedUsers => {
                for(let i in AllNestedUsers){
                    users = [].concat(users, AllNestedUsers[i]);
                }
                return resolve(users);
            }, err => {
                return reject(err)
            });
           
        }, err => {
            return reject(err);
        });

        
    });  
}

module.exports = chunkItem;