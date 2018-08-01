var async                               = require('async');
var _                                   = require('underscore');
const log                               = require('./internal/service.log');
const joinAttributes                    = require('./internal/service.joinAttributes');

const chunkItem                         = require('./getUsersForGroup/service.usersforgroup.chunkItem');
const chunkComplete                     = require('./getUsersForGroup/service.usersforgroup.chunkComplete');

const defaultPageSize                   = 1000; // The maximum number of results that AD will return in a single call. Default=1000
const defaultAttributes                 = require('../configs/config.defaultAttributes');

/**
 * For the specified group, retrieve all of the users that belong to the group.
 *
 * @public
 * @param {Object} [opts] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {String} groupName The name of the group to retrieve membership from.
 * @param {Function} callback The callback to execute when completed. callback(err: {Object}, users: {Array[User]})
 */
const getUsersForGroup = function(opts, groupName, callback) {
    var self = this;
    return new Promise((resolve, reject) => {
        if (typeof (groupName) === 'function') {
            callback = groupName;
            groupName = opts;
            opts = undefined;
        }
        log.trace('getUsersForGroup(%j,%s)', opts, groupName);
    
        var users = [];
        var groups = [];
    
        self.findGroup(_.defaults({}, _.omit(opts || {}, 'attributes'), {
            attributes: joinAttributes((opts || {}).attributes || defaultAttributes.group, ['member'])
        }),
            groupName, function (err, group) {
                if (err) {
                    if (callback) callback(err);
                    return;
                }
    
                // Group not found
                if (!group) {
                    if (callback) callback(null, group);
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
                for (index in chunks){
                    chunkItem(chunks[index], opts, self).then(members => {
                        resolve(members);
                        callback(null, members);
                        return;
                    }, err => {
                        callback(err);
                        return;
                    });
                }
            });
    });
    
};

module.exports = getUsersForGroup;