/**
* Retrieves / merges the attributes for the query.
*/

const shouldIncludeAllAttributes    = require('./service.shouldIncludeAllAttributes');
const _                             = require('underscore');

const joinAttributes = () => {
    for (var index = 0, length = arguments.length; index < length; index++) {
        if (shouldIncludeAllAttributes(arguments[index])) {
            return ([]);
        }
    }
    return (_.union.apply(this, arguments));
}

module.exports = joinAttributes;