const hre = require("hardhat");
const assert = require('../utils/assert')
const {multiplyDecimal, humanBN, toBN} = require("../utils/maths");
const {toUnit} = require("../utils/maths");
const {toUnitString} = require("../utils/maths");
const {expect} = require("chai");
const {getBlockNumber, evmMine} = require('../utils/block')

const CONTRACT = 'Collateral'

let owner, staking, alice, bob;
let mockAsset, instance;
const unlockSpeed = toUnit("0.1");

describe(CONTRACT, () => {
    beforeEach(async () => {
        [owner, staking, alice, bob] = await hre.ethers.getSigners();
        const ContractFactory = await hre.ethers.getContractFactory(CONTRACT);
        instance = await ContractFactory.deploy();
        const BEP20TokenFactory = await hre.ethers.getContractFactory('BEP20Token', owner);
        mockAsset = await BEP20TokenFactory.deploy();
        await mockAsset.initialize("mock", "mock", toUnitString('10000000'));

        await mockAsset.transfer(alice.address, toUnitString("50000"))
        await mockAsset.transfer(bob.address, toUnitString("50000"))

        expect(mockAsset.address).to.properAddress;

        //address kalaContract, address stakingContract, uint unlockSpeed
        await instance.initialize();
        await instance.updateConfig(staking.address, [mockAsset.address], [unlockSpeed.toString()]);
        expect(instance.address).to.properAddress;
    });

    it('deposit/withdraw', async () => {
        let depositAmount1 = toUnit("500");
        await mockAsset.connect(alice).approve(instance.address, depositAmount1.toString());
        let receipt = await instance.connect(alice).deposit(mockAsset.address, depositAmount1.toString());
        await receipt.wait();
        let {amount: remoteStakingAmount, blockNumber} = await instance.queryDeposit(alice.address, mockAsset.address);
        assert.bnEqual(depositAmount1, remoteStakingAmount);
        await evmMine(hre, 20);
        let unlockedAmount1 = await instance.queryUnlockedAmount(alice.address, mockAsset.address)

        assert.bnEqual(unlockedAmount1, await getUnlockedAmount(depositAmount1, blockNumber));

        let withdrawAmount1 = toUnit("100");
        await instance.connect(alice).withdraw(mockAsset.address, withdrawAmount1.toString());

        let unlockedAmount2 = await instance.queryUnlockedAmount(alice.address, mockAsset.address);

        assert.bnEqual(unlockedAmount2, await getUnlockedAmount(depositAmount1, blockNumber));

        await evmMine(hre, 30);
        let unlockedAmount3 = await instance.queryUnlockedAmount(alice.address, mockAsset.address);

        let {amount: remoteStakingAmount2, blockNumber: remoteBlockNumber2} = await instance.queryDeposit(alice.address, mockAsset.address);

        let addedUnlockedAmount1 = await getUnlockedAmount(remoteStakingAmount2, remoteBlockNumber2);
        assert.bnEqual(unlockedAmount3.sub(unlockedAmount2), addedUnlockedAmount1);

    });

    it('reduceUnlockedAmount', async () => {
        let depositAmount = toUnit("200");
        await mockAsset.connect(bob).approve(instance.address, depositAmount.toString());
        {
            let receipt = await instance.connect(bob).deposit(mockAsset.address, depositAmount.toString());
            await receipt.wait();
        }
        let {amount: remoteStakingAmount, blockNumber: remoteStakingBlockNumber} = await instance.queryDeposit(bob.address, mockAsset.address);
        {
            assert.bnEqual(depositAmount, remoteStakingAmount);
            await evmMine(hre, 20);
            let unlockedAmount = await instance.queryUnlockedAmount(bob.address, mockAsset.address)
            assert.bnEqual(unlockedAmount, await getUnlockedAmount(depositAmount, remoteStakingBlockNumber));
        }
        {
            let reduceAmount = toUnit("100")
            let receipt = await instance.reduceUnlockedAmount(bob.address, mockAsset.address, reduceAmount.toString())
            await receipt.wait();
            let unlockedAmount = await instance.queryUnlockedAmount(bob.address, mockAsset.address)
            assert.bnEqual(
                await getUnlockedAmount(depositAmount, remoteStakingBlockNumber),
                toBN(unlockedAmount.toString()).add(toBN(reduceAmount.toString()))
            )
        }
    });

});

async function getUnlockedAmount(depositAmount, stakingBlockNumber) {
    let passedBlockNumber = (await getBlockNumber(hre)) - parseInt(stakingBlockNumber.toString());
    return multiplyDecimal(depositAmount.toString(), unlockSpeed.toString()).mul(toBN(passedBlockNumber))
}
