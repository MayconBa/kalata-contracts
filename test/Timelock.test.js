const hre = require("hardhat");
const {constants, time} = require('@openzeppelin/test-helpers');
const {ZERO_BYTES32} = constants;
const {randomAddress} = require("../utils/contract");
const {expect} = require("chai");
let deployer, proposer, executor, alice, bob, jacob;

const Contract = require('web3-eth-contract');

Contract.setProvider(hre.network.provider)
const MINDELAY = time.duration.days(1);
const CONTRACT_CLASS = 'Timelock'


describe(CONTRACT_CLASS, () => {
    before(async () => {
        [deployer, proposer, executor, alice, bob, jacob] = await hre.ethers.getSigners();
        const {abi, bytecode} = await hre.artifacts.readArtifact(CONTRACT_CLASS);
        //let Contract = new hre.web3.eth.Contract(abi, null, {data: bytecode});
        let minDelay = 3600 * 24;
        let proposers = [proposer.address, deployer.address];
        let executors = [executor.address, deployer.address];
        const Contract = await hre.ethers.getContractFactory(CONTRACT_CLASS);
        this.timelock = await Contract.deploy(MINDELAY.toString(), proposers, executors);
    });


});

function todo(){
    it("staking.setConfig", async () => {
        let factoryAddress = randomAddress(hre);
        let govTokenAddress = randomAddress(hre);
        const {abi} = await hre.artifacts.readArtifact("Staking");
        const Staking = await hre.ethers.getContractFactory("Staking");
        let staking = await Staking.deploy();
        let collateralContract = randomAddress(hre)
        await staking.initialize(factoryAddress, govTokenAddress, collateralContract);
        await staking.transferOwnership(this.timelock.address);
        let factory = (await staking.queryConfig()).factory;
        expect(factory).to.equal(factoryAddress);
        let web3Staking = new Contract(abi, staking.address);
        let newFactory = randomAddress(hre);

        let data = web3Staking.methods.setFactory(newFactory).encodeABI();
        console.log('data', data)
        //function schedule(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt, uint256 delay)
        let scheduleParameters = [staking.address, 0, data, ZERO_BYTES32, ZERO_BYTES32, time.duration.days(2).toString()]
        console.log(scheduleParameters)
        let receipt = await this.timelock.schedule(...scheduleParameters);
        let confirmations = await receipt.wait();
        let id = confirmations.events[0].args['id'];
        console.log("id", id);
        let timestamp = await this.timelock.getTimestamp(id)
        console.log("timestamp", timestamp.toString())

        //function execute(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt)
        let executeParameters = [staking.address, 0, data, ZERO_BYTES32, ZERO_BYTES32]
        await time.increaseTo(timestamp + 2);
        receipt = await this.timelock.execute(...executeParameters);
        await receipt.wait();
        factory = (await staking.queryConfig()).factory;
        expect(factory).to.equal(newFactory);
    });
}


