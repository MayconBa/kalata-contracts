const {updateWebContracts} = require("../utils/resources");
const {readKala, saveKala} = require("../utils/assets")
const {toUnitString} = require("../utils/maths");

async function deploy(hre) {
    const accounts = await hre.ethers.getSigners();
    let deployer = accounts[0];
    let name = "Kalata";
    let symbol = "Kala";

    let initialSupply = toUnitString("120000000");
    let config = readKala(hre) || {deploy: true, upgrade: false, name, symbol, deployer: deployer.address, initialSupply};
    if (config.deploy || config.upgrade) {
        const contractFactory = await hre.ethers.getContractFactory("BEP20Token");
        if (config.upgrade) {
            const instance = await hre.upgrades.upgradeProxy(config.address, contractFactory, {});
            if (config.address !== instance.address) {
                console.error(`the token address changed while upgrade ,please check`);
            }
            console.log(`Kala upgraded to ${hre.network.name} with address :${instance.address}`);
            config.upgradedAddress = instance.address;
            config.upgrade = false;
        } else {
            const instance = await hre.upgrades.deployProxy(contractFactory, [name, symbol, initialSupply], {initializer: 'initialize'});
            await instance.deployed();
            config.address = instance.address;
            config.deploy = false;
            console.log(`Kala deployed to network ${hre.network.name} with address :${instance.address}`);

        }
    }
    saveKala(hre, config);
    updateWebContracts(hre, symbol, {
        address: config.address,
        png: `https://api.kalata.io/api/deployed/assets/KALA.png`,
        svg: `https://api.kalata.io/api/deployed/assets/KALA.svg`,
    });
    const {abi} = await hre.artifacts.readArtifact("IBEP20");
    updateWebContracts(hre, "IBEP20", {abi});
    return config;
}


module.exports = {
    deploy
}
