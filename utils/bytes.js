const {hexToAscii} = require('web3-utils');
const web3 = require('web3');

/**
 * Converts a hex string of bytes into a UTF8 string with \0 characters (from padding) removed
 */
const bytesToString = bytes => {
    const result = hexToAscii(bytes);
    return result.replace(/\0/g, '');
};

const stringToBytes32 = s => {
    let result = web3.utils.fromAscii(s);
    while (result.length < 66) {
        result = result + "0";
    }
    return result;
}


module.exports = {
    bytesToString, stringToBytes32
};

