const {updateWebContracts} = require("../utils/resources");
const {readContracts, saveContracts} = require("../utils/resources")
const {readKala, readBUSD} = require("../utils/assets")
const {loadContract} = require("../utils/contract")
const {toUnitString} = require("../utils/maths");

const CONTRACT_CLASS = "Router";

async function deploy(hre) {
    const accounts = await hre.ethers.getSigners();
    let deployer = accounts[0];
    let deployedContracts = readContracts(hre) || {};
    const {bytecode} = await hre.artifacts.readArtifact(CONTRACT_CLASS);
    const {abi} = await hre.artifacts.readArtifact("IRouter");
    let deployedContract = deployedContracts[CONTRACT_CLASS] || {name: CONTRACT_CLASS, address: null, initialize: null, deployer: deployer.address, abi, bytecode, deploy: true, upgrade: false};
    if (deployedContract.deploy || deployedContract.upgrade) {
        const ContractClass = await hre.ethers.getContractFactory(CONTRACT_CLASS, {});
        if (deployedContract.upgrade) {
            const instance = await hre.upgrades.upgradeProxy(deployedContract.address, ContractClass, {});
            deployedContract.abi = abi;
            deployedContract.bytecode = bytecode;
            console.log(`${CONTRACT_CLASS} upgraded:${instance.address}`);
        } else {
            let factory = deployedContracts['Factory'].address;
            let busdToken = readBUSD(hre).address;
            const instance = await hre.upgrades.deployProxy(ContractClass, [factory, busdToken], {
                initializer: 'initialize',
            });
            await instance.deployed();
            deployedContract.address = instance.address;
            deployedContract.initialize = {factory, busdToken};
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
