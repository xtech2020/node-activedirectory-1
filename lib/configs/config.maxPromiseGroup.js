
module.exports = {
    chunks : null,
    maxSearchesAtOnce: 2000,
    searchTimeoutAndReject : {
        // Timeout : {
        //     timeoutBehaviour : "retry",
        //     retryAttempts: 1,
        //     timeoutMillis: 2000
        // },
        Reject : {
            rejectBehaviour : "retry",
            retryAttempts : 1
        }       
    },
    
}