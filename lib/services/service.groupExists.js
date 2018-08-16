
/**
 * Checks to see if the specified group exists.
 *
 * @param {Object} [opts] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {String} groupName The group to check to see if it exists.
 * @param {Function} callback The callback to execute when completed. callback(err: {Object}, result: {Boolean})
 */
function groupExists(opts, groupName, callback) {
    var self = this;
    return new Promise((resolve, reject) => {
        if (typeof (groupName) === 'function') {
            callback = groupName;
            groupName = opts;
            opts = undefined;
        }
        log.trace('groupExists(%j,%s)', opts, groupName);
    
        self.findGroup(opts, groupName, function (err, result) {
            if (err) {
                if(callback){
                    callback(err);
                }
                return reject(err);
            }
    
            log.info('"%s" %s exist.', groupName, (result != null) ? 'DOES' : 'DOES NOT');
            if(callback){
                callback(null, result != null);
            }
            return resolve(result != null);
        });
    });   
};

module.exports = groupExists;