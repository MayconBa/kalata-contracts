const hre = require("hardhat");
const {humanBN} = require("../utils/maths");
const assert = require('../utils/assert')
const {toBN} = require("../utils/maths");
const {multiplyDecimal} = require("../utils/maths");
const {evmMine} = require("../utils/block");
const {expect} = require("chai");
const {BigNumber} = require('bignumber.js');
const {fromUnit, toUnitString, toUnit} = require("../utils/maths");
const {randomAddress, ZERO_ADDRESS} = require("../utils/contract");

let instance, collateralInstance;
let owner, bob, alice, tom, factoryAddress, newOwner;
let kalaToken, assetToken, stakingToken, assetToken2, stakingToken2, busdKalaPair;
const unlockSpeed = toUnit("0.1");
let BEP20Token;

async function deployMockAsset(supply) {
    let token = await BEP20Token.deploy();
    await token.initialize("mock", "mock", supply || toUnitString("100000000"));
    return token;
}


async function depositReward(asset, amount) {
    await kalaToken.transfer(instance.address, amount);
    await instance.depositReward(asset.address, amount);
}

async function stake(asset, stakingAsset, account, amount) {
    stakingAsset.transfer(account.address, amount);
    await stakingAsset.connect(account).approve(instance.address, amount);
    await instance.connect(account).stake(asset.address, amount);
}

