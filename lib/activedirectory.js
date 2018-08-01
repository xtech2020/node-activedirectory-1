const events                            = require('events');
const util                              = require('util');
const ldap                              = require('ldapjs');
const async                             = require('async');
const _                                 = require('underscore');
const Url                               = require('url');
const User                              = require('./models/user');
const Group                             = require('./models/group');
const joinAttributes                    = require('./services/internal/service.joinAttributes');
const shouldIncludeAllAttributes        = require('./services/internal/service.shouldIncludeAllAttributes');
const parseDistinguishedName            = require('./services/internal/service.parseDistinguishedName');
const getRequiredLdapAttributesForGroup = require('./services/internal/service.getRequiredLdapAttributesForUser');
const includeGroupMembershipFor         = require('./services/internal/service.includeGroupMembershipFor');
const search                            = require('./services/internal/service.search');
const createClient                      = require('./services/internal/service.createClient');
const getLdapClientOpts                 = require('./services/internal/service.getLdapClientOpts');
const truncateLogOutput                 = require('./services/internal/service.truncateLogOutput');
const getLdapOpts                       = require('./services/internal/service.getLdapOpts');
const pickAttributes                    = require('./services/internal/service.pickAttributes');

const getUsersForGroup                  = require('./services/service.getUsersForGroup');
const getGroupMembershipForUser         = require('./services/service.getGroupMembershipForUser');
const isPasswordLoggingEnabled = false;

let log                                             = require('./services/internal/service.log');
let defaultAttributes, originalDefaultAttributes    = require('./configs/config.defaultAttributes');
let defaultReferrals = originalDefaultReferrals     = require('./configs/config.defaultReferrals');

// Precompile some common, frequently used regular expressions.
var re = {
    'isDistinguishedName': /(([^=]+=.+),?)+/gi,
    'isUserResult': /CN=Person,CN=Schema,CN=Configuration,.*/i,
    'isGroupResult': /CN=Group,CN=Schema,CN=Configuration,.*/i
};

/**
 * Agent for retrieving ActiveDirectory user & group information.
 *
 * @public
 * @constructor
 * @param {Object|String} url The url of the ldap server (i.e. ldap://domain.com). Optionally, all of the parameters can be specified as an object. { url: 'ldap://domain.com', baseDN: 'dc=domain,dc=com', username: 'admin@domain.com', password: 'supersecret', { referrals: { enabled: true }, attributes: { user: [ 'attributes to include in response' ], group: [ 'attributes to include in response' ] } } }. 'attributes' & 'referrals' parameter is optional and only necesary if overriding functionality.
 * @param {String} baseDN The default base container where all LDAP queries originate from. (i.e. dc=domain,dc=com)
 * @param {String} username The administrative username or dn of the user for retrieving user & group information. (i.e. Must be a DN or a userPrincipalName (email))
 * @param {String} password The administrative password of the specified user.
 * @param {Object} defaults Allow for default options to be overridden. { attributes: { user: [ 'attributes to include in response' ], group: [ 'attributes to include in response' ] } }
 * @returns {ActiveDirectory}
 */
var ActiveDirectory = function (url, baseDN, username, password, defaults) {
    if (this instanceof ActiveDirectory) {
        this.opts = {};
        if (typeof (url) === 'string') {
            this.opts.url = url;
            this.baseDN = baseDN;
            this.opts.bindDN = username;
            this.opts.bindCredentials = password;

            if (typeof ((defaults || {}).entryParser) === 'function') {
                this.opts.entryParser = defaults.entryParser;
            }
        }
        else {
            this.opts = _.defaults({}, url);
            this.baseDN = this.opts.baseDN;

            if (!this.opts.bindDN) this.opts.bindDN = this.opts.username;
            if (!this.opts.bindCredentials) this.opts.bindCredentials = this.opts.password;

            if (this.opts.logging) {
                log = bunyan.createLogger(_.defaults({}, this.opts.logging));
                delete (this.opts.logging);
            }
        }

        defaultAttributes = _.extend({}, originalDefaultAttributes, (this.opts || {}).attributes || {}, (defaults || {}).attributes || {});
        defaultReferrals = _.extend({}, originalDefaultReferrals, (this.opts || {}).referrals || {}, (defaults || {}).referrals || {});

        log.info('Using username/password (%s/%s) to bind to ActiveDirectory (%s).', this.opts.bindDN,
            isPasswordLoggingEnabled ? this.opts.bindCredentials : '********', this.opts.url);
        log.info('Referrals are %s', defaultReferrals.enabled ? 'enabled. Exclusions: ' + JSON.stringify(defaultReferrals.exclude) : 'disabled');
        log.info('Default user attributes: %j', defaultAttributes.user || []);
        log.info('Default group attributes: %j', defaultAttributes.group || []);

        // Enable connection pooling
        // TODO: To be disabled / removed in future release of ldapjs > 0.7.1
        if (typeof (this.opts.maxConnections) === 'undefined') {
            this.opts.maxConnections = 20;
        }
        events.EventEmitter.call(this);
    }
    else {
        return (new ActiveDirectory(url, baseDN, username, password, defaults));
    }
};
util.inherits(ActiveDirectory, events.EventEmitter);

