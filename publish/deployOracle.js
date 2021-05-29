const {updateWebContracts} = require("../utils/resources");
const {readContracts, saveContracts,} = require("../utils/resources")
const {readBUSD} = require("../utils/assets")
const ORACLE_CONTRACT_CLASS = "Oracle";

async function deploy(hre) {
    const accounts = await hre.ethers.getSigners();
    let deployer = accounts[0];
    const ContractClass = await hre.ethers.getContractFactory(ORACLE_CONTRACT_CLASS, {});
    const {bytecode} = await hre.artifacts.readArtifact(ORACLE_CONTRACT_CLASS);
    const {abi} = await hre.artifacts.readArtifact("IMint");
    let deployedContracts = readContracts(hre) || {};
    let deployedContract = deployedContracts[ORACLE_CONTRACT_CLASS] || {name: ORACLE_CONTRACT_CLASS, address: null, initialize: null, deployer: deployer.address, abi, bytecode, deploy: true, upgrade: false};

    if (deployedContract.deploy || deployedContract.upgrade) {
        if (deployedContract.upgrade) {
            const instance = await hre.upgrades.upgradeProxy(deployedContract.address, ContractClass, {});
            deployedContract.abi = abi;
            deployedContract.bytecode = bytecode;
            console.log(`${ORACLE_CONTRACT_CLASS} upgraded:`, instance.address);
        } else {
            //mock factory firstly, Will use the factory address after the factory is deployed.
            let factory = deployer.address;
            let baseAsset = readBUSD(hre).address;
            const instance = await hre.upgrades.deployProxy(ContractClass, [factory, baseAsset], {
                initializer: 'initialize',
            });
            await instance.deployed();
            deployedContract.address = instance.address;
            deployedContract.initialize = {factory, baseAsset};
            console.log(`${ORACLE_CONTRACT_CLASS} deployed to network ${hre.network.name} with address ${instance.address}`);
        }
        deployedContract.deploy = false;
        deployedContract.upgrade = false;
        deployedContracts[ORACLE_CONTRACT_CLASS] = deployedContract
        saveContracts(hre, deployedContracts);
    }
    updateWebContracts(hre,ORACLE_CONTRACT_CLASS, {address: deployedContract.address, abi});
}


module.exports = {
    deploy
}
