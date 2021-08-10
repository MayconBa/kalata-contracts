const {updateWebContracts} = require("../utils/resources");
const {readKala, saveKala} = require("../utils/assets")
const {toUnitString} = require("../utils/maths");

async function deploy(hre) {
    const [deployer] = await hre.ethers.getSigners();
    let name = "Kalata";
    let symbol = "Kala";

    let initialSupply = toUnitString("120000000");
    let config = readKala(hre) || {
        deploy: true,
        upgrade: false,
        name,
        symbol,
        deployer: deployer.address,
        initialSupply
    };
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
    const {abi} = await hre.artifacts.readArtifact("IBEP20");
    updateWebContracts(hre, symbol, {
        address: config.address,
        png: `https://app.kalata.io/media/assets/KALA.png`,
        svg: `https://app.kalata.io/media/assets/KALA.svg`,
        abi,
    });
}


module.exports = {
    deploy
}
