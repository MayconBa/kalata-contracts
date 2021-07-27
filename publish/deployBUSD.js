const {updateWebContracts} = require("../utils/resources");
const {readBUSD, saveBUSD} = require("../utils/assets")

const {toUnitString} = require("../utils/maths");
const {deployToken} = require("../utils/contract")

const ASSETS = {
    name: "Binance-Peg BUSD-T",
    symbol: "BUSD",
    initialSupply: toUnitString(10000000000),
    isBaseAsset: true,
    addresses: {
        mainnet: "0x55d398326f99059ff775485246999027b3197955",
        //testnet: "0x1a959f482AEcC14309B6855DcD7B591214CF2f25"
    }
};

async function deploy(hre) {
    const accounts = await hre.ethers.getSigners();
    let deployer = accounts[0];
    let {name, symbol, initialSupply} = ASSETS;
    let address = ASSETS.addresses[hre.network.name];
    if (address) {
        saveBUSD(hre, {name, symbol, address})
        return;
    }
    let config = readBUSD(hre) || {
        name,
        symbol,
        initialSupply,
        deployer: deployer.address,
        address: null,
        deploy: true
    };
    if (config.deploy) {
        let token = await deployToken(hre, name, symbol, initialSupply);
        config.address = token.address;
        config.deploy = false;
        saveBUSD(hre, config)
        console.log(`MockUSD deployed to network ${hre.network.name} with address ${token.address}`);
    }
    updateWebContracts(hre, symbol, {
        address: config.address,
        png: `https://app.kalata.io/media/assets/USD.png`,
        svg: `https://app.kalata.io/media/assets/USD.svg`,
    });
}

module.exports = {
    deploy
}
