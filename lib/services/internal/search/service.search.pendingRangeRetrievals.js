
let pendingRangeRetrivals = 0;

const addOne = () => {
    return pendingRangeRetrivals++;
}

const substractOne = () => {
    return pendingRangeRetrivals--;    
}

const get = () => {
    return pendingRangeRetrivals;
}

module.exports = {
    addOne,
    substractOne,
    get
}