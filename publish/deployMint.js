const {readContracts, saveContracts} = require("../utils/resources")
const {readKala, readBUSD} = require("../utils/assets")
const {loadContract} = require("../utils/contract")
const {toUnitString} = require("../utils/maths");

const CONTRACT_CLASS = "Mint";

async function deploy(hre) {
    const accounts = await hre.ethers.getSigners();
    let deployer = accounts[0];
    let deployedContracts = readContracts(hre) || {};
    const {abi, bytecode} = await hre.artifacts.readArtifact(CONTRACT_CLASS);
    const {abi: iAbi} = await hre.artifacts.readArtifact("IMint");
    let deployedContract = deployedContracts[CONTRACT_CLASS] || {name: CONTRACT_CLASS, address: null, initialize: null, deployer: deployer.address, abi:iAbi, bytecode, deploy: true, upgrade: false};
    if (deployedContract.deploy || deployedContract.upgrade) {
        const ContractClass = await hre.ethers.getContractFactory(CONTRACT_CLASS, {});
        if (deployedContract.upgrade) {
            const instance = await hre.upgrades.upgradeProxy(deployedContract.address, ContractClass, {});
            deployedContract.abi = iAbi;
            deployedContract.bytecode = bytecode;
            console.log(`${CONTRACT_CLASS} upgraded:${instance.address}`);
        } else {
            let oracle = deployedContracts['Oracle'].address;
            let collector = deployedContracts['Collector'].address;
            let baseToken = readBUSD(hre).address;
            let protocolFeeRate = toUnitString("0.015");
            //mock factory firstly, Will use the factory address after the factory is deployed.
            let factory = deployer.address;
            const instance = await hre.upgrades.deployProxy(ContractClass, [factory, oracle, collector, baseToken, protocolFeeRate], {
                initializer: 'initialize',
            });
            await instance.deployed();
            deployedContract.address = instance.address;
            deployedContract.initialize = {factory: factory, oracle, collector, baseToken, protocolFeeRate};
            console.log(`${CONTRACT_CLASS} deployed to network ${hre.network.name} with address ${instance.address}`);
        }
        deployedContract.deploy = false;
        deployedContract.upgrade = false;
        deployedContracts[CONTRACT_CLASS] = deployedContract
        saveContracts(hre, deployedContracts);
    }
    return deployedContract;

}


module.exports = {
    deploy
}