/**
 * Expose ldapjs filters to avoid TypeErrors for filters
 * @static
 */
ActiveDirectory.filters = ldap.filters;

/**
 * Truncates the specified output to the specified length if exceeded.
 * @param {String} output The output to truncate if too long
 * @param {Number} [maxLength] The maximum length. If not specified, then the global value maxOutputLength is used.
 */

ActiveDirectory.prototype.getUsersForGroup = getUsersForGroup;
ActiveDirectory.prototype.getGroupMembershipForUser = getGroupMembershipForUser;

/**
 * Checks to see if there are any event emitters defined for the
 * specified event name.
 * @param {String} event The name of the event to inspect.
 * @returns {Boolean} True if there are events defined, false if otherwise.
 */
function hasEvents(event) {
    return (events.EventEmitter.listenerCount(this, event) > 0);
}

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

/**
 * Gets the ActiveDirectory LDAP query string for a user search.
 *
 * @private
 * @param {String} username The samAccountName or userPrincipalName (email) of the user.
 * @returns {String}
 */
function getUserQueryFilter(username) {
    log.trace('getUserQueryFilter(%s)', username);
    var self = this;

    if (!username) return ('(objectCategory=User)');
    if (isDistinguishedName.call(self, username)) {
        return ('(&(objectCategory=User)(distinguishedName=' + parseDistinguishedName(username) + '))');
    }

    return ('(&(objectCategory=User)(|(sAMAccountName=' + username + ')(userPrincipalName=' + username + ')))');
}

/**
 * Gets a properly formatted LDAP compound filter. This is a very simple approach to ensure that the LDAP
 * compound filter is wrapped with an enclosing () if necessary. It does not handle parsing of an existing
 * compound ldap filter.
 * @param {String} filter The LDAP filter to inspect.
 * @returns {String}
 */
function getCompoundFilter(filter) {
    log.trace('getCompoundFilter(%s)', filter);

    if (!filter) return (false);
    if ((filter.charAt(0) === '(') && (filter.charAt(filter.length - 1) === ')')) {
        return (filter);
    }
    return ('(' + filter + ')');
}

/**
 * Gets the ActiveDirectory LDAP query string for a group search.
 *
 * @private
 * @param {String} groupName The name of the group
 * @returns {String}
 */
function getGroupQueryFilter(groupName) {
    log.trace('getGroupQueryFilter(%s)', groupName);
    var self = this;

    if (!groupName) return ('(objectCategory=Group)');
    if (isDistinguishedName.call(self, groupName)) {
        return ('(&(objectCategory=Group)(distinguishedName=' + parseDistinguishedName(groupName) + '))');
    }
    return ('(&(objectCategory=Group)(cn=' + groupName + '))');
}

/**
 * Checks to see if the LDAP result describes a group entry.
 * @param {Object} item The LDAP result to inspect.
 * @returns {Boolean}
 */
function isGroupResult(item) {
    log.trace('isGroupResult(%j)', item);

    if (!item) return (false);
    if (item.groupType) return (true);
    if (item.objectCategory) {
        re.isGroupResult.lastIndex = 0; // Reset the regular expression
        return (re.isGroupResult.test(item.objectCategory));
    }
    if ((item.objectClass) && (item.objectClass.length > 0)) {
        return (_.any(item.objectClass, function (c) { return (c.toLowerCase() === 'group'); }));
    }
    return (false);
}

/**
 * Checks to see if the LDAP result describes a user entry.
 * @param {Object} item The LDAP result to inspect.
 * @returns {Boolean}
 */
function isUserResult(item) {
    log.trace('isUserResult(%j)', item);

    if (!item) return (false);
    if (item.userPrincipalName) return (true);
    if (item.objectCategory) {
        re.isUserResult.lastIndex = 0; // Reset the regular expression
        return (re.isUserResult.test(item.objectCategory));
    }
    if ((item.objectClass) && (item.objectClass.length > 0)) {
        return (_.any(item.objectClass, function (c) { return (c.toLowerCase() === 'user'); }));
    }
    return (false);
}


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

/**
 * For the specified filter, return the distinguishedName (dn) of all the matched entries.
 *
 * @private
 * @param {Object} [opts] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @params {Object|String} filter The LDAP filter to execute. Optionally a custom LDAP query object can be specified. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {Function} callback The callback to execute when completed. callback(err: {Object}, dns: {Array[String]})
 */
