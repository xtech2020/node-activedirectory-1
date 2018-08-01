const _         = require('underscore');
const log       = require('../internal/service.log');

const chunkComplete = function(err) {
    // Remove duplicates
    users = _.uniq(users, function (user) {
        return (user.dn || user);
    });
    log.info('%d user(s) belong in the group "%s"', users.length, groupName);
    if (callback) callback(null, users);
}

module.exports = chunkComplete;