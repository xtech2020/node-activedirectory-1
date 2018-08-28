const pendingReferrals  = require('./service.search.pendingReferrals');
    
/**
 * Call to remove the specified referral client.
 * @param {Object} client The referral client to remove.
 * @param {Object} 
 */
function removeReferral(client) {
    if (!client) return;

    client.unbind();
    var indexOf = pendingReferrals.indexOf(client);
    if (indexOf >= 0) {
        pendingReferrals.get().splice(indexOf, 1);
    }
}

module.exports = removeReferral;