function getDistinguishedNames(opts, filter, callback) {
    var self = this;

    if (typeof (filter) === 'function') {
        callback = filter;
        filter = opts;
        opts = undefined;
    }
    if (typeof (opts) === 'string') {
        filter = opts;
        opts = undefined;
    }
    log.trace('getDistinguishedNames(%j,%j)', opts, filter);

    opts = _.defaults(_.omit(opts || {}, 'attributes'), {
        filter: filter,
        scope: 'sub',
        attributes: joinAttributes((opts || {}).attributes || [], ['dn'])
    });
    search.call(self, opts, function (err, results) {
        if (err) {
            if (callback) callback(err);
            return;
        }

        // Extract just the DN from the results
        var dns = _.map(results, function (result) {
            return (result.dn);
        });
        log.info('%d distinguishedName(s) found for LDAP query: "%s". Results: %j',
            results.length, truncateLogOutput(opts.filter), results);
        callback(null, dns);
    });
}

/**
 * Gets the distinguished name for the specified user (userPrincipalName/email or sAMAccountName).
 *
 * @private
 * @param {Object} [opts] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {String} username The name of the username to retrieve the distinguishedName (dn).
 * @param {Function} callback The callback to execute when completed. callback(err: {Object}, dn: {String})
 */
function getUserDistinguishedName(opts, username, callback) {
    var self = this;

    if (typeof (username) === 'function') {
        callback = username;
        username = opts;
        opts = undefined;
    }
    log.trace('getDistinguishedName(%j,%s)', opts, username);

    // Already a dn?
    if (isDistinguishedName.call(self, username)) {
        log.debug('"%s" is already a distinguishedName. NOT performing query.', username);
        callback(null, username);
        return;
    }

    getDistinguishedNames.call(self, opts, getUserQueryFilter(username), function (err, dns) {
        if (err) {
            callback(err);
            return;
        }

        log.info('%d distinguishedName(s) found for user: "%s". Returning first dn: "%s"',
            (dns || []).length, username, (dns || [])[0]);
        callback(null, (dns || [])[0]);
    });
}

/**
 * Gets the distinguished name for the specified group (cn).
 *
 * @private
 * @param {Object} [opts] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {String} groupName The name of the group to retrieve the distinguishedName (dn).
 * @param {Function} callback The callback to execute when completed. callback(err: {Object}, dn: {String})
 */
function getGroupDistinguishedName(opts, groupName, callback) {
    var self = this;

    if (typeof (groupName) === 'function') {
        callback = groupName;
        groupName = opts;
        opts = undefined;
    }
    log.trace('getGroupDistinguishedName(%j,%s)', opts, groupName);

    // Already a dn?
    if (isDistinguishedName.call(self, groupName)) {
        log.debug('"%s" is already a distinguishedName. NOT performing query.', groupName);
        callback(null, groupName);
        return;
    }

    getDistinguishedNames.call(self, opts, getGroupQueryFilter(groupName), function (err, dns) {
        if (err) {
            callback(err);
            return;
        }

        log.info('%d distinguishedName(s) found for group "%s". Returning first dn: "%s"',
            (dns || []).length, groupName, (dns || [])[0]);
        callback(null, (dns || [])[0]);
    });
}

/**
 * Gets the currently configured default attributes
 *
 * @private
 */
ActiveDirectory.prototype._getDefaultAttributes = function _getDefaultAttributes() {
    return (_.defaults({}, defaultAttributes));
};

/**
 * Gets the currently configured default user attributes
 *
 * @private
 */
ActiveDirectory.prototype._getDefaultUserAttributes = function _getDefaultUserAttributes() {
    return (_.defaults({}, (defaultAttributes || {}).user));
};

/**
 * Gets the currently configured default group attributes
 *
 * @private
 */
ActiveDirectory.prototype._getDefaultGroupAttributes = function _getDefaultGroupAttributes() {
    return (_.defaults({}, (defaultAttributes || {}).group));
};




/**
 * For the specified group, get all of the groups that the group is a member of.
 *
 * @public
 * @param {Object} [opts] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {String} groupName The group to retrieve membership information about.
 * @param {Function} [callback] The callback to execute when completed. callback(err: {Object}, groups: {Array[Group]})
 */
ActiveDirectory.prototype.getGroupMembershipForGroup = function getGroupMembershipForGroup(opts, groupName, callback) {
    var self = this;

    if (typeof (groupName) === 'function') {
        callback = groupName;
        groupName = opts;
        opts = undefined;
    }
    log.trace('getGroupMembershipForGroup(%j,%s)', opts, groupName);

    getGroupDistinguishedName.call(self, opts, groupName, function (err, dn) {
        if (err) {
            if (callback) callback(err);
            return;
        }

        if (!dn) {
            log.warn('Could not find a distinguishedName for the specified group name: "%s"', groupName);
            if (callback) callback();
            return;
        }
        getGroupMembershipForDN.call(self, opts, dn, function (err, groups) {
            if (err) {
                if (callback) callback(err);
                return;
            }

            var results = [];
            _.each(groups, function (group) {
                var result = new Group(pickAttributes(group, (opts || {}).attributes || defaultAttributes.group));
                self.emit(result);
                results.push(result);
            });
            if (callback) callback(err, results);
        });
    });
};

