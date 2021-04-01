const {readContracts, saveContracts, readKala} = require("../utils/resources")
const {toUnitString} = require("../utils/maths");

const CONTRACT_CLASS = "Community";

async function deploy(hre) {
    const accounts = await hre.ethers.getSigners();
    let deployer = accounts[0];
    const {abi, bytecode} = await hre.artifacts.readArtifact(CONTRACT_CLASS);
    let deployedContracts = readContracts(hre) || {};
    let deployedContract = deployedContracts[CONTRACT_CLASS] || {name: CONTRACT_CLASS, address: null, initialize: null, deployer: deployer.address, abi, bytecode, deploy: true, upgrade: false};
    if (deployedContract.deploy || deployedContract.upgrade) {
        const ContractClass = await hre.ethers.getContractFactory(CONTRACT_CLASS, {});
        if (deployedContract.upgrade) {
            const instance = await hre.upgrades.upgradeProxy(deployedContract.address, ContractClass, {});
            console.log(`${CONTRACT_CLASS} upgraded:${instance.address}`);
        } else {
            let governance = deployedContracts['Governance'].address;
            let govToken = readKala(hre).address;
            let spendLimit = toUnitString(500000);
            const instance = await hre.upgrades.deployProxy(ContractClass, [governance, govToken, spendLimit], {initializer: 'initialize'});
            await instance.deployed();
            deployedContract.address = instance.address;
            deployedContract.initialize = {governance, govToken, spendLimit};
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