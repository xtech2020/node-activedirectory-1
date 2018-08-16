const _                                 = require('underscore');
const createClient                      = require('./internal/service.createClient');
const hasEvents                         = require('./internal/service.hasEvents');
const log                               = require('./internal/service.log');
/**
 * Retrieves the root DSE for the specified url
 *
 * @public
 * @param {String} url The url to retrieve the root DSE for.
 * @param {Array} [attributes] The optional list of attributes to retrieve. Returns all if not specified.
 * @param {Function} callback The callback to execute when the getRootDSE is completed. callback(err: {Object}, result: {Object})
 */
function getRootDSE(url, attributes, callback) {
    var self = this;
    return new Promise((resolve, reject) => {
        if (typeof (attributes) === 'function') {
            callback = attributes;
            attributes = undefined;
        }
        if (typeof (url) === 'function') {
            callback = url;
            url = self.url || self.opts.url;
            attributes = undefined;
        }
        if (!url) throw new Error('No url specified for the root DSE. Please specify an ldap url in the following format: "ldap://yourdomain.com:389".');
        log.trace('getRootDSE(%s,%j)', url, attributes || ['*']);
    
        /**
         * Inline function handle connection and result errors.
         *
         * @private
         **/
        function onClientError(err) {
            // Ignore ECONNRESET errors
            if ((err || {}).errno !== 'ECONNRESET') {
                log.error('An unhandled error occured when searching for the root DSE at "%s". Error: %j', url, err);
                if (hasEvents.call(self, 'error')) self.emit('error', err)
            }
        }
    
        var client = createClient.call(this, url);
        client.on('error', onClientError);
        // Anonymous bind
        client.bind('', '', function (err) {
            if (err) {
                log.error('Anonymous bind to "%s" failed. Error: %s', url, err);
                if(callback){
                    callback(err, false);
                }
                return reject(err);
            }
    
            client.search('', { scope: 'base', attributes: attributes || ['*'], filter: '(objectClass=*)' }, function (err, result) {
                if (err) {
                    log.error('Root DSE search failed for "%s". Error: %s', url, err);
                    if(callback){
                        callback(err);
                    }
                    return reject(err);
                }
    
                result.on('error', onClientError);
                result.on('end', function (result) {
                    client.unbind();
                });
                result.on('searchEntry', function (entry) {
                    if(callback){
                        callback(null, _.omit(entry.object, 'controls'));
                    }
                    return resolve(_.omit(entry.object, 'controls'));
                });
            });
        });
    });    
};

module.exports = getRootDSE;