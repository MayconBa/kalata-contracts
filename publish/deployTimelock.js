const {readContracts, saveContracts} = require("../utils/resources")
const CONTRACT_CLASS = "Timelock";

async function deploy(hre) {
    const accounts = await hre.ethers.getSigners();
    let deployer = accounts[0];
    const {abi, bytecode} = await hre.artifacts.readArtifact(CONTRACT_CLASS);
    let deployedContracts = readContracts(hre) || {};
    let deployedContract = deployedContracts[CONTRACT_CLASS] || {name: CONTRACT_CLASS, deployer: deployer.address, deploy: true, abi, bytecode};
    if (deployedContract.deploy) {
        let Contract = new hre.web3.eth.Contract(abi, null, {data: bytecode});
        let minDelay = 3600 * 24;
        let proposers = [deployer.address];
        let executors = proposers;
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
