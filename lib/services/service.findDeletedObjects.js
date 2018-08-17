const _                                 = require('underscore');
const joinAttributes                    = require('./internal/service.joinAttributes');
const search                            = require('./internal/service.search');
const truncateLogOutput                 = require('./internal/service.truncateLogOutput');
const pickAttributes                    = require('./internal/service.pickAttributes');
const log                               = require('./internal/service.log');

/**
 * Perform a generic search on the Deleted Objects container for active directory. For this function
 * to work correctly, the tombstone feature for active directory must be enabled. A tombstoned object
 * has most of the attributes stripped from the object.
 *
 * @public
 * @param {Object} [opts] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }. Optionally, if only a string is provided, then the string is assumed to be an LDAP filter.
 * @param {Function} callback The callback to execute when completed. callback(err: {Object}, result: [ ])
 */
function findDeletedObjects(opts, callback) {
    var self = this;
    return new Promise((resolve, reject) => {
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
                    if (callback){
                        callback(err);
                    }
                    return reject(err);
                }
    
                if ((!results) || (results.length === 0)) {
                    log.warn('No deleted objects found for query "%s"', truncateLogOutput(opts.filter));
                    if (callback){
                        callback();
                    }
                    self.emit('done');
                    return resolve([]);
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
                if (callback){
                    callback(null, deletedItems);
                }
                return resolve(deletedItems);
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
    });
    
};

module.exports = findDeletedObjects;