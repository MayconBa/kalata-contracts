const {readContracts, saveContracts} = require("../utils/resources")
const CONTRACT_CLASS = "Timelock";

async function deploy(hre) {
    const accounts = await hre.ethers.getSigners();
    let deployer = accounts[0];
    const {abi, bytecode} = await hre.artifacts.readArtifact(CONTRACT_CLASS);
    let deployedContracts = readContracts(hre) || {};
    let deployedContract = deployedContracts[CONTRACT_CLASS] || {name: CONTRACT_CLASS, address: null, initialize: null, deployer: deployer.address, deploy: true, upgradable: false, abi, bytecode};
    if (deployedContract.deploy) {
        let Contract = new hre.web3.eth.Contract(abi, null, {data: bytecode});
        let minDelay = 3600 * 24;
        let proposers = ['0x3A55B00c94bB0816DA85454797B13B46c395a38B', deployer.address];
        let executors = ['0xFc0aaEe5D05e8231b00e8b1e57181d0077fD1081', deployer.address];
        let result = await Contract.deploy({data: bytecode, arguments: [minDelay, proposers, executors]}).send({
            from: deployer.address,
        });
        let address = result._address;
        deployedContract.address = address;
        deployedContract.initialize = {minDelay, proposers, executors};
        console.log(`${CONTRACT_CLASS} deployed to network ${hre.network.name} with address ${address}`);
        deployedContract.deploy = false;
        deployedContracts[CONTRACT_CLASS] = deployedContract
        saveContracts(hre, deployedContracts);
    }
}


module.exports = {
    deploy
}
