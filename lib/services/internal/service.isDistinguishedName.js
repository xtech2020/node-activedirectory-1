const log   = require('./service.log');
const re    = require('../../configs/config.re');

/**
 * Checks to see if the value is a distinguished name.
 *
 * @private
 * @param {String} value The value to check to see if it's a distinguished name.
 * @returns {Boolean}
 */
function isDistinguishedName(value) {
    log.trace('isDistinguishedName(%s)', value);
    if ((!value) || (value.length === 0)) return (false);
    re.isDistinguishedName.lastIndex = 0; // Reset the regular expression
    return (re.isDistinguishedName.test(value));
}

module.exports = isDistinguishedName;