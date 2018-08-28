let pendingReferrals = [];

const push = (Element) => {
    return pendingReferrals.push(Element);
};

const get = () => {
    return pendingReferrals;
};

module.exports = {
    push, get
};