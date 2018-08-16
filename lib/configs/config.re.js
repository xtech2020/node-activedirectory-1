// Precompile some common, frequently used regular expressions.
var re = {
    'isDistinguishedName': /(([^=]+=.+),?)+/gi,
    'isUserResult': /CN=Person,CN=Schema,CN=Configuration,.*/i,
    'isGroupResult': /CN=Group,CN=Schema,CN=Configuration,.*/i
};


module.exports = re;