describe("Staking", () => {
    before(async () => {
        [owner, bob, alice, tom, newOwner] = await hre.ethers.getSigners();
        const Staking = await hre.ethers.getContractFactory("Staking");
        const Collateral = await hre.ethers.getContractFactory("Collateral");
        BEP20Token = await hre.ethers.getContractFactory("BEP20Token", owner);

        instance = await Staking.deploy();
        collateralInstance = await Collateral.deploy();
        kalaToken = await deployMockAsset(toUnitString('1000000'));
        busdKalaPair = await deployMockAsset(toUnitString('1000000'));
        await collateralInstance.initialize();

        //mock factory address
        factoryAddress = owner.address;
        await instance.initialize(factoryAddress, kalaToken.address, collateralInstance.address);

        await collateralInstance.updateConfig(instance.address, [busdKalaPair.address], [unlockSpeed.toString()]);

        //asset-token
        assetToken = await deployMockAsset(toUnitString('1000'));

        //lp-token
        stakingToken = await deployMockAsset(toUnitString('1000'));

        //asset-token2
        assetToken2 = await deployMockAsset(toUnitString('1000'));

        //lp-token2
        stakingToken2 = await deployMockAsset(toUnitString('1000'));
    });
    it("updateConfig", async () => {
        //function updateConfig(address factory, address govToken, address collateralContract)
        let {factory: oldFactory, govToken: oldGovToken, collateralContract: oldCollateralContract} = await instance.queryConfig();
        {
            let [newFactory, newGovToken, newCollateralContract] = [randomAddress(hre), randomAddress(hre), randomAddress(hre)];
            await instance.updateConfig(newFactory, newGovToken, newCollateralContract);
            let {factory, govToken, collateralContract} = await instance.queryConfig();
            expect(factory).to.equal(newFactory);
            expect(govToken).to.equal(newGovToken);
            expect(collateralContract).to.equal(newCollateralContract);
        }
        {
            await instance.updateConfig(oldFactory, oldGovToken, oldCollateralContract);
            let {factory, govToken, collateralContract} = await instance.queryConfig();
            expect(factory).to.equal(oldFactory);
            expect(govToken).to.equal(oldGovToken);
            expect(collateralContract).to.equal(oldCollateralContract);
        }
    });
    it('updateCollateralAssetMapping', async () => {
        //function updateCollateralAssetMapping(address[] memory assets, address[] memory collateralAssets)
        let assets = [randomAddress(hre), randomAddress(hre)];
        let collateralAssets = [randomAddress(hre), randomAddress(hre)];
        await instance.updateCollateralAssetMapping(assets, collateralAssets);
        let {assets: remoteAssets, collateralAssets: remoteCollateralAssets} = await instance.queryCollateralAssetMapping();
        expect(assets[0]).to.equal(remoteAssets[0]);
        expect(assets[1]).to.equal(remoteAssets[1]);
        expect(collateralAssets[0]).to.equal(remoteCollateralAssets[0]);
        expect(collateralAssets[1]).to.equal(remoteCollateralAssets[1]);
    });
    it("registerAsset", async () => {
        {
            // not registed yet, all the config fields are zero
            let asset = randomAddress(hre);
            let {stakingToken, pendingReward, stakingAmount, rewardIndex, registerTimestamp} = await instance.queryStake(asset);
            expect(stakingToken).to.equal(ZERO_ADDRESS);
            expect(pendingReward).to.equal(0);
            expect(stakingAmount).to.equal(0);
            expect(rewardIndex).to.equal(0);
            expect(registerTimestamp).to.equal(0);
        }
        {
            //staking token can be zero, means single asset minting
            let asset = randomAddress(hre);
            await instance.registerAsset(asset, ZERO_ADDRESS);
            let {stakingToken, pendingReward, stakingAmount, rewardIndex, registerTimestamp} = await instance.queryStake(asset);
            expect(stakingToken).to.equal(ZERO_ADDRESS);
            expect(pendingReward).to.equal(0);
            expect(stakingAmount).to.equal(0);
            expect(rewardIndex).to.equal(0);
            expect(registerTimestamp).to.gt(0);
        }

        {
            //staking token can be a pair, means pair asset minting
            let asset = randomAddress(hre);
            let stakingAssetAdddress = randomAddress(hre);
            await instance.registerAsset(asset, stakingAssetAdddress);
            let {stakingToken, pendingReward, stakingAmount, rewardIndex, registerTimestamp} = await instance.queryStake(asset);
            expect(stakingToken).to.equal(stakingAssetAdddress);
            expect(pendingReward).to.equal(0);
            expect(stakingAmount).to.equal(0);
            expect(rewardIndex).to.equal(0);
            expect(registerTimestamp).to.gt(0);
        }
    });
    it("stake lp", async () => {
        let asset = await deployMockAsset(toUnitString('1000'));
        let stakingAsset = await deployMockAsset(toUnitString('1000'));
        await instance.registerAsset(asset.address, stakingAsset.address);
        const stakingAmount = toUnitString('50');
        await stakingAsset.connect(owner).approve(instance.address, stakingAmount);
        await instance.stake(asset.address, toUnitString('50'));
        expect(await stakingAsset.balanceOf(instance.address)).to.equal(stakingAmount);
        {
            //queryReward
            let {stakingAmount: amount, pendingReward} = await instance.queryUserStakingItem(owner.address, asset.address);
            expect(amount).to.equal(stakingAmount);
            expect(pendingReward).to.equal(0);
        }
        {
            //queryStake
            let {stakingToken, pendingReward, stakingAmount: amount, rewardIndex} = await instance.queryStake(asset.address);
            expect(stakingToken).to.equal(stakingAsset.address);
            expect(pendingReward).to.equal(0);
            expect(amount).to.equal(stakingAmount);
            expect(rewardIndex).to.equal(0);
        }
    });
    it("stake kala", async () => {
        let kala = await deployMockAsset(toUnitString('1000'));
        await instance.registerAsset(kala.address, ZERO_ADDRESS);
        const stakingAmount = toUnitString('50');
        await kala.connect(owner).approve(instance.address, stakingAmount);
        await instance.stake(kala.address, toUnitString('50'));
        expect(await kala.balanceOf(instance.address)).to.equal(stakingAmount);
        {
            //queryReward
            let {stakingAmount: amount, pendingReward} = await instance.queryUserStakingItem(owner.address, kala.address);
            expect(amount).to.equal(stakingAmount);
            expect(pendingReward).to.equal(0);
        }
        {
            //queryStake
            let {stakingToken, pendingReward, stakingAmount: amount, rewardIndex} = await instance.queryStake(kala.address);
            expect(stakingToken).to.equal(ZERO_ADDRESS);
            expect(pendingReward).to.equal(0);
            expect(amount).to.equal(stakingAmount);
            expect(rewardIndex).to.equal(0);
        }
    });
    it("depositReward", async () => {
        async function testDepositReward(isPairStaking) {
            let asset = await deployMockAsset();
            let stakingAsset = isPairStaking ? (await deployMockAsset()) : asset;
            await instance.registerAsset(asset.address, isPairStaking ? stakingAsset.address : ZERO_ADDRESS);
            let amount = toUnitString('50')
            await depositReward(asset, amount);
            let {pendingReward, stakingAmount, rewardIndex} = await instance.queryStake(asset.address);
            assert.bnEqual(amount, pendingReward);
            assert.bnEqual(stakingAmount, 0);
            assert.bnEqual(rewardIndex, 0);
            await stake(asset, stakingAsset, alice, toUnitString("20"));
            await stake(asset, stakingAsset, bob, toUnitString("10"));
            await stake(asset, stakingAsset, tom, toUnitString("10"));
            await depositReward(asset, toUnitString("150"));
            {
                let {pendingReward, indexReward} = await instance.queryUserStakingItem(alice.address, asset.address);
                assert.bnEqual(indexReward, toUnit("100"));
                assert.bnEqual(pendingReward, 0);
            }
            {
                await stake(asset, stakingAsset, alice, toUnitString("20"));
                let {pendingReward, indexReward} = await instance.queryUserStakingItem(alice.address, asset.address);
                assert.bnEqual(indexReward, 0);
                assert.bnEqual(pendingReward, toUnit("100"));
            }
        }

        await testDepositReward(true);
        await testDepositReward(false);
    });
    it("reward lock/unlock", async () => {
        let asset = await deployMockAsset();
        let stakingAsset = asset;
        await instance.registerAsset(asset.address, ZERO_ADDRESS);
        await stake(asset, stakingAsset, alice, toUnitString("20"));
        let amount = toUnitString('50')
        await depositReward(asset, amount);
        {
            let {pendingReward, indexReward, claimableReward} = await instance.queryUserStakingItem(alice.address, asset.address);
            assert.bnEqual(amount, claimableReward);
            // console.log('pendingReward', humanBN(pendingReward));
            // console.log('indexReward', humanBN(indexReward));
            // console.log('claimableReward', humanBN(claimableReward));
        }
        {
            await instance.updateCollateralAssetMapping([asset.address], [busdKalaPair.address]);
            let {pendingReward, indexReward, claimableReward} = await instance.queryUserStakingItem(alice.address, asset.address);
            assert.bnEqual("0", claimableReward);
            // console.log('pendingReward', humanBN(pendingReward));
            // console.log('indexReward', humanBN(indexReward));
            // console.log('claimableReward', humanBN(claimableReward));
        }
        {
            let depositAmount = toUnit("2")
            busdKalaPair.transfer(alice.address, depositAmount.toString());
            busdKalaPair.connect(alice).approve(collateralInstance.address, depositAmount.toString())
            console.log('busdKalaPair', busdKalaPair.address);
            await collateralInstance.connect(alice).deposit(busdKalaPair.address, depositAmount.toString())
            const passedBlock = 20;
            await evmMine(hre, passedBlock);
            let unlockedAmount = await collateralInstance.queryUnlockedAmount(alice.address, busdKalaPair.address)

            assert.bnEqual(unlockedAmount, multiplyDecimal(depositAmount.toString(), unlockSpeed.toString()).mul(toBN(passedBlock)))
            //console.log('unlockedAmount', humanBN(unlockedAmount))

            let {pendingReward, indexReward, claimableReward} = await instance.queryUserStakingItem(alice.address, asset.address);
            assert.bnEqual(unlockedAmount, claimableReward);
            // console.log('pendingReward', humanBN(pendingReward));
            // console.log('indexReward', humanBN(indexReward));
            // console.log('claimableReward', humanBN(claimableReward));
        }
        {
            let unlockedAmount = await collateralInstance.queryUnlockedAmount(alice.address, busdKalaPair.address)
            let balance = await kalaToken.balanceOf(alice.address);
            //console.log('balance', humanBN(balance));
            await instance.connect(alice).claim(asset.address);
            let balance2 = await kalaToken.balanceOf(alice.address);
            //console.log('balance2', humanBN(balance2));
            assert.bnGte(balance2.sub(balance), unlockedAmount)
        }
    });
    it("reward cliam time", async () => {
    });
});


