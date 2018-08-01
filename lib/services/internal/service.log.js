const bunyan = require('bunyan');

let log = bunyan.createLogger({
    name: 'ActiveDirectory',
    streams: [
        {
            level: 'fatal',
            stream: process.stdout
        }
    ]
});


module.exports = log;