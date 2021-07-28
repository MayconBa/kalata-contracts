const {toUnitString} = require("../../utils/maths");
const {divideDecimal} = require("../../utils/maths");
const {toUnit} = require("../../utils/maths");
const {ZERO_ADDRESS} = require("../../utils/contract");
const {getAddressSymbolMapping} = require("../../utils/assets");
const {humanBN} = require("../../utils/maths");
const {logger} = require('./logger')
const {readContracts} = require("../../utils/resources");
const {loadContract} = require("../../utils/contract");

async function distribute(hre) {
    const [signer, collector] = await hre.ethers.getSigners();
    const {address} = readContracts(hre)['Factory'];
    const instance = await loadContract(hre, 'Factory', address, signer)
    await wait(instance.distribute({gasLimit: 250000}), `Factory.distribute()`);
}


async function wait(promise, action) {
    await promise.catch(e => {
        logger.error(`${action}: ${e}`,)
    }).then(async receipt => {
        if (receipt) {
            await receipt.wait().catch(e => {
                logger.error(`${action}: ${e}`,)
            });
            logger.info(`${action}:  ${receipt.hash}`,)
        }
    });
}

module.exports = {
    distribute
};