function todo() {
    it("unStake lp", async () => {
        //query staking pool
        let [_stakingToken, _pendingReward, _stakingAmount, _rewardIndex] = await instance.queryStake(assetToken.address);
        expect(_stakingToken).to.equal(stakingToken.address);
        expect(_pendingReward).to.equal(0);
        expect(_stakingAmount).to.equal(toUnitString('50'));
        expect(_rewardIndex.toString()).to.equal(toUnitString('2.02'));

        //unStake before query lp
        [_index, _stakingAmount, _pendingRewardOwner] = await instance.queryUserStakingItem(owner.address, assetToken.address);
        expect(_index).to.equal(toUnitString('2.02'));
        expect(_stakingAmount).to.equal(toUnitString('50'));
        expect(_pendingRewardOwner).to.equal(toUnitString('0'));

        //unStake lp
        await instance.connect(owner).unStake(assetToken.address, toUnitString('10'));

        //unStake after query lp
        [_index, _stakingAmount, _pendingRewardOwner] = await instance.queryUserStakingItem(owner.address, assetToken.address);
        expect(_index).to.equal(toUnitString('2.02'));
        expect(_stakingAmount).to.equal(toUnitString('40'));
        expect(_pendingRewardOwner).to.equal(toUnitString('0'));


        [_stakingToken, _pendingReward, _stakingAmount, _rewardIndex] = await instance.queryStake(assetToken.address);
        expect(_stakingToken).to.equal(stakingToken.address);
        expect(_pendingReward).to.equal(0);
        expect(_stakingAmount).to.equal(toUnitString('40'));
        expect(_rewardIndex.toString()).to.equal(toUnitString('2.02'));

        //unStake lp
        await instance.connect(owner).unStake(assetToken.address, toUnitString('40'));

        //delete asset reawrd info
        [_index, _stakingAmount, _pendingRewardOwner] = await instance.queryUserStakingItem(owner.address, assetToken.address);
        expect(_index).to.equal(toUnitString('0'));
        expect(_stakingAmount).to.equal(toUnitString('0'));
        expect(_pendingRewardOwner).to.equal(toUnitString('0'));

        [_stakingToken, _pendingReward, _stakingAmount, _rewardIndex] = await instance.queryStake(assetToken.address);
        expect(_stakingToken).to.equal(stakingToken.address);
        expect(_pendingReward).to.equal(0);
        expect(_stakingAmount).to.equal(toUnitString('0'));
        expect(_rewardIndex.toString()).to.equal(toUnitString('2.02'));

    });

    it("claim all", async () => {
        //balances
        let ownerStakingTokenBalance = await stakingToken.balanceOf(owner.address);
        let ownerStakingTokenBalance2 = await stakingToken2.balanceOf(owner.address);
        expect(ownerStakingTokenBalance).to.equal(toUnitString('1000'));
        expect(ownerStakingTokenBalance2).to.equal(toUnitString('1000'));

        //approve
        await stakingToken.connect(owner).approve(instance.address, toUnitString('50'));
        await stakingToken2.connect(owner).approve(instance.address, toUnitString('80'));

        //allowance
        let approveStakingTokenbalance = await stakingToken.allowance(owner.address, instance.address);
        let approveStakingTokenbalance2 = await stakingToken2.allowance(owner.address, instance.address);
        expect(approveStakingTokenbalance).to.equal(toUnitString('50'));
        expect(approveStakingTokenbalance2).to.equal(toUnitString('80'));

        //stake
        await instance.stake(assetToken.address, toUnitString('50'), 0);
        await instance.stake(assetToken2.address, toUnitString('80'), 0);

        //check balance
        let instanceStakingTokenBalance = await stakingToken.balanceOf(instance.address);
        expect(instanceStakingTokenBalance).to.equal(toUnitString('50'));
        let instanceStakingTokenBalance2 = await stakingToken2.balanceOf(instance.address);
        expect(instanceStakingTokenBalance2).to.equal(toUnitString('80'));


        //factory call transfer and deposit reward
        await kalaToken.connect(owner).transfer(instance.address, toUnitString('100'));
        await instance.depositReward(assetToken.address, toUnitString('100'));
        await kalaToken.connect(owner).transfer(instance.address, toUnitString('100'));
        await instance.depositReward(assetToken2.address, toUnitString('100'));


        let [_index, _stakingAmount, _pendingReward] = await instance.queryUserStakingItem(owner.address, assetToken.address);
        expect(_index).to.equal(toUnitString('2.02'));
        expect(_stakingAmount).to.equal(toUnitString('50'));
        expect(_pendingReward).to.equal(0);

        [_index, _stakingAmount, _pendingReward] = await instance.queryUserStakingItem(owner.address, assetToken2.address);
        expect(_index).to.equal(0);
        expect(_stakingAmount).to.equal(toUnitString('80'));
        expect(_pendingReward).to.equal(0);

        //check balance
        let ownerGovTokenBalance = await kalaToken.balanceOf(owner.address);
        expect(ownerGovTokenBalance).to.equal(toUnitString('800'));
    });
}
