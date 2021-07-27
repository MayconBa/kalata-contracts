const {humanBN} = require("../../utils/maths");
const {logger} = require('./logger')
const {readContracts} = require("../../utils/resources");
const {loadContract} = require("../../utils/contract");

async function distribute(hre) {
    const [signer] = await hre.ethers.getSigners();
    const {address} = readContracts(hre)['Factory'];
    const instance = await loadContract(hre, 'Factory', address, signer)


    const {assets, weights} = await instance.queryAllAssetWeights();
    for (let i = 0; i < assets.length; i++) {
        console.log(i, assets[i], humanBN(weights[i]));
    }

    await instance.distribute({gasLimit: 250000}).catch(e => {
        logger.error(`Factory.distribute: ${e}`,)
    }).then(async receipt => {
        if (receipt) {
            await receipt.wait().catch(e => {
                logger.error(`Factory.distribute,wait: ${e}`,)
            });
            logger.info(`factory.distribute:  ${receipt.hash}`,)
        }
    });
}

module.exports = {
    distribute
};



