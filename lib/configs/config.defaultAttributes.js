const defaultAttributes = {
    user: [
        'dn',
        'userPrincipalName', 'sAMAccountName', /*'objectSID',*/ 'mail',
        'userAccountControl', 'sn', 'givenName', 'initials', 'cn', 'displayName',
        'comment', 'description','extensionAttribute15', 'department'
    ],
    group: [
        'dn', 'cn', 'description'
    ]
};

module.exports = defaultAttributes;