var _                                   = require('underscore');
const log                               = require('./internal/service.log');
const joinAttributes                    = require('./internal/service.joinAttributes');

const chunkItem                         = require('./getUsersForGroup/service.usersforgroup.chunkItem');

const defaultPageSize                   = 1000; // The maximum number of results that AD will return in a single call. Default=1000
const defaultAttributes                 = require('../configs/config.defaultAttributes');
const limitPromises                       = require('limitpromises');
const maxPromiseConfig                  = require('../configs/config.maxPromiseGroup');

/**
 * For the specified group, retrieve all of the users that belong to the group.
 *
 * @public
 * @param {Object} [opts] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {String} groupName The name of the group to retrieve membership from.
 * @param {Function} callback The callback to execute when completed. callback(err: {Object}, users: {Array[User]})
 */
async function getUsersForGroup(opts, groupName, callback) {
    var self = this;
    return new Promise((resolve, reject) => {
        if (typeof (groupName) === 'function') {
            callback = groupName;
            groupName = opts;
            opts = undefined;
        }
        log.trace('getUsersForGroup(%j,%s)', opts, groupName);
    
        let result = [];
    
        self.findGroup(_.defaults({}, _.omit(opts || {}, 'attributes'), {
            attributes: joinAttributes((opts || {}).attributes || defaultAttributes.group, ['member'])
        }), groupName).then(async function (group) {
            // Group not found
            if (!group) {
                if (callback) callback(null, group);
                resolve(group);
                return;
            }
            // If only one result found, encapsulate result into array.
            if (typeof (group.member) === 'string') {
                group.member = [group.member];
            }

            /**
             * Breaks the large array into chucks of the specified size.
             * @param {Array} arr The array to break into chunks
             * @param {Number} chunkSize The size of each chunk.
             * @returns {Array} The resulting array containing each chunk
             */
            function chunk(arr, chunkSize) {
                var result = [];
                for (var index = 0, length = arr.length; index < length; index += chunkSize) {
                    result.push(arr.slice(index, index + chunkSize));
                }
                return (result);
            }

            // We need to break this into the default size queries so
            // we can have them running concurrently.
            var chunks = chunk(group.member || [], defaultPageSize);
            if (chunks.length > 1) {
                log.debug('Splitting %d member(s) of "%s" into %d parallel chunks',
                    (group.member || []).length, groupName, chunks.length);
            }

            // Chunks represent the cn for each user;
            // We use the limitPromises Function which will limit the number of promises running at the same time.
            // This is necessary to avoid that the socket of the AD is in use and thus cannot be accessed
            if(!chunks || chunks.length === 0) return resolve([]);
            let allChunks = limitPromises(Chunk => {
                return new Promise((resolve, reject) => {
                    chunkItem(Chunk, opts, self).then(members => {
                        resolve(result.concat(members));
                    }, err => {
                        if(callback){
                            callback(err);
                        }
                        return reject(err);                      
                    });
                });
            }, chunks, maxPromiseConfig.chunks, "chunks");
            

            // Wait for all the chunks to be ready then send the result back;
            await Promise.all(allChunks.map(Chunk => {
                return Chunk.promiseFunc
            })).then(data => {
                if(callback){
                    if(data.length === 0){
                        callback(null, []);
                    } else {
                        callback(null, data[0]);
                    }                        
                }
                return data.length === 0 ? resolve([]) : resolve(data[0]);
            }, err => {
                return reject(err);
            });
        }, err => {
            
            if (callback) callback(err);
            return reject(err);
        
        });
    });
    
};

module.exports = getUsersForGroup;