
/**
 * Returns the base dn for user group or default. Will speed up queries if you don't want to
 * browse through the complete OU where other information beyond users and groups are stored
 * It's implemented in search method to make sure it is set to default after every search
 * 
 * @param {Object} Options Options Object of ActiveDirectory
 * @param {String} BaseDnType BaseDn you are looking for. can be user, group or default
 * 
 * @returns {Object} Updated Options Object
 */
const updateBaseDn = (Options, BaseDnType) => {
    if(Options.baseDNs){
        switch(BaseDnType){
            case "user":
                Options.baseDN = Options.baseDNs.user || Options.baseDNs.default || Options.baseDN;
                break;
            case "group":
                Options.baseDN = Options.baseDNs.group || Options.baseDns.default || Options.baseDN;
                break;
            case "default":
            default:
                Options.baseDN = Options.baseDNs.default || Options.baseDN;
        }
    }

    return Options;
}

module.exports = updateBaseDn;