const hre = require("hardhat");
const {expect, assert} = require("chai");
const {BigNumber} = require('bignumber.js');
const {fromUnit, toUnitString} = require("../utils/maths");
const {randomAddress, ZERO_ADDRESS} = require("../utils/contract");


const CONTRACT_NAME = "BEP20Token";
const TOKEN_NAME = "Kala Token for Kalata Governance";
const TOKEN_SYMBOL = "KALA";


describe("Staking", () => {
    let stakingInstance;
    let owner;
    let factoryAddress;
    let newOwner;
    let govToken;
    let assetToken;
    let stakingToken;
    let assetToken2;
    let stakingToken2;

    before(async () => {
        [owner, newOwner] = await hre.ethers.getSigners();
        const Staking = await hre.ethers.getContractFactory("Staking");
        const GovToken = await hre.ethers.getContractFactory(CONTRACT_NAME, owner);

        stakingInstance = await Staking.deploy();
        govToken = await GovToken.deploy();
        await govToken.initialize(TOKEN_NAME, TOKEN_SYMBOL, toUnitString('1000'));

        //mock factory address
        factoryAddress = owner.address;
        await stakingInstance.initialize(factoryAddress, govToken.address);

        //asset-token
        const AssetToken = await hre.ethers.getContractFactory(CONTRACT_NAME, owner);
        assetToken = await AssetToken.deploy();
        await assetToken.initialize("mAsset-token", "mApple", toUnitString('1000'));

        //lp-token
        const StakingToken = await hre.ethers.getContractFactory(CONTRACT_NAME, owner);
        stakingToken = await StakingToken.deploy();
        await stakingToken.initialize("lp-token", "lp", toUnitString('1000'));

        //asset-token2
        const AssetToken2 = await hre.ethers.getContractFactory(CONTRACT_NAME, owner);
        assetToken2 = await AssetToken2.deploy();
        await assetToken2.initialize("mAsset-token", "mTesla", toUnitString('1000'));

        //lp-token2
        const StakingToken2 = await hre.ethers.getContractFactory(CONTRACT_NAME, owner);
        stakingToken2 = await StakingToken2.deploy();
        await stakingToken2.initialize("lp-token", "lp2", toUnitString('1000'));
    });

    describe("Deployment", () => {
        it("setFactory()", async () => {
            const newFactoryAddress = randomAddress(hre);
            await stakingInstance.setFactory(newFactoryAddress);
            let config = await stakingInstance.queryConfig();
            expect(config.factory).to.equal(newFactoryAddress);

            //set back
            await stakingInstance.setFactory(factoryAddress);
            config = await stakingInstance.queryConfig();
            expect(config.factory).to.equal(factoryAddress);
            expect(config.govToken).to.equal(govToken.address);
        });

    });
    it("register asset", async () => {
        let info = await stakingInstance.queryStake(assetToken.address);

        expect(info.stakingToken).to.equal(ZERO_ADDRESS);
        expect(info.pendingReward).to.equal(0);
        expect(info.stakingAmount).to.equal(0);
        expect(info.rewardIndex).to.equal(0);

        await stakingInstance.registerAsset(assetToken.address, stakingToken.address);
        await stakingInstance.registerAsset(assetToken2.address, stakingToken2.address);

        info = await stakingInstance.queryStake(assetToken.address);
        expect(info.stakingToken).to.equal(stakingToken.address);
        expect(info.pendingReward).to.equal(0);
        expect(info.stakingAmount).to.equal(0);
        expect(info.rewardIndex).to.equal(0);

    });

    it("stake lp ", async () => {
        //balances
        let ownerStakingTokenBalance = await stakingToken.balanceOf(owner.address);
        expect(ownerStakingTokenBalance).to.equal(toUnitString('1000'));

        //approve
        await stakingToken.connect(owner).approve(stakingInstance.address, toUnitString('50'));

        //allowance
        let approveStakingTokenbalance = await stakingToken.allowance(owner.address, stakingInstance.address);
        expect(approveStakingTokenbalance).to.equal(toUnitString('50'));

        //stake
        await stakingInstance.stake(assetToken.address, toUnitString('50'));

        //check balance
        let instanceStakingTokenBalance = await stakingToken.balanceOf(stakingInstance.address);
        expect(instanceStakingTokenBalance).to.equal(toUnitString('50'));

        {
            //queryReward
            let {stakingAmount, pendingReward} = await stakingInstance.queryReward(owner.address, assetToken.address);
            expect(stakingAmount).to.equal(toUnitString('50'));
            expect(pendingReward).to.equal(0);
        }
        {
            //queryStake
            let info = await stakingInstance.queryStake(assetToken.address);
            expect(info.stakingToken).to.equal(stakingToken.address);
            expect(info.pendingReward).to.equal(0);
            expect(info.stakingAmount).to.equal(toUnitString('50'));
            expect(info.rewardIndex).to.equal(0);
        }
    });

    it("deposit reward ", async () => {

        let [_stakingToken, _pendingReward, _stakingAmount, _rewardIndex] = await stakingInstance.queryStake(assetToken.address);
        expect(_stakingAmount).to.equal(toUnitString('50'));

        //factory call transfer and depositReward
        await govToken.connect(owner).transfer(stakingInstance.address, toUnitString('101'));
        await stakingInstance.depositReward(assetToken.address, toUnitString('101'));


        [_stakingToken, _pendingReward, _stakingAmount, _rewardIndex] = await stakingInstance.queryStake(assetToken.address);
        expect(_stakingToken).to.equal(stakingToken.address);
        expect(_pendingReward).to.equal(0);
        expect(_stakingAmount).to.equal(toUnitString('50'));
        expect(_rewardIndex.toString()).to.equal(toUnitString('2.02'));

        //staking gov token balance
        let stakingGovBalance = await govToken.balanceOf(stakingInstance.address);
        expect(stakingGovBalance).to.equal(toUnitString('101'));

        //owner gov token balance
        let ownerGovBalance = await govToken.balanceOf(owner.address);
        expect(ownerGovBalance).to.equal(toUnitString('899'));

        //queryReward
        [_index, _stakingAmount, _pendingRewardOwner] = await stakingInstance.queryReward(owner.address, assetToken.address);
        expect(_index).to.equal(0);
        expect(_stakingAmount).to.equal(toUnitString('50'));
        expect(_pendingRewardOwner).to.equal(0);

        let stakingAmount = new BigNumber(_stakingAmount.toString()).dividedBy(1e18);
        let rewardIndex = new BigNumber(_rewardIndex.toString()).dividedBy(1e18);
        let index = new BigNumber(_index.toString()).dividedBy(1e18);

        //claim before
        let ownerReward = stakingAmount.multipliedBy(rewardIndex).minus(stakingAmount.multipliedBy(index));
        expect(ownerReward.toString()).to.equal('101');

        //claim
        await stakingInstance.connect(owner).claim(assetToken.address);

        [_index, _stakingAmount, _pendingRewardOwner] = await stakingInstance.queryReward(owner.address, assetToken.address);
        stakingAmount = new BigNumber(_stakingAmount.toString()).dividedBy(1e18);
        rewardIndex = new BigNumber(_rewardIndex.toString()).dividedBy(1e18);
        index = new BigNumber(_index.toString()).dividedBy(1e18);

        //claim after
        ownerReward = stakingAmount.multipliedBy(rewardIndex).minus(stakingAmount.multipliedBy(index));
        expect(ownerReward.toString()).to.equal('0');

        //staking gov balance
        govBalance = await govToken.balanceOf(stakingInstance.address);
        expect(govBalance).to.equal(0);

        //owner gov balance
        ownerGovBalance = await govToken.balanceOf(owner.address);
        expect(ownerGovBalance).to.equal(toUnitString('1000'));

    });

    it("unStake lp", async () => {

        //query staking pool
        let [_stakingToken, _pendingReward, _stakingAmount, _rewardIndex] = await stakingInstance.queryStake(assetToken.address);
        expect(_stakingToken).to.equal(stakingToken.address);
        expect(_pendingReward).to.equal(0);
        expect(_stakingAmount).to.equal(toUnitString('50'));
        expect(_rewardIndex.toString()).to.equal(toUnitString('2.02'));

        //unStake before query lp
        [_index, _stakingAmount, _pendingRewardOwner] = await stakingInstance.queryReward(owner.address, assetToken.address);
        expect(_index).to.equal(toUnitString('2.02'));
        expect(_stakingAmount).to.equal(toUnitString('50'));
        expect(_pendingRewardOwner).to.equal(toUnitString('0'));

        //unStake lp
        await stakingInstance.connect(owner).unStake(assetToken.address, toUnitString('10'));

        //unStake after query lp
        [_index, _stakingAmount, _pendingRewardOwner] = await stakingInstance.queryReward(owner.address, assetToken.address);
        expect(_index).to.equal(toUnitString('2.02'));
        expect(_stakingAmount).to.equal(toUnitString('40'));
        expect(_pendingRewardOwner).to.equal(toUnitString('0'));


        [_stakingToken, _pendingReward, _stakingAmount, _rewardIndex] = await stakingInstance.queryStake(assetToken.address);
        expect(_stakingToken).to.equal(stakingToken.address);
        expect(_pendingReward).to.equal(0);
        expect(_stakingAmount).to.equal(toUnitString('40'));
        expect(_rewardIndex.toString()).to.equal(toUnitString('2.02'));

        //unStake lp
        await stakingInstance.connect(owner).unStake(assetToken.address, toUnitString('40'));

        //delete asset reawrd info
        [_index, _stakingAmount, _pendingRewardOwner] = await stakingInstance.queryReward(owner.address, assetToken.address);
        expect(_index).to.equal(toUnitString('0'));
        expect(_stakingAmount).to.equal(toUnitString('0'));
        expect(_pendingRewardOwner).to.equal(toUnitString('0'));

        [_stakingToken, _pendingReward, _stakingAmount, _rewardIndex] = await stakingInstance.queryStake(assetToken.address);
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
        await stakingToken.connect(owner).approve(stakingInstance.address, toUnitString('50'));
        await stakingToken2.connect(owner).approve(stakingInstance.address, toUnitString('80'));

        //allowance
        let approveStakingTokenbalance = await stakingToken.allowance(owner.address, stakingInstance.address);
        let approveStakingTokenbalance2 = await stakingToken2.allowance(owner.address, stakingInstance.address);
        expect(approveStakingTokenbalance).to.equal(toUnitString('50'));
        expect(approveStakingTokenbalance2).to.equal(toUnitString('80'));

        //stake
        await stakingInstance.stake(assetToken.address, toUnitString('50'));
        await stakingInstance.stake(assetToken2.address, toUnitString('80'));

        //check balance
        let instanceStakingTokenBalance = await stakingToken.balanceOf(stakingInstance.address);
        expect(instanceStakingTokenBalance).to.equal(toUnitString('50'));
        let instanceStakingTokenBalance2 = await stakingToken2.balanceOf(stakingInstance.address);
        expect(instanceStakingTokenBalance2).to.equal(toUnitString('80'));


        //factory call transfer and deposit reward
        await govToken.connect(owner).transfer(stakingInstance.address, toUnitString('100'));
        await stakingInstance.depositReward(assetToken.address, toUnitString('100'));
        await govToken.connect(owner).transfer(stakingInstance.address, toUnitString('100'));
        await stakingInstance.depositReward(assetToken2.address, toUnitString('100'));


        let [_index, _stakingAmount, _pendingReward] = await stakingInstance.queryReward(owner.address, assetToken.address);
        expect(_index).to.equal(toUnitString('2.02'));
        expect(_stakingAmount).to.equal(toUnitString('50'));
        expect(_pendingReward).to.equal(0);

        [_index, _stakingAmount, _pendingReward] = await stakingInstance.queryReward(owner.address, assetToken2.address);
        expect(_index).to.equal(0);
        expect(_stakingAmount).to.equal(toUnitString('80'));
        expect(_pendingReward).to.equal(0);

        //check balance
        let ownerGovTokenBalance = await govToken.balanceOf(owner.address);
        expect(ownerGovTokenBalance).to.equal(toUnitString('800'));


        //claim all
        // await instance.claim(ZERO_ADDRESS);
        //
        // [_index, _stakingAmount, _pendingReward] = await instance.queryReward(owner.address, assetToken.address);
        // expect(_index).to.equal(toUnitString('4.02'));
        // expect(_stakingAmount).to.equal(toUnitString('50'));
        // expect(_pendingReward).to.equal(0);
        //
        // [_index, _stakingAmount, _pendingReward] = await instance.queryReward(owner.address, assetToken2.address);
        // expect(_index).to.equal(toUnitString('1.25'));
        // expect(_stakingAmount).to.equal(toUnitString('80'));
        // expect(_pendingReward).to.equal(0);
        //
        //  //check balance
        // ownerGovTokenBalance = await govToken.balanceOf(owner.address);
        // expect(ownerGovTokenBalance).to.equal(toUnitString('1000'));

    });

});
