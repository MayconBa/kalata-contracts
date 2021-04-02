const {readContracts, saveContracts, readKala} = require("../utils/resources")
const {toUnitString} = require("../utils/maths");
const CONTRACT_CLASS = "Governance";

async function deploy(hre) {
    const accounts = await hre.ethers.getSigners();
    let deployer = accounts[0];
    const {abi, bytecode} = await hre.artifacts.readArtifact(CONTRACT_CLASS);
    let deployedContracts = readContracts(hre) || {};
    let deployedContract = deployedContracts[CONTRACT_CLASS] || {name: CONTRACT_CLASS, address: null, initialize: null,deployer:deployer.address,abi, bytecode, deploy: true, upgrade: false};


    const params = {
        "votingPeriod": 201600, //Number of blocks during which votes can be cast
        "effectiveDelay": 100800,//Number of blocks after a poll passes to apply changes
        "expirationPeriod": 14400,//Number of blocks after a poll's voting period during which the poll can be executed.
        "govToken": readKala(hre).address,
        "proposalDeposit": toUnitString("20"), //Minimum KALA deposit required for a new poll to be submitted
        "quorum": toUnitString("0.1"), //Minimum percentage of participation required for a poll to pass
        "threshold": toUnitString("0.5") //Minimum percentage of yes votes required for a poll to pass
    };

    if (deployedContract.deploy || deployedContract.upgrade) {
        const ContractClass = await hre.ethers.getContractFactory(CONTRACT_CLASS, {});
        if (deployedContract.upgrade) {
            const instance = await hre.upgrades.upgradeProxy(deployedContract.address, ContractClass, {});
            deployedContract.abi = abi;
            deployedContract.bytecode = bytecode;
            console.log(`${CONTRACT_CLASS} upgraded:`, instance.address);
        } else {
            const instance = await hre.upgrades.deployProxy(ContractClass, [params.govToken, params.quorum, params.threshold, params.votingPeriod, params.effectiveDelay, params.expirationPeriod, params.proposalDeposit], {
                initializer: 'initialize',
            });
            await instance.deployed();
            deployedContract.address = instance.address;
            deployedContract.initialize = params;
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