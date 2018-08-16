const isDistinguishedName               = require('./service.isDistinguishedName');
const getGroupQueryFilter               = require('./service.getGroupQueryFilter');
const getDistinguishedNames             = require('./service.getDistinguishedNames');
const log                               = require('./service.log');
/**
 * Gets the distinguished name for the specified group (cn).
 *
 * @private
 * @param {Object} [opts] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {String} groupName The name of the group to retrieve the distinguishedName (dn).
 * @param {Function} callback The callback to execute when completed. callback(err: {Object}, dn: {String})
 */
function getGroupDistinguishedName(opts, groupName, callback) {
    var self = this;

    if (typeof (groupName) === 'function') {
        callback = groupName;
        groupName = opts;
        opts = undefined;
    }
    log.trace('getGroupDistinguishedName(%j,%s)', opts, groupName);

    // Already a dn?
    if (isDistinguishedName.call(self, groupName)) {
        log.debug('"%s" is already a distinguishedName. NOT performing query.', groupName);
        callback(null, groupName);
        return;
    }

    getDistinguishedNames.call(self, opts, getGroupQueryFilter(groupName), function (err, dns) {
        if (err) {
            callback(err);
            return;
        }

        log.info('%d distinguishedName(s) found for group "%s". Returning first dn: "%s"',
            (dns || []).length, groupName, (dns || [])[0]);
        callback(null, (dns || [])[0]);
    });
}


module.exports = getGroupDistinguishedName;