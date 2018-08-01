const _                                 = require('underscore');
const log                               = require('./service.log');
const parseDistinguishedName            = require('./service.parseDistinguishedName');
const search                            = require('./service.search');
const RangeRetrievalSpecifierAttribute  = require('../../client/rangeretrievalspecifierattribute');


/**
 * Handles any attributes that might have been returned with a range= specifier.
 *
 * @private
 * @param {Object} result The entry returned from the query.
 * @param {Object} opts The original LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {Function} callback The callback to execute when completed. callback(err: {Object}, result: {Object}})
 */
const parseRangeAttributes = function(result, opts, callback) {
    log.trace('parseRangeAttributes(%j,%j)', result, opts);
    var self = this;

    // Check to see if any of the result attributes have range= attributes.
    // If not, return immediately.
    if (!RangeRetrievalSpecifierAttribute.prototype.hasRangeAttributes(result)) {
        callback(null, result);
        return;
    }

    // Parse the range attributes that were provided. If the range attributes are null
    // or indicate that the range is complete, return the result.
    var rangeAttributes = RangeRetrievalSpecifierAttribute.prototype.getRangeAttributes(result);
    if ((!rangeAttributes) || (rangeAttributes.length <= 0)) {
        callback(null, result);
        return;
    }

    // Parse each of the range attributes. Merge the range attributes into
    // the properly named property.
    var queryAttributes = [];
    _.each(rangeAttributes, function (rangeAttribute, index) {
        // Merge existing range into the properly named property.
        if (!result[rangeAttribute.attributeName]) result[rangeAttribute.attributeName] = [];
        Array.prototype.push.apply(result[rangeAttribute.attributeName], result[rangeAttribute.toString()]);
        delete (result[rangeAttribute.toString()]);

        // Build our ldap query attributes with the proper attribute;range= tags to
        // get the next sequence of data.
        var queryAttribute = rangeAttribute.next();
        if ((queryAttribute) && (!queryAttribute.isComplete())) {
            queryAttributes.push(queryAttribute.toString());
        }
    });

    // If we're at the end of the range (i.e. all items retrieved), return the result.
    if (queryAttributes.length <= 0) {
        log.debug('All attribute ranges %j retrieved for %s', rangeAttributes, result.dn);
        callback(null, result);
        return;
    }

    log.debug('Attribute range retrieval specifiers %j found for "%s". Next range: %j',
        rangeAttributes, result.dn, queryAttributes);
    // Execute the query again with the query attributes updated.
    opts = _.defaults({
        filter: '(distinguishedName=' + parseDistinguishedName(result.dn) + ')',
        attributes: queryAttributes
    }, opts);
    search.call(self, opts, function onSearch(err, results) {
        if (err) {
            callback(err);
            return;
        }

        // Should be only one result
        var item = (results || [])[0];
        for (var property in item) {
            if (item.hasOwnProperty(property)) {
                if (!result[property]) result[property] = [];
                if (_.isArray(result[property])) {
                    Array.prototype.push.apply(result[property], item[property]);
                }
            }
        }
        callback(null, result);
    });
}

module.exports = parseRangeAttributes;