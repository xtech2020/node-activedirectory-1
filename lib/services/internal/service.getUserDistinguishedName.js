const isDistinguishedName               = require('./service.isDistinguishedName');
const getUserQueryFilter                = require('./service.getUserQueryFilter');
const getDistinguishedNames             = require('./service.getDistinguishedNames');
const log                               = require('./service.log');


/**
 * Gets the distinguished name for the specified user (userPrincipalName/email or sAMAccountName).
 *
 * @private
 * @param {Object} [opts] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {String} username The name of the username to retrieve the distinguishedName (dn).
 * @param {Function} callback The callback to execute when completed. callback(err: {Object}, dn: {String})
 */
function getUserDistinguishedName(opts, username, callback) {
    var self = this;

    if (typeof (username) === 'function') {
        callback = username;
        username = opts;
        opts = undefined;
    }
    log.trace('getDistinguishedName(%j,%s)', opts, username);

    // Already a dn?
    if (isDistinguishedName.call(self, username)) {
        log.debug('"%s" is already a distinguishedName. NOT performing query.', username);
        callback(null, username);
        return;
    }

    getDistinguishedNames.call(self, opts, getUserQueryFilter(username), function (err, dns) {
        if (err) {
            callback(err);
            return;
        }

        log.info('%d distinguishedName(s) found for user: "%s". Returning first dn: "%s"',
            (dns || []).length, username, (dns || [])[0]);
        callback(null, (dns || [])[0]);
    });
}

module.exports = getUserDistinguishedName;