/**
 * Checks to see if the specified username exists.
 *
 * @param {Object} [opts] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {String} username The username to check to see if it exits.
 * @param {Function} callback The callback to execute when completed. callback(err: {Object}, result: {Boolean})
 */
ActiveDirectory.prototype.userExists = function userExists(opts, username, callback) {
    var self = this;

    if (typeof (username) === 'function') {
        callback = username;
        username = opts;
        opts = undefined;
    }
    log.trace('userExists(%j,%s)', opts, username);

    self.findUser(opts, username, function (err, user) {
        if (err) {
            callback(err);
            return;
        }

        log.info('"%s" %s exist.', username, (user != null) ? 'DOES' : 'DOES NOT');
        callback(null, user != null);
    });
};

/**
 * Checks to see if the specified group exists.
 *
 * @param {Object} [opts] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {String} groupName The group to check to see if it exists.
 * @param {Function} callback The callback to execute when completed. callback(err: {Object}, result: {Boolean})
 */
ActiveDirectory.prototype.groupExists = function groupExists(opts, groupName, callback) {
    var self = this;

    if (typeof (groupName) === 'function') {
        callback = groupName;
        groupName = opts;
        opts = undefined;
    }
    log.trace('groupExists(%j,%s)', opts, groupName);

    self.findGroup(opts, groupName, function (err, result) {
        if (err) {
            callback(err);
            return;
        }

        log.info('"%s" %s exist.', groupName, (result != null) ? 'DOES' : 'DOES NOT');
        callback(null, result != null);
    });
};

/**
 * Checks to see if the specified user is a member of the specified group.
 *
 * @param {Object} [opts] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {String} username The username to check for membership.
 * @param {String} groupName The group to check for membership.
 * @param {Function} callback The callback to execute when completed. callback(err: {Object}, result: {Boolean})
 */
ActiveDirectory.prototype.isUserMemberOf = function isUserMemberOf(opts, username, groupName, callback) {
    var self = this;

    if (typeof (groupName) === 'function') {
        callback = groupName;
        groupName = username;
        username = opts;
        opts = undefined;
    }
    log.trace('isUserMemberOf(%j,%s,%s)', opts, username, groupName);

    opts = _.defaults(_.omit(opts || {}, 'attributes'), {
        attributes: ['cn', 'dn']
    });
    self.getGroupMembershipForUser(opts, username, function (err, groups) {
        if (err) {
            callback(err);
            return;
        }
        if ((!groups) || (groups.length === 0)) {
            log.info('"%s" IS NOT a member of "%s". No groups found for user.', username, groupName);
            callback(null, false);
            return;
        }

        // Check to see if the group.distinguishedName or group.cn matches the list of
        // retrieved groups.
        var lowerCaseGroupName = (groupName || '').toLowerCase();
        var result = _.any(groups, function (item) {
            return (((item.dn || '').toLowerCase() === lowerCaseGroupName) ||
                ((item.cn || '').toLowerCase() === lowerCaseGroupName));
        });
        log.info('"%s" %s a member of "%s"', username, result ? 'IS' : 'IS NOT', groupName);
        callback(null, result);
    });
};


/**
 * Perform a generic search for the specified LDAP query filter. This function will return both
 * groups and users that match the specified filter. Any results not recognized as a user or group
 * (i.e. computer accounts, etc.) can be found in the 'other' attribute / array of the result.
 *
 * @public
 * @param {Object} [opts] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }. Optionally, if only a string is provided, then the string is assumed to be an LDAP filter.
 * @param {Function} callback The callback to execute when completed. callback(err: {Object}, { users: [ User ], groups: [ Group ], other: [ ] )
 */
