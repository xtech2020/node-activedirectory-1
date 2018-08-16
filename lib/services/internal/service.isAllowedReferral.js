const _                                             = require('underscore');
let log                                             = require('./service.log');
let defaultReferrals = originalDefaultReferrals     = require('../../configs/config.defaultReferrals');


/**
 * Checks to see if the specified referral or "chase" is allowed.
 * @param {String} referral The referral to inspect.
 * @returns {Boolean} True if the referral should be followed, false if otherwise.
 */
function isAllowedReferral(referral) {
    log.trace('isAllowedReferral(%j)', referral);
    if (!defaultReferrals.enabled) return (false);
    if (!referral) return (false);

    return (!_.any(defaultReferrals.exclude, function (exclusion) {
        var re = new RegExp(exclusion, "i");
        return (re.test(referral));
    }));
}

module.exports = isAllowedReferral;