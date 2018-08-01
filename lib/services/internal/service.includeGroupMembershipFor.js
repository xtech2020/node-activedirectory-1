const _                 = require('underscore');

/**
 * Checks to see if group membership for the specified type is enabled.
 *
 * @param {Object} [opts] The options to inspect. If not specified, uses this.opts.
 * @param {String} name The name of the membership value to inspect. Values: (all|user|group)
 * @returns {Boolean} True if the specified membership is enabled.
 */
const includeGroupMembershipFor = function(opts, name){
    if (typeof (opts) === 'string') {
        name = opts;
        opts = this.opts;
    }

    var lowerCaseName = (name || '').toLowerCase();
    return (_.any(((opts || this.opts || {}).includeMembership || []), function (i) {
        i = i.toLowerCase();
        return ((i === 'all') || (i === lowerCaseName));
    }));
}

module.exports = includeGroupMembershipFor;