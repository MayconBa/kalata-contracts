const {updateWebContracts} = require("../utils/resources");
const {readContracts, saveContracts} = require("../utils/resources")
const {readKala, readBUSD} = require("../utils/assets")
const {loadContract, loadToken} = require("../utils/contract")
const {toUnitString} = require("../utils/maths");

const CONTRACT_CLASS = "Factory";

async function deploy(hre) {
    const [deployer] = await hre.ethers.getSigners();
    const {bytecode} = await hre.artifacts.readArtifact(CONTRACT_CLASS);
    const {abi} = await hre.artifacts.readArtifact("IFactory");
    let deployedContracts = readContracts(hre) || {};
    let deployedContract = deployedContracts[CONTRACT_CLASS] || {name: CONTRACT_CLASS, address: null, initialize: null, abi, bytecode, deploy: true, upgrade: false};
    let mintAddress = deployedContracts['Mint'].address;
    let kalaTokenAddress = readKala(hre).address;
    if (deployedContract.deploy || deployedContract.upgrade) {
        const ContractClass = await hre.ethers.getContractFactory(CONTRACT_CLASS, {});
        if (deployedContract.upgrade) {
            const instance = await hre.upgrades.upgradeProxy(deployedContract.address, ContractClass, {});
            deployedContract.abi = abi;
            deployedContract.bytecode = bytecode;
            console.log(`${CONTRACT_CLASS} upgraded:${instance.address}`);
        } else {
            let baseToken = readBUSD(hre).address;
            let governance = deployedContracts['Governance'].address;
            let oracle = deployedContracts['Oracle'].address;
            let uniswapFactory = deployedContracts['UniswapV2Factory'].address;
            let staking = deployedContracts['Staking'].address;
            let scheduleStartTime = [21600, 31557600, 63093600, 94629600]
            let scheduleEndTime = [31557600, 63093600, 94629600, 126165600]
            let scheduleAmounts = [toUnitString(549000), toUnitString(274500), toUnitString(137250), toUnitString(68625)]
            const instance = await hre.upgrades.deployProxy(ContractClass, [
                governance, mintAddress, oracle, staking, uniswapFactory, baseToken, kalaTokenAddress
            ], {initializer: 'initialize'});
            await instance.deployed();

            await instance.updateDistributionSchedules(scheduleStartTime, scheduleEndTime, scheduleAmounts)

            deployedContract.address = instance.address;
            deployedContract.initialize = {governance, mint: mintAddress, oracle, staking, uniswapFactory, baseToken, govToken: kalaTokenAddress};
            deployedContract.distributionSchedules = {scheduleStartTime, scheduleEndTime, scheduleAmounts};
            console.log(`${CONTRACT_CLASS} deployed to network ${hre.network.name} with address ${instance.address}`);

            for (let name of ["Oracle", "Staking", "Mint"]) {
                await (await loadContract(hre, name)).setFactory(deployedContract.address);
                deployedContracts[name].initialize.factory = deployedContract.address;
                console.log(`${name}.initialize.factory is set to ${deployedContract.address}`);
            }
            const kalaToken = await loadToken(hre, kalaTokenAddress, deployer);
            let receipt = await kalaToken.registerMinters([mintAddress, deployedContract.address]);
            console.log(`kalaToken.registerMinters:${JSON.stringify(receipt)}`,)
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
