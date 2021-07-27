const moment = require("moment");
const {updateWebContracts} = require("../utils/resources");
const {readContracts, saveContracts} = require("../utils/resources")
const {readBUSD} = require("../utils/assets")
const {toUnitString} = require("../utils/maths");
const CONTRACT_CLASS = "Mint";

//cyberpunk
const COLLECTOR = '0xa1036E4E163c707F49A75af5AcA4F89Ba010DA2B'

async function deploy(hre) {
    const accounts = await hre.ethers.getSigners();
    let deployer = accounts[0];
    let deployedContracts = readContracts(hre) || {};
    const {bytecode} = await hre.artifacts.readArtifact(CONTRACT_CLASS);
    const {abi} = await hre.artifacts.readArtifact("IMint");
    let deployedContract = deployedContracts[CONTRACT_CLASS] || {
        name: CONTRACT_CLASS,
        address: null,
        initialize: null,
        deployer: deployer.address,
        abi,
        bytecode,
        deploy: true,
        upgrade: false
    };
    if (deployedContract.deploy || deployedContract.upgrade) {
        const ContractClass = await hre.ethers.getContractFactory(CONTRACT_CLASS, {});
        if (deployedContract.upgrade) {
            const instance = await hre.upgrades.upgradeProxy(deployedContract.address, ContractClass, {});
            deployedContract.abi = abi;
            deployedContract.bytecode = bytecode;
            deployedContract.upgradeTime = moment().format();
            console.log(`${CONTRACT_CLASS} upgraded:${instance.address}`);
        } else {
            let oracle = deployedContracts['Oracle'].address;
            let collector = COLLECTOR;
            let baseToken = readBUSD(hre).address;
            let protocolFeeRate = toUnitString("0.015");
            //mock factory firstly, Will use the factory address after the factory is deployed.
            let factory = deployer.address;
            let priceExpireTime = 3600 * 24;
            const instance = await hre.upgrades.deployProxy(ContractClass, [factory, oracle, collector, baseToken, protocolFeeRate, priceExpireTime], {
                initializer: 'initialize',
            });
            await instance.deployed();
            deployedContract.address = instance.address;
            deployedContract.initialize = {factory: factory, oracle, collector, baseToken, protocolFeeRate, priceExpireTime};
            console.log(`${CONTRACT_CLASS} deployed to network ${hre.network.name} with address ${instance.address}`);
        }
        deployedContract.deploy = false;
        deployedContract.upgrade = false;
        deployedContracts[CONTRACT_CLASS] = deployedContract
        saveContracts(hre, deployedContracts);
    }
    updateWebContracts(hre, CONTRACT_CLASS, {address: deployedContract.address, abi});
    return deployedContract;

}


module.exports = {
    deploy
}
