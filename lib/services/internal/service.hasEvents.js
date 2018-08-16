const events                            = require('events');

/**
 * Checks to see if there are any event emitters defined for the
 * specified event name.
 * @param {String} event The name of the event to inspect.
 * @returns {Boolean} True if there are events defined, false if otherwise.
 */
function hasEvents(event) {
    return (events.EventEmitter.listenerCount(this, event) > 0);
}

module.exports = events;