ActiveDirectory.prototype.find = function find(opts, callback) {
    var self = this;

    if (typeof (opts) === 'function') {
        callback = opts;
        opts = undefined;
    }
    if (typeof (opts) === 'string') {
        opts = {
            filter: opts
        };
    }
    log.trace('find(%j)', opts);

    var localOpts = _.defaults(_.omit(opts || {}, 'attributes'), {
        scope: 'sub',
        attributes: joinAttributes((opts || {}).attributes || [], defaultAttributes.group || [], defaultAttributes.user || [],
            getRequiredLdapAttributesForGroup(opts), getRequiredLdapAttributesForUser(opts),
            ['objectCategory'])
    });
    search.call(self, localOpts, function onFind(err, results) {
        if (err) {
            if (callback) callback(err);
            return;
        }

        if ((!results) || (results.length === 0)) {
            log.warn('No results found for query "%s"', truncateLogOutput(localOpts.filter));
            if (callback) callback();
            self.emit('done');
            return;
        }

        var result = {
            users: [],
            groups: [],
            other: []
        };

        // Parse the results in parallel.
        async.forEach(results, function (item, asyncCallback) {
            if (isGroupResult(item)) {
                var group = new Group(pickAttributes(item, (opts || {}).attributes || defaultAttributes.group));
                result.groups.push(group);
                // Also retrieving user group memberships?
                if (includeGroupMembershipFor(opts, 'group')) {
                    getGroupMembershipForDN.call(self, opts, group.dn, function (err, groups) {
                        if (err) return (asyncCallback(err));

                        group.groups = groups;
                        self.emit('group', group);
                        asyncCallback();
                    });
                } else {
                    self.emit('group', group);
                    asyncCallback();
                }
            }
            else if (isUserResult(item)) {
                var user = new User(pickAttributes(item, (opts || {}).attributes || defaultAttributes.user));
                result.users.push(user);
                // Also retrieving user group memberships?
                if (includeGroupMembershipFor(opts, 'user')) {
                    getGroupMembershipForDN.call(self, opts, user.dn, function (err, groups) {
                        if (err) return (asyncCallback(err));

                        user.groups = groups;
                        self.emit('user', user);
                        asyncCallback();
                    });
                } else {
                    self.emit('user', user);
                    asyncCallback();
                }
            }
            else {
                var other = pickAttributes(item, (opts || {}).attributes || _.union(defaultAttributes.user, defaultAttributes.group));
                result.other.push(other);
                self.emit('other', other);
                asyncCallback();
            }

        }, function (err) {
            if (err) {
                if (callback) callback(err);
                return;
            }

            log.info('%d group(s), %d user(s), %d other found for query "%s". Results: %j',
                result.groups.length, result.users.length, result.other.length,
                truncateLogOutput(opts.filter), result);
            self.emit('groups', result.groups);
            self.emit('users', result.users);

            if (callback) callback(null, result);
        });
    });
};

/**
 * Perform a generic search on the Deleted Objects container for active directory. For this function
 * to work correctly, the tombstone feature for active directory must be enabled. A tombstoned object
 * has most of the attributes stripped from the object.
 *
 * @public
 * @param {Object} [opts] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }. Optionally, if only a string is provided, then the string is assumed to be an LDAP filter.
 * @param {Function} callback The callback to execute when completed. callback(err: {Object}, result: [ ])
 */
ActiveDirectory.prototype.findDeletedObjects = function find(opts, callback) {
    var self = this;

    if (typeof (opts) === 'function') {
        callback = opts;
        opts = undefined;
    }
    if (typeof (opts) === 'string') {
        opts = {
            filter: opts
        };
    }
    log.trace('findDeletedObjects(%j)', opts);

    var defaultDeletedAttributes = [
        'attributeID', 'attributeSyntax', 'dnReferenceUpdate', 'dNSHostName', 'flatName',
        'governsID', 'groupType', 'instanceType', 'lDAPDisplayName', 'legacyExchangeDN',
        'mS-DS-CreatorSID', 'mSMQOwnerID', 'nCName', 'objectClass', 'objectGUID', 'objectSid',
        'oMSyntax', 'proxiedObjectName', 'replPropertyMetaData', 'sAMAccountName', 'securityIdentifier',
        'sIDHistory', 'subClassOf', 'systemFlags', 'trustPartner', 'trustDirection', 'trustType',
        'trustAttributes', 'userAccountControl', 'uSNChanged', 'uSNCreated', 'whenCreated',
        'msDS-AdditionalSam­AccountName', 'msDS-Auxiliary-Classes', 'msDS-Entry-Time-To-Die',
        'msDS-IntId', 'msSFU30NisDomain', 'nTSecurityDescriptor', 'uid'
    ];

    /**
     * Performs the actul search of the specified baseDN for any deleted (tombstoned) objects.
     * @param {String} baseDN The baseDN to search on.
     * @param {Object} opts The ldapjs query options.
     */
    function searchDeletedObjects(baseDN, opts) {
        search.call(self, baseDN, _.defaults({}, opts, { includeDeleted: true }), function onFind(err, results) {
            if (err) {
                if (callback) callback(err);
                return;
            }

            if ((!results) || (results.length === 0)) {
                log.warn('No deleted objects found for query "%s"', truncateLogOutput(opts.filter));
                if (callback) callback();
                self.emit('done');
                return;
            }

            var deletedItems = [];

            // Parse the results in parallel.
            _.forEach(deletedItemss, function (item) {
                var deletedItem = pickAttributes(item, (opts | {}).attributes || []);
                self.emit('entry:deleted', deletedItem);
                deletedItems.push(deletedItem);
            });

            log.info('%d deleted objects found for query "%s". Results: %j',
                deletedItems.length, truncateLogOutput(localOpts.filter), deletedItems);
            self.emit('deleted', deletedItems);
            if (callback) callback(null, deletedItems);
        });
    }

    var localOpts = _.defaults(opts || {}, {
        scope: 'one',
        attributes: joinAttributes((opts || {}).attributes || [], defaultDeletedAttributes),
        controls: []
    });
    // Get the BaseDN for the tree
    if (!localOpts.baseDN) {
        log.debug('No baseDN specified for Deleted Object. Querying RootDSE at %s.', self.opts.url);
        ActiveDirectory.prototype.getRootDSE(self.opts.url, ['defaultNamingContext'], function (err, result) {
            if (err) {
                if (callback) callback(err);
                return;
            }

            log.info('Retrieved defaultNamingContext (%s) from RootDSE at %s.', result.defaultNamingContext, self.opts.url);
            searchDeletedObjects('CN=Deleted Objects,' + result.defaultNamingContext, localOpts);
        });
    }
    else searchDeletedObjects(localOpts.baseDN, localOpts);
};

