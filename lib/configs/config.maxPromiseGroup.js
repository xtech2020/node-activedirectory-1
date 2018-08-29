
module.exports = {
    chunksItems : null,
    maxSearchesAtOnce: 6000,
    members : null,
    searchTimeoutAndReject : {
        // Timeout : {
        //     timeoutBehaviour : "retry",
        //     retryAttempts: 1,
        //     timeoutMillis: 30000
        // },
        Reject : {
            rejectBehaviour : "retry",
            retryAttempts : 1
        }       
    },
    
}