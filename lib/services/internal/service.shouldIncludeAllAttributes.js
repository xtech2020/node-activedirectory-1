/**
 * Checks to see if any of the specified attributes are the wildcard
 * '*" attribute.
 * @private
 * @params {Array} attributes - The attributes to inspect.
 * @returns {Boolean}
 */
const _         = require('underscore');

const shouldIncludeAllAttributes = attributes => {
    return ((typeof (attributes) !== 'undefined') &&
        ((attributes.length === 0) ||
            _.any(attributes || [], function (attribute) {
                return (attribute === '*');
            }))
    );
}

module.exports = shouldIncludeAllAttributes;