/**
 * Retrieves the specified group.
 *
 * @public
 * @param {Object} [opts] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {String} groupName The group (cn) to retrieve information about. Optionally can pass in the distinguishedName (dn) of the group to retrieve.
 * @param {Function} callback The callback to execute when completed. callback(err: {Object}, group: {Group})
 */
ActiveDirectory.prototype.findGroup = function findGroup(opts, groupName, callback) {
    var self = this;

    if (typeof (groupName) === 'function') {
        callback = groupName;
        groupName = opts;
        opts = undefined;
    }
    if (typeof (opts) === 'string') {
        groupName = opts;
        opts = undefined;
    }
    log.trace('findGroup(%j,%s)', opts, groupName);

    var localOpts = _.defaults(_.omit(opts || {}, 'attributes'), {
        filter: getGroupQueryFilter.call(self, groupName),
        scope: 'sub',
        attributes: joinAttributes((opts || {}).attributes || defaultAttributes.group, getRequiredLdapAttributesForGroup(opts))
    });
    search.call(self, localOpts, function onSearch(err, results) {
        if (err) {
            if (callback) callback(err);
            return;
        }

        if ((!results) || (results.length === 0)) {
            log.warn('Group "%s" not found for query "%s"', groupName, truncateLogOutput(localOpts.filter));
            if (callback) callback();
            return;
        }

        var group = new Group(pickAttributes(results[0], (opts || {}).attributes || defaultAttributes.group));
        log.info('%d group(s) found for query "%s". Returning first group: %j',
            results.length, truncateLogOutput(localOpts.filter), group);
        // Also retrieving user group memberships?
        if (includeGroupMembershipFor(opts, 'group')) {
            getGroupMembershipForDN.call(self, opts, group.dn, function (err, groups) {
                if (err) {
                    if (callback) callback(err);
                    return;
                }

                group.groups = groups;
                self.emit('group', group);
                if (callback) callback(err, group);
            });
        }
        else {
            self.emit('group', group);
            if (callback) callback(err, group);
        }
    });
};

/**
 * Perform a generic search for groups that match the specified filter. The default LDAP filter for groups is
 * specified as (&(objectClass=group)(!(objectClass=computer))(!(objectClass=user))(!(objectClass=person)))
 *
 * @public
 * @param {Object} [opts] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }. Optionally, if only a string is provided, then the string is assumed to be an LDAP filter that will be appended as the last parameter in the default LDAP filter.
 * @param {Function} callback The callback to execute when completed. callback(err: {Object}, groups: [ Group ])
 */
ActiveDirectory.prototype.findGroups = function findGroup(opts, callback) {
    var self = this;
    var defaultGroupFilter = '(objectClass=group)(!(objectClass=computer))(!(objectClass=user))(!(objectClass=person))';

    if (typeof (opts) === 'function') {
        callback = opts;
        opts = '';
    }
    if ((typeof (opts) === 'string') && (opts)) {
        opts = {
            filter: '(&' + defaultGroupFilter + getCompoundFilter(opts) + ')'
        };
    }

    log.trace('findGroups(%j)', opts);

    var localOpts = _.defaults(_.omit(opts || {}, 'attributes'), {
        filter: '(&' + defaultGroupFilter + ')',
        scope: 'sub',
        attributes: joinAttributes((opts || {}).attributes || defaultAttributes.group || [], getRequiredLdapAttributesForGroup(opts),
            ['groupType'])
    });
    search.call(self, localOpts, function onSearch(err, results) {
        if (err) {
            if (callback) callback(err);
            return;
        }

        if ((!results) || (results.length === 0)) {
            log.warn('No groups found matching query "%s"', truncateLogOutput(localOpts.filter));
            if (callback) callback();
            return;
        }

        var groups = [];

        // Parse the results in parallel.
        async.forEach(results, function (result, asyncCallback) {
            if (isGroupResult(result)) {
                var group = new Group(pickAttributes(result, (opts || {}).attributes || defaultAttributes.user));
                groups.push(group);

                // Also retrieving user group memberships?
                if (includeGroupMembershipFor(opts, 'group')) {
                    getGroupMembershipForDN.call(self, opts, group.dn, function (err, groups) {
                        if (err) return (asyncCallback(err));

                        group.groups = groups;
                        self.emit('group', group);
                        asyncCallback();
                    });
                }
                else {
                    self.emit('group', group);
                    asyncCallback();
                }
            }
            else asyncCallback();
        }, function (err) {
            if (err) {
                if (callback) callback(err);
                return;
            }

            log.info('%d group(s) found for query "%s". Groups: %j', groups.length, truncateLogOutput(localOpts.filter), groups);
            self.emit('groups', groups);
            if (callback) callback(null, groups);
        });
    });
};

