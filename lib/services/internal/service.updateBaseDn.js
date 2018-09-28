
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
const updateBaseDn = (Ad, BaseDnType) => {
    let options = Ad.opts;
    if(options.baseDNs){
        switch(BaseDnType){
            case "user":
                Ad.baseDN = options.baseDN = options.baseDNs.user || options.baseDNs.default || options.baseDN;
                break;
            case "group":
                Ad.baseDN = options.baseDN = options.baseDNs.group || options.baseDns.default || options.baseDN;
                break;
            case "default":
            default:
                Ad.baseDN = options.baseDN = options.baseDNs.default || options.baseDN;
        }
    }

    return Ad;
}

module.exports = updateBaseDn;