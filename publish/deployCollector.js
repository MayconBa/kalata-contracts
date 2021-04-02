const {readContracts, saveContracts, readKala, readUSD} = require("../utils/resources")

const CONTRACT_CLASS = "Collector";

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
            deployedContract.abi = abi;
            deployedContract.bytecode = bytecode;
            console.log(`${CONTRACT_CLASS} upgraded:${instance.address}`);
        } else {
            let govToken = readKala(hre).address;
            let governance = deployedContracts['Governance'].address;
            let uniswapFactory = deployedContracts['UniswapV2Factory'].address;
            let baseToken = readUSD(hre).address;
            let uniswapRouter = deployedContracts['UniswapV2Router02'].address;
            const instance = await hre.upgrades.deployProxy(ContractClass, [governance, uniswapFactory, uniswapRouter, baseToken, govToken], {initializer: 'initialize'});
            await instance.deployed();

            deployedContract.address = instance.address;
            deployedContract.initialize = {governance, uniswapFactory, uniswapRouter, baseToken, govToken};
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