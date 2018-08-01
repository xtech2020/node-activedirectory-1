const defaultAttributes = {
    user: [
        'dn',
        'userPrincipalName', 'sAMAccountName', /*'objectSID',*/ 'mail',
        'lockoutTime', 'whenCreated', 'pwdLastSet', 'userAccountControl',
        'employeeID', 'sn', 'givenName', 'initials', 'cn', 'displayName',
        'comment', 'description'
    ],
    group: [
        'dn', 'cn', 'description'
    ]
};

module.exports = defaultAttributes;