const log           = require('../service.log');
/**
 * Occurs when a client / search error occurs.
 * @param {Object} err The error object or string.
 * @param {Object} client The LDAP Client
 * @param {Date} searchStarted The Date when the search was initiated
 * @param {String} baseDN
 * @param {Object} opts Options
 * @param {Function} resolve Resolve the search request
 * @param {Function} reject reject the search request
 * @param {Object} res The optional server response.
 * 
 * @returns {void}
 */

function onClientError(err, client, searchStarted, baseDN, opts, results, resolve, reject) {
    // let ignoreError = false;
    
    if ((err || {}).name === 'SizeLimitExceededError') {
        onSearchEnd(client, baseDN, opts, results, resolve, reject);
        return;
    }

    if((err || {}).errno === 'ETIMEDOUT'){
        err.timeoutAfter = (new Date() - searchStarted);
    }
    // Ignore ECONNRESET Errors from client
    if((err || {}).errno ==='ECONNRESET'){
        // ignoreError = true;
    }
    if(client.connected) {
        client.unbind(() => {
            // log.error(err, '[%s] An error occurred performing the requested LDAP search on %s (%j)',
            //     (err || {}).errno || 'UNKNOWN', baseDN, opts);
                return reject(err);
        });
    } else {
        return reject(err);
    }
    
    
}

module.exports = onClientError;