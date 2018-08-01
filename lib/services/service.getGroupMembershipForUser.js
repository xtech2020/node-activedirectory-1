const _                     = require('underscore');

let log                     = require('./internal/service.log');
const defaultAttributes     = require('../configs/config.defaultAttributes');


/**
 * For the specified username, get all of the groups that the user is a member of.
 *
 * @public
 * @param {Object} [opts] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {String} username The username to retrieve membership information about.
 * @param {Function} [callback] The callback to execute when completed. callback(err: {Object}, groups: {Array[Group]})
 */
const getGroupMembershipForUser = (opts, username, callback) => {
    var self = this;

    if (typeof (username) === 'function') {
        callback = username;
        username = opts;
        opts = undefined;
    }
    log.trace('getGroupMembershipForUser(%j,%s)', opts, username);

    getUserDistinguishedName.call(self, opts, username, function (err, dn) {
        if (err) {
            if (callback) callback(err);
            return;
        }

        if (!dn) {
            log.warn('Could not find a distinguishedName for the specified username: "%s"', username);
            if (callback) callback();
            return;
        }
        getGroupMembershipForDN.call(self, opts, dn, function (err, groups) {
            if (err) {
                if (callback) callback(err);
                return;
            }

            var results = [];
            _.each(groups, function (group) {
                var result = new Group(pickAttributes(group, (opts || {}).attributes || defaultAttributes.group));
                self.emit(result);
                results.push(result);
            });
            if (callback) callback(err, results);
        });
    });
};

module.exports = getGroupMembershipForUser;