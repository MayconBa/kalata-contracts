const {readBNB, saveBNB} = require("../utils/resources")
const {toUnitString} = require("../utils/maths");
const {deployToken} = require("../utils/contract")

const ASSETS = {
    name: "Token Wrapped BNB",
    symbol: "BNB",
    initialSupply: toUnitString(10000000000),
    addresses: {
        mainnet: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
        //testnet: "0xae13d989dac2f0debff460ac112a837c89baa7cd"
    }
};

async function deploy(hre) {
    const accounts = await hre.ethers.getSigners();
    let deployer = accounts[0];
    let {name, symbol, initialSupply} = ASSETS;
    let address = ASSETS.addresses[hre.network.name];
    if (address) {
        saveBNB(hre, {name, symbol, address})
        return;
    }
    let config = readBNB(hre) || {name, symbol, initialSupply, deployer: deployer.address, address: null, deploy: true,};
    if (config.deploy) {
        let token = await deployToken(hre, name, symbol, initialSupply);
        config.address = token.address;
        config.deploy = false;
        saveBNB(hre, config)
        console.log(`MockBNB deployed to network ${hre.network.name} with address ${token.address}`);
    }
}

module.exports = {
    deploy
}