/**
 * Retrieves the specified user.
 *
 * @public
 * @param {Object} [opts] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {String} username The username to retrieve information about. Optionally can pass in the distinguishedName (dn) of the user to retrieve.
 * @param {Boolean} [includeMembership] OBSOLETE; NOT NOT USE. Indicates if the results should include group memberships for the user. Defaults to false.
 * @param {Function} callback The callback to execute when completed. callback(err: {Object}, user: {User})
 */
ActiveDirectory.prototype.findUser = function findUser(opts, username, includeMembership, callback) {
    var self = this;

    if (typeof (includeMembership) === 'function') {
        callback = includeMembership;
        includeMembership = undefined;
    }
    if (typeof (username) === 'function') {
        callback = username;
        username = opts;
        opts = undefined;
    }
    if (typeof (username) === 'boolean') {
        includeMembership = username;
        username = opts;
    }
    if (typeof (opts) === 'string') {
        username = opts;
        opts = undefined;
    }
    log.trace('findUser(%j,%s,%s)', opts, username, includeMembership);

    var localOpts = _.defaults(_.omit(opts || {}, 'attributes'), {
        filter: getUserQueryFilter.call(self, username),
        scope: 'sub',
        attributes: joinAttributes((opts || {}).attributes || defaultAttributes.user || [], getRequiredLdapAttributesForUser(opts))
    });
    search.call(self, localOpts, function onSearch(err, results) {
        if (err) {
            if (callback) callback(err);
            return;
        }

        if ((!results) || (results.length === 0)) {
            log.warn('User "%s" not found for query "%s"', username, truncateLogOutput(localOpts.filter));
            if (callback) callback();
            return;
        }

        var user = new User(pickAttributes(results[0], (opts || {}).attributes || defaultAttributes.user));
        log.info('%d user(s) found for query "%s". Returning first user: %j', results.length, truncateLogOutput(localOpts.filter), user);

        // Also retrieving user group memberships?
        if (includeGroupMembershipFor(opts, 'user') || includeMembership) {
            getGroupMembershipForDN.call(self, opts, user.dn, function (err, groups) {
                if (err) {
                    if (callback) callback(err);
                    return;
                }

                user.groups = groups;
                self.emit('user', user);
                if (callback) callback(err, user);
            });
        }
        else {
            self.emit('user', user);
            if (callback) callback(err, user);
        }
    });
};

/**
 * Perform a generic search for users that match the specified filter. The default LDAP filter for users is
 * specified as (&(|(objectClass=user)(objectClass=person))(!(objectClass=computer))(!(objectClass=group)))
 *
 * @public
 * @param {Object} [opts] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }. Optionally, if only a string is provided, then the string is assumed to be an LDAP filter that will be appended as the last parameter in the default LDAP filter.
 * @param {Boolean} [includeMembership] OBSOLETE; NOT NOT USE. Indicates if the results should include group memberships for the user. Defaults to false.
 * @param {Function} callback The callback to execute when completed. callback(err: {Object}, users: [ User ])
 */
