const maxOutputLength   = 256;

const truncateLogOutput = (output, maxLength) => {
    if (typeof (maxLength) === 'undefined') maxLength = maxOutputLength;
    if (!output) return (output);

    if (typeof (output) !== 'string') output = output.toString();
    var length = output.length;
    if ((!length) || (length < (maxLength + 3))) return (output);

    var prefix = Math.ceil((maxLength - 3) / 2);
    var suffix = Math.floor((maxLength - 3) / 2);
    return (output.slice(0, prefix) + '...' +
        output.slice(length - suffix));
}

module.exports = truncateLogOutput;