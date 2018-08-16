const async                             = require('async');
const _                                 = require('underscore');
const Group                             = require('../models/group');
const joinAttributes                    = require('./internal/service.joinAttributes');
const parseDistinguishedName            = require('./internal/service.parseDistinguishedName');
const search                            = require('./internal/service.search');
const log                                 = require('./internal/service.log');
const isGroupResult                     = require('./internal/service.isGroupResult');


/**
 * Gets all of the groups that the specified distinguishedName (DN) belongs to.
 * 
 * @private
 * @param {Object} [opts] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {String} dn The distinguishedName (DN) to find membership of.
 * @param {Function} callback The callback to execute when completed. callback(err: {Object}, groups: {Array[Group]})
 */

 function getGroupMembershipForDN(opts, dn, stack, callback) {
    var self = this;

    if (typeof (stack) === 'function') {
        callback = stack;
        stack = undefined;
    }
    if (typeof (dn) === 'function') {
        callback = dn;
        dn = opts;
        opts = undefined;
    }
    if (typeof (opts) === 'string') {
        stack = dn;
        dn = opts;
        opts = undefined;
    }
    log.trace('getGroupMembershipForDN(%j,%s,stack:%j)', opts, dn, (stack || []).length);

    // Ensure that a valid DN was provided. Otherwise abort the search.
    if (!dn) {
        var error = new Error('No distinguishedName (dn) specified for group membership retrieval.');
        log.error(error);
        if (hasEvents('error')) self.emit('error', error);
        return (callback(error));
    }

    //  Note: Microsoft provides a 'Transitive Filter' for querying nested groups.
    //        i.e. (member:1.2.840.113556.1.4.1941:=<userDistinguishedName>)
    //        However this filter is EXTREMELY slow. Recursively querying ActiveDirectory
    //        is typically 10x faster.
    opts = _.defaults(_.omit(opts || {}, 'filter', 'scope', 'attributes'), {
        filter: '(member=' + parseDistinguishedName(dn) + ')',
        scope: 'sub',
        attributes: joinAttributes((opts || {}).attributes || defaultAttributes.group, ['groupType'])
    });
    search.call(self, opts, function (err, results) {
        if (err) {
            callback(err);
            return;
        }

        var groups = [];
        async.forEach(results, function (group, asyncCallback) {
            // accumulates discovered groups
            if (typeof (stack) !== 'undefined') {
                if (!_.findWhere(stack, { cn: group.cn })) {
                    stack.push(new Group(group));
                } else {
                    // ignore groups already found
                    return (asyncCallback());
                }

                _.each(stack, function (s) {
                    if (!_.findWhere(groups, { cn: s.cn })) {
                        groups.push(s);
                    }
                });
            }

            if (isGroupResult(group)) {
                log.debug('Adding group "%s" to %s"', group.dn, dn);
                groups.push(new Group(group));

                // Get the groups that this group may be a member of.
                log.debug('Retrieving nested group membership for group "%s"', group.dn);
                getGroupMembershipForDN.call(self, opts, group.dn, groups, function (err, nestedGroups) {
                    if (err) {
                        asyncCallback(err);
                        return;
                    }

                    nestedGroups = _.map(nestedGroups, function (nestedGroup) {
                        if (isGroupResult(nestedGroup)) {
                            return (new Group(nestedGroup));
                        }
                    });
                    log.debug('Group "%s" which is a member of group "%s" has %d nested group(s). Nested: %j',
                        group.dn, dn, nestedGroups.length, _.map(nestedGroups, function (group) {
                            return (group.dn);
                        }));
                    Array.prototype.push.apply(groups, nestedGroups);
                    asyncCallback();
                });
            }
            else asyncCallback();
        }, function (err) {
            if (err) {
                callback(err);
                return;
            }

            // Remove the duplicates from the list.
            groups = _.uniq(_.sortBy(groups, function (group) { return (group.cn || group.dn); }), false, function (group) {
                return (group.dn);
            });

            log.info('Group "%s" has %d group(s). Groups: %j', dn, groups.length, _.map(groups, function (group) {
                return (group.dn);
            }));
            callback(err, groups);
        });
    });
}

module.exports = getGroupMembershipForDN;