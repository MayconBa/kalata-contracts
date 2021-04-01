const {readContracts, saveContracts, readKala} = require("../utils/resources")

const CONTRACT_CLASS = "Staking";

async function deploy(hre) {
    const accounts = await hre.ethers.getSigners();
    let deployer = accounts[0];
    const {abi, bytecode} = await hre.artifacts.readArtifact(CONTRACT_CLASS);
    let deployedContracts = readContracts(hre) || {};
    let deployedContract = deployedContracts[CONTRACT_CLASS] || {name: CONTRACT_CLASS, address: null, initialize: null,deployer:deployer.address,abi, bytecode, deploy: true, upgrade: false};
    if (deployedContract.deploy || deployedContract.upgrade) {
        const ContractClass = await hre.ethers.getContractFactory(CONTRACT_CLASS, {});
        if (deployedContract.upgrade) {
            const instance = await hre.upgrades.upgradeProxy(deployedContract.address, ContractClass, {});
            console.log(`${CONTRACT_CLASS} upgraded:${instance.address}`);
        } else {
            //mock factory firstly, Will use the factory address after the factory is deployed.
            let factory = deployer.address;
            let govToken = readKala(hre).address;
            const instance = await hre.upgrades.deployProxy(ContractClass, [factory, govToken], {initializer: 'initialize'});
            await instance.deployed();
            deployedContract.address = instance.address;
            deployedContract.initialize = {factory , govToken};


            console.log(`${CONTRACT_CLASS} deployed to network ${hre.network.name} with address ${instance.address}`);
        }
        deployedContract.deploy = false;
        deployedContract.upgrade = false;
        deployedContracts[CONTRACT_CLASS] = deployedContract
        saveContracts(hre, deployedContracts);
    }
}


module.exports = {
    deploy
}