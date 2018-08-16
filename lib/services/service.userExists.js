
/**
 * Checks to see if the specified username exists.
 *
 * @param {Object} [opts] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {String} username The username to check to see if it exits.
 * @param {Function} callback The callback to execute when completed. callback(err: {Object}, result: {Boolean})
 */
function userExists(opts, username, callback) {
    var self = this;
    return new Promise((resolve, reject) => {
        if (typeof (username) === 'function') {
            callback = username;
            username = opts;
            opts = undefined;
        }
        log.trace('userExists(%j,%s)', opts, username);
    
        self.findUser(opts, username, function (err, user) {
            if (err) {
                if(callback){
                    callback(err);
                }                
                return reject(err);
            }
    
            log.info('"%s" %s exist.', username, (user != null) ? 'DOES' : 'DOES NOT');
            if(callback){
                callback(null, user != null);
            }
            return resolve(user != null);
        });
    });    
};

module.exports = userExists;