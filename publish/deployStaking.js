const {updateWebContracts} = require("../utils/resources");
const {readContracts, saveContracts} = require("../utils/resources")
const {readKala} = require("../utils/assets")
const moment = require("moment");
const CONTRACT_CLASS = "Staking";

async function deploy(hre) {
    const accounts = await hre.ethers.getSigners();
    let deployer = accounts[0];
    const {bytecode} = await hre.artifacts.readArtifact(CONTRACT_CLASS);
    const {abi} = await hre.artifacts.readArtifact("IStaking");
    let deployedContracts = readContracts(hre) || {};
    let deployedContract = deployedContracts[CONTRACT_CLASS] || {name: CONTRACT_CLASS, deployer: deployer.address, abi, bytecode, deploy: true};
    if (deployedContract.deploy || deployedContract.upgrade) {
        const ContractClass = await hre.ethers.getContractFactory(CONTRACT_CLASS, {});
        if (deployedContract.upgrade) {
            const instance = await hre.upgrades.upgradeProxy(deployedContract.address, ContractClass, {});
            deployedContract.abi = abi;
            deployedContract.bytecode = bytecode;
            deployedContract.upgradeTime = moment().format();
            console.log(`${CONTRACT_CLASS} upgraded:${instance.address}`);
        } else {
            let factory = deployer.address;
            let govToken = readKala(hre).address;
            let collateralContract = deployedContracts['Collateral'].address
            const instance = await hre.upgrades.deployProxy(ContractClass, [factory, govToken, collateralContract], {initializer: 'initialize'});
            await instance.deployed();
            deployedContract.address = instance.address;
            deployedContract.initialize = {factory, govToken, collateralContract};
            console.log(`${CONTRACT_CLASS} deployed to network ${hre.network.name} with address ${instance.address}`);
        }
        deployedContract.deploy = false;
        deployedContract.upgrade = false;
        deployedContracts[CONTRACT_CLASS] = deployedContract
        saveContracts(hre, deployedContracts);
        updateWebContracts(hre, CONTRACT_CLASS, {address: deployedContract.address, abi});
    }
}


module.exports = {
    deploy
}
