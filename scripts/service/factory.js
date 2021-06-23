async function distribute(hre) {
    const {readContracts} = require("../../utils/resources");
    const {loadContract} = require("../../utils/contract");
    const {logger} = require("./logger");
    const [signer] = await hre.ethers.getSigners();
    const {address} = readContracts(hre)['Factory'];
    const instance = await loadContract(hre, 'Factory', address, signer)
    let receipt = await instance.distribute({gasLimit: 250000});
    await receipt.wait();
    logger.info(`factory.distribute:  ${receipt.hash}`,)
}

module.exports = {
    distribute
};



