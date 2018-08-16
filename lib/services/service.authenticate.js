

const util                              = require('util');
const createClient                      = require('./internal/service.createClient');
const hasEvents                         = require('./internal/service.hasEvents');
const log                               = require('./internal/service.log');
const isPasswordLoggingEnabled          = false;

/**
 * Attempts to authenticate the specified username / password combination.
 *
 * @public
 * @param {String} username The username to authenticate.
 * @param {String} password The password to use for authentication.	
 * @param {Function} callback The callback to execute when the authenication is completed. callback(err: {Object}, authenticated: {Boolean})
 */
function authenticate(username, password, callback) {
    var self = this;
    log.trace('authenticate(%j,%s)', username, isPasswordLoggingEnabled ? password : '********');

    // Skip authentication if an empty username or password is provided.
    if ((!username) || (!password)) {
        var err = {
            'code': 0x31,
            'errno': 'LDAP_INVALID_CREDENTIALS',
            'description': 'The supplied credential is invalid'
        };
        return (callback(err, false));
    }

    var errorHandled = false;
    function handleError(err) {
        if (!errorHandled) {
            errorHandled = true;
            if (hasEvents.call(self, 'error')) self.emit('error', err);
            return (callback(err, false));
        }
    }

    var client = createClient.call(self);
    client.on('error', handleError);
    client.bind(username, password, function (err) {
        client.unbind();
        var message = util.format('Authentication %s for "%s" as "%s" (password: "%s")',
            err ? 'failed' : 'succeeded',
            self.opts.url, username, isPasswordLoggingEnabled ? password : '********');
        if (err) {
            log.warn('%s. Error: %s', message, err);
            return (handleError(err));
        }

        log.info(message);
        return (callback(err, true));
    });
};

module.exports = authenticate;