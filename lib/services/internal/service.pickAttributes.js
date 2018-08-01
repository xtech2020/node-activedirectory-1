const _                             = require('underscore');
const shouldIncludeAllAttributes    = require('./service.shouldIncludeAllAttributes');

/**
 * Picks only the requested attributes from the ldap result. If a wildcard or
 * empty result is specified, then all attributes are returned.
 * @private
 * @params {Object} result The ldap result
 * @params {Array} attributes The desired or wanted attributes
 * @returns {Object} A copy of the object with only the requested attributes
 */
const pickAttributes = (result, attributes) => {
    if (shouldIncludeAllAttributes(attributes)) {
        attributes = function () {
            return (true);
        };
    }
    return (_.pick(result, attributes));
}

module.exports = pickAttributes;