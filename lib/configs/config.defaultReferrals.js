const defaultReferrals = {
    enabled: false,
    // Active directory returns the following partitions as default referrals which we don't want to follow
    exclude: [
        'ldaps?://ForestDnsZones\\..*/.*',
        'ldaps?://DomainDnsZones\\..*/.*',
        'ldaps?://.*/CN=Configuration,.*'
    ]
};

module.exports = defaultReferrals;