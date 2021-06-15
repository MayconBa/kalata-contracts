const got = require('got');
const {readContracts} = require("../../utils/resources");
const {loadContract} = require("../../utils/contract");
const {readAssets} = require("../../utils/assets");
const {humanBN} = require("../../utils/maths");
const {logger} = require("./logger");


async function distribute(hre) {
    const [signer] = await hre.ethers.getSigners();
    const {address} = readContracts(hre)['Factory'];
    const instance = await loadContract(hre, 'Factory', address, signer)
    let receipt = await instance.distribute({
        gasLimit: 250000
    }) || {};
    logger.info(`factory.distribute:  ${receipt.hash}`,)
}

module.exports = {
    distribute
};



