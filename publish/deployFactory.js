const {updateWebContracts} = require("../utils/resources");
const {readContracts, saveContracts} = require("../utils/resources")
const {readKala, readBUSD} = require("../utils/assets")
const {loadContract, loadToken, waitReceipt} = require("../utils/contract")
const {toUnitString} = require("../utils/maths");
const moment = require("moment");
const CONTRACT_CLASS = "Factory";

async function deploy(hre) {
    const [deployer] = await hre.ethers.getSigners();
    const {bytecode} = await hre.artifacts.readArtifact(CONTRACT_CLASS);
    const {abi} = await hre.artifacts.readArtifact("IFactory");
    let deployedContracts = readContracts(hre) || {};
    let deployedContract = deployedContracts[CONTRACT_CLASS] || {
        name: CONTRACT_CLASS,
        address: null,
        initialize: null,
        abi,
        bytecode,
        deploy: true,
        upgrade: false
    };

    if (deployedContract.deploy || deployedContract.upgrade) {
        const ContractClass = await hre.ethers.getContractFactory(CONTRACT_CLASS, {});
        if (deployedContract.upgrade) {
            const instance = await hre.upgrades.upgradeProxy(deployedContract.address, ContractClass, {});
            deployedContract.abi = abi;
            deployedContract.bytecode = bytecode;
            deployedContract.upgradeTime = moment().format();
            console.log(`${CONTRACT_CLASS} upgraded:${instance.address}`);
        } else {
            let mint = deployedContracts['Mint'].address;
            let govToken = readKala(hre).address;
            let baseToken = readBUSD(hre).address;
            let oracle = deployedContracts['Oracle'].address;
            let uniswapFactory = deployedContracts['UniswapV2Factory'].address;
            let staking = deployedContracts['Staking'].address;
            let scheduleStartTime = [21600, 31557600, 63093600, 94629600]
            let scheduleEndTime = [31557600, 63093600, 94629600, 126165600]
            let scheduleAmounts = [toUnitString(549000), toUnitString(274500), toUnitString(137250), toUnitString(68625)]
            const instance = await hre.upgrades.deployProxy(ContractClass, [mint, staking, uniswapFactory, baseToken, govToken], {initializer: 'initialize'});
            await instance.deployed();
            await instance.updateDistributionSchedules(scheduleStartTime, scheduleEndTime, scheduleAmounts)
            deployedContract.address = instance.address;
            deployedContract.initialize = {mint, oracle, staking, uniswapFactory, baseToken, govToken};
            deployedContract.distributionSchedules = {scheduleStartTime, scheduleEndTime, scheduleAmounts};
            console.log(`${CONTRACT_CLASS} deployed to network ${hre.network.name} with address ${instance.address}`);
            for (let name of ["Staking", "Mint"]) {
                await (await loadContract(hre, name)).setFactory(deployedContract.address);
                deployedContracts[name].initialize.factory = deployedContract.address;
                console.log(`${name}.initialize.factory is set to ${deployedContract.address}`);
            }
            const kalaToken = await loadToken(hre, govToken, deployer);
            await waitReceipt(kalaToken.registerMinters([mint, deployedContract.address]));
        }
        deployedContract.deploy = false;
        deployedContract.upgrade = false;
        deployedContracts[CONTRACT_CLASS] = deployedContract
        saveContracts(hre, deployedContracts);
    }
    updateWebContracts(hre, CONTRACT_CLASS, {address: deployedContract.address, abi});
}

module.exports = {
    deploy
}
