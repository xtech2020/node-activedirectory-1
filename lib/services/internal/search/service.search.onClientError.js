const log           = require('../service.log');
/**
 * Occurs when a client / search error occurs.
 * @param {Object} err The error object or string.
 * @param {Object} client The LDAP Client
 * @param {Date} searchStarted The Date when the search was initiated
 * @param {String} baseDN
 * @param {Object} res The optional server response.
 */

function onClientError(err, client, searchStarted, baseDN, opts, callback, resolve, reject, SentBy) {
    let ignoreError = false;
    
    if ((err || {}).name === 'SizeLimitExceededError') {
        onSearchEnd(resolve, reject);
        return;
    }

    if((err || {}).errno === 'ETIMEDOUT'){
        err.timeoutAfter = (new Date() - searchStarted);
    }
    // Ignore ECONNRESET Errors from client
    if((err || {}).errno ==='ECONNRESET'){
        ignoreError = true;
    }

    client.unbind();
    log.error(err, '[%s] An error occurred performing the requested LDAP search on %s (%j)',
        (err || {}).errno || 'UNKNOWN', baseDN, opts);
    if(ignoreError){
        if (callback){
            callback(err);
        } 
        if(reject){
            reject(err);
        }
    }            
    return;
}

module.exports = onClientError;