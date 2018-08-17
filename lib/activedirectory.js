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
const getRequiredLdapAttributesForUser  = require('./services/internal/service.getRequiredLdapAttributesForUser');
const isDistinguishedName               = require('./services/internal/service.isDistinguishedName');
const hasEvents                         = require('./services/internal/service.hasEvents');
const getUserQueryFilter                = require('./services/internal/service.getUserQueryFilter');
const getCompoundFilter                 = require('./services/internal/service.getCompoundFilter');
const getGroupQueryFilter               = require('./services/internal/service.getGroupQueryFilter');
const isGroupResult                     = require('./services/internal/service.isGroupResult');
const isUserResult                      = require('./services/internal/service.isUserResult');
const isAllowedReferral                 = require('./services/internal/service.isAllowedReferral');
const getDistinguishedNames             = require('./services/internal/service.getDistinguishedNames');
const getUserDistinguishedName          = require('./services/internal/service.getUserDistinguishedName');
const getGroupDistinguishedName         = require('./services/internal/service.getGroupDistinguishedName');


const find                              = require('./services/service.find');
const findUser                          = require('./services/service.findUser');
const findUsers                         = require('./services/service.findUsers');
const userExists                        = require('./services/service.userExists');
const isUserMemberOf                    = require('./services/service.isUserMemberOf');
const findDeletedObjects                = require('./services/service.findDeletedObjects');
const findGroup                         = require('./services/service.findGroup');
const findGroups                        = require('./services/service.findGroups');
const groupExists                       = require('./services/service.groupExists');
const getUsersForGroup                  = require('./services/service.getUsersForGroup');
const getGroupMembershipForUser         = require('./services/service.getGroupMembershipForUser');
const getGroupMembershipForDN           = require('./services/service.getGroupMembershipForDn');
const getGroupMembershipForGroup        = require('./services/service.getGroupMembershipForGroup');
const getRootDSE                        = require('./services/service.getRootDSE');
const authenticate                      = require('./services/service.authenticate');
const isPasswordLoggingEnabled = false;

let log                                             = require('./services/internal/service.log');
let defaultAttributes, originalDefaultAttributes    = require('./configs/config.defaultAttributes');
let defaultReferrals = originalDefaultReferrals     = require('./configs/config.defaultReferrals');
const re                                            = require('./configs/config.re');

// Precompile some common, frequently used regular expressions.

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
ActiveDirectory.filters = ldap.filters;

ActiveDirectory.prototype.getUsersForGroup = getUsersForGroup;
ActiveDirectory.prototype.getGroupMembershipForUser = getGroupMembershipForUser;


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
ActiveDirectory.prototype.getGroupMembershipForGroup =  getGroupMembershipForGroup;
ActiveDirectory.prototype.userExists = userExists;
ActiveDirectory.prototype.groupExists = groupExists
ActiveDirectory.prototype.isUserMemberOf = isUserMemberOf;
ActiveDirectory.prototype.find = find;
ActiveDirectory.prototype.findDeletedObjects = findDeletedObjects;
ActiveDirectory.prototype.findGroup = findGroup;
ActiveDirectory.prototype.findGroups = findGroups
ActiveDirectory.prototype.findUser = findUser;
ActiveDirectory.prototype.findUsers = findUsers;
ActiveDirectory.prototype.authenticate = authenticate;
ActiveDirectory.prototype.getRootDSE = getRootDSE;

module.exports = ActiveDirectory;