ActiveDirectory.prototype.findUsers = function findUsers(opts, includeMembership, callback) {
    var self = this;
    var defaultUserFilter = '(|(objectClass=user)(objectClass=person))(!(objectClass=computer))(!(objectClass=group))';

    if (typeof (includeMembership) === 'function') {
        callback = includeMembership;
        includeMembership = false;
    }
    if (typeof (opts) === 'function') {
        callback = opts;
        opts = '';
    }
    if ((typeof (opts) === 'string') && (opts)) {
        opts = {
            filter: '(&' + defaultUserFilter + getCompoundFilter(opts) + ')'
        };
    }
    log.trace('findUsers(%j,%s)', opts, includeMembership);

    var localOpts = _.defaults(_.omit(opts || {}, 'attributes'), {
        filter: '(&' + defaultUserFilter + ')',
        scope: 'sub',
        attributes: joinAttributes((opts || {}).attributes || defaultAttributes.user || [],
            getRequiredLdapAttributesForUser(opts), ['objectCategory'])
    });
    search.call(self, localOpts, function onSearch(err, results) {
        if (err) {
            if (callback) callback(err);
            return;
        }

        if ((!results) || (results.length === 0)) {
            log.warn('No users found matching query "%s"', truncateLogOutput(localOpts.filter));
            if (callback) callback();
            return;
        }

        var users = [];

        // Parse the results in parallel.
        async.forEach(results, function (result, asyncCallback) {
            if (isUserResult(result)) {
                var user = new User(pickAttributes(result, (opts || {}).attributes || defaultAttributes.user));
                users.push(user);

                // Also retrieving user group memberships?
                if (includeGroupMembershipFor(opts, 'user') || includeMembership) {
                    getGroupMembershipForDN.call(self, opts, user.dn, function (err, groups) {
                        if (err) return (asyncCallback(err));

                        user.groups = groups;
                        self.emit('user', user);
                        asyncCallback();
                    });
                }
                else {
                    self.emit('user', user);
                    asyncCallback();
                }
            }
            else asyncCallback();
        }, function (err) {
            if (err) {
                if (callback) callback(err);
                return;
            }

            log.info('%d user(s) found for query "%s". Users: %j', users.length, truncateLogOutput(opts.filter), users);
            self.emit('users', users);
            if (callback) callback(null, users);
        });
    });
};

/**
 * Attempts to authenticate the specified username / password combination.
 *
 * @public
 * @param {String} username The username to authenticate.
 * @param {String} password The password to use for authentication.	
 * @param {Function} callback The callback to execute when the authenication is completed. callback(err: {Object}, authenticated: {Boolean})
 */
ActiveDirectory.prototype.authenticate = function authenticate(username, password, callback) {
    var self = this;
    log.trace('authenticate(%j,%s)', username, isPasswordLoggingEnabled ? password : '********');

    // Skip authentication if an empty username or password is provided.
    if ((!username) || (!password)) {
        var err = {
            'code': 0x31,
            'errno': 'LDAP_INVALID_CREDENTIALS',
            'description': 'The supplied credential is invalid'
        };
        return (callback(err, false));
    }

    var errorHandled = false;
    function handleError(err) {
        if (!errorHandled) {
            errorHandled = true;
            if (hasEvents.call(self, 'error')) self.emit('error', err);
            return (callback(err, false));
        }
    }

    var client = createClient.call(self);
    client.on('error', handleError);
    client.bind(username, password, function (err) {
        client.unbind();
        var message = util.format('Authentication %s for "%s" as "%s" (password: "%s")',
            err ? 'failed' : 'succeeded',
            self.opts.url, username, isPasswordLoggingEnabled ? password : '********');
        if (err) {
            log.warn('%s. Error: %s', message, err);
            return (handleError(err));
        }

        log.info(message);
        return (callback(err, true));
    });
};

/**
 * Retrieves the root DSE for the specified url
 *
 * @public
 * @param {String} url The url to retrieve the root DSE for.
 * @param {Array} [attributes] The optional list of attributes to retrieve. Returns all if not specified.
 * @param {Function} callback The callback to execute when the getRootDSE is completed. callback(err: {Object}, result: {Object})
 */
ActiveDirectory.prototype.getRootDSE = function getRootDSE(url, attributes, callback) {
    var self = this;
    if (typeof (attributes) === 'function') {
        callback = attributes;
        attributes = undefined;
    }
    if (typeof (url) === 'function') {
        callback = url;
        url = self.url || self.opts.url;
        attributes = undefined;
    }
    if (!url) throw new Error('No url specified for the root DSE. Please specify an ldap url in the following format: "ldap://yourdomain.com:389".');
    log.trace('getRootDSE(%s,%j)', url, attributes || ['*']);

    /**
     * Inline function handle connection and result errors.
     *
     * @private
     **/
    function onClientError(err) {
        // Ignore ECONNRESET errors
        if ((err || {}).errno !== 'ECONNRESET') {
            log.error('An unhandled error occured when searching for the root DSE at "%s". Error: %j', url, err);
            if (hasEvents.call(self, 'error')) self.emit('error', err)
        }
    }

    var client = createClient.call(this, url);
    client.on('error', onClientError);
    // Anonymous bind
    client.bind('', '', function (err) {
        if (err) {
            log.error('Anonymous bind to "%s" failed. Error: %s', url, err);
            return (callback(err, false));
        }

        client.search('', { scope: 'base', attributes: attributes || ['*'], filter: '(objectClass=*)' }, function (err, result) {
            if (err) {
                log.error('Root DSE search failed for "%s". Error: %s', url, err);
                return (callback(err));
            }

            result.on('error', onClientError);
            result.on('end', function (result) {
                client.unbind();
            });
            result.on('searchEntry', function (entry) {
                callback(null, _.omit(entry.object, 'controls'));
            });
        });
    });
};

module.exports = ActiveDirectory;
