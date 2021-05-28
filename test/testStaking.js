const {hre, ethers} = require("hardhat");
const {expect, assert} = require("chai");
const {BigNumber} = require('bignumber.js');
const { fromUnit, toUnitString } = require("../utils/maths");


const CONTRACT_NAME = "BEP20Token";
const TOKEN_NAME = "Kala Token for Kalata Governance";
const TOKEN_SYMBOL = "KALA";

const ZERO_ADDRESS= "0x0000000000000000000000000000000000000000";

describe("Staking", () => {

   let owner;
   let newOwner;
   let govToken;
   let instance;

   let assetToken;
   let stakingToken;

   let assetToken2;
   let stakingToken2;

   before(async () => {

      [owner, newOwner, addr1] =  await ethers.getSigners();
      const Staking = await ethers.getContractFactory("Staking");
      const GovToken =  await ethers.getContractFactory(CONTRACT_NAME, owner);

      instance = await Staking.deploy();
      govToken = await GovToken.deploy();
      await govToken.initialize(TOKEN_NAME, TOKEN_SYMBOL, toUnitString('1000'));
      await instance.initialize(owner.address, govToken.address);

      //asset-token
      const AssetToken =  await ethers.getContractFactory(CONTRACT_NAME, owner);
      assetToken = await AssetToken.deploy();
      await assetToken.initialize("mAsset-token", "mApple", toUnitString('1000'));

      //lp-token
      const StakingToken =  await ethers.getContractFactory(CONTRACT_NAME, owner);
      stakingToken = await StakingToken.deploy();
      await stakingToken.initialize("lp-token", "lp", toUnitString('1000'));

       //asset-token2
       const AssetToken2 =  await ethers.getContractFactory(CONTRACT_NAME, owner);
       assetToken2 = await AssetToken2.deploy();
       await assetToken2.initialize("mAsset-token", "mTesla", toUnitString('1000'));

       //lp-token2
       const StakingToken2 =  await ethers.getContractFactory(CONTRACT_NAME, owner);
       stakingToken2 = await StakingToken2.deploy();
       await stakingToken2.initialize("lp-token", "lp2", toUnitString('1000'));
   });

   describe("Deployment", () => {

      it("setFactory()", async () => {
         let [_owner, _gov] = await instance.queryConfig();
         expect(_owner).to.equal(owner.address);
         expect(_gov).to.equal(govToken.address);

         await instance.setFactory(newOwner.address);
         let [_owner2] = await instance.queryConfig();
         expect(_owner2).to.equal(newOwner.address);
      });


      it("register asset", async () => {

         let [_stakingToken, _pendingReward, _stakingAmount, _rewardIndex] = await instance.queryStake(assetToken.address);
         expect(_stakingToken).to.equal(ZERO_ADDRESS);
         expect(_pendingReward).to.equal(0);
         expect(_stakingAmount).to.equal(0);
         expect(_rewardIndex).to.equal(0);

         await instance.connect(newOwner).registerAsset(assetToken.address, stakingToken.address);
         await instance.connect(newOwner).registerAsset(assetToken2.address, stakingToken2.address);

         [_stakingToken, _pendingReward, _stakingAmount, _rewardIndex] = await instance.queryStake(assetToken.address);
         expect(_stakingToken).to.equal(stakingToken.address);
         expect(_pendingReward).to.equal(0);
         expect(_stakingAmount).to.equal(0);
         expect(_rewardIndex).to.equal(0);

      });

      it("stake lp ", async () => {

         //balances
         let ownerStakingTokenBalance = await stakingToken.balanceOf(owner.address);
         expect(ownerStakingTokenBalance).to.equal(toUnitString('1000'));

         //approve
         await stakingToken.connect(owner).approve(instance.address, toUnitString('50'));

         //allowance
         let approveStakingTokenbalance = await stakingToken.allowance(owner.address, instance.address);
         expect(approveStakingTokenbalance).to.equal(toUnitString('50'));

         //stake
         await instance.stake(assetToken.address, toUnitString('50'));

         //check balance
         let instanceStakingTokenBalance = await stakingToken.balanceOf(instance.address);
         expect(instanceStakingTokenBalance).to.equal(toUnitString('50'));

         //queryAssetReward
         let [_index, _stakingAmount, _pendingReward] = await instance.queryAssetReward(owner.address, assetToken.address);
         expect(_index).to.equal(0);
         expect(_stakingAmount).to.equal(toUnitString('50'));
         expect(_pendingReward).to.equal(0);

         //queryStake
         let [_stakingToken, _poolPendingReward, _stakingAmount2, _rewardIndex] = await instance.queryStake(assetToken.address);
         expect(_stakingToken).to.equal(stakingToken.address);
         expect(_poolPendingReward).to.equal(0);
         expect(_stakingAmount2).to.equal(toUnitString('50'));
         expect(_rewardIndex).to.equal(0);

      });

      it("deposit reward ", async () => {

           [_stakingToken, _pendingReward, _stakingAmount, _rewardIndex] = await instance.queryStake(assetToken.address);
         expect(_stakingAmount).to.equal(toUnitString('50'));

         //factory call transfer and depositReward
         await govToken.connect(owner).transfer(instance.address, toUnitString('101'));
         await instance.depositReward(assetToken.address, toUnitString('101'));


         [_stakingToken, _pendingReward, _stakingAmount, _rewardIndex] = await instance.queryStake(assetToken.address);
         expect(_stakingToken).to.equal(stakingToken.address);
         expect(_pendingReward).to.equal(0);
         expect(_stakingAmount).to.equal(toUnitString('50'));
         expect(_rewardIndex.toString()).to.equal(toUnitString('2.02'));

         //staking gov token balance
         let stakingGovBalance = await govToken.balanceOf(instance.address);
         expect(stakingGovBalance).to.equal(toUnitString('101'));

         //owner gov token balance
         let ownerGovBalance = await govToken.balanceOf(owner.address);
         expect(ownerGovBalance).to.equal(toUnitString('899'));

         //queryAssetReward
         let [_index, _stakingAmount, _pendingRewardOwner] = await instance.queryAssetReward(owner.address, assetToken.address);
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
         await instance.connect(owner).claim(assetToken.address);

         [_index, _stakingAmount, _pendingRewardOwner] = await instance.queryAssetReward(owner.address, assetToken.address);
         stakingAmount = new BigNumber(_stakingAmount.toString()).dividedBy(1e18);
         rewardIndex = new BigNumber(_rewardIndex.toString()).dividedBy(1e18);
         index = new BigNumber(_index.toString()).dividedBy(1e18);

          //claim after
         ownerReward = stakingAmount.multipliedBy(rewardIndex).minus(stakingAmount.multipliedBy(index));
         expect(ownerReward.toString()).to.equal('0');

         //staking gov balance
         govBalance = await govToken.balanceOf(instance.address);
         expect(govBalance).to.equal(0);

         //owner gov balance
         ownerGovBalance = await govToken.balanceOf(owner.address);
         expect(ownerGovBalance).to.equal(toUnitString('1000'));

      });

      it("unStake lp", async () => {

         //query staking pool
           [_stakingToken, _pendingReward, _stakingAmount, _rewardIndex] = await instance.queryStake(assetToken.address);
         expect(_stakingToken).to.equal(stakingToken.address);
         expect(_pendingReward).to.equal(0);
         expect(_stakingAmount).to.equal(toUnitString('50'));
         expect(_rewardIndex.toString()).to.equal(toUnitString('2.02'));

         //unStake before query lp
         let [_index, _stakingAmount, _pendingRewardOwner] = await instance.queryAssetReward(owner.address, assetToken.address);
         expect(_index).to.equal(toUnitString('2.02'));
         expect(_stakingAmount).to.equal(toUnitString('50'));
         expect(_pendingRewardOwner).to.equal(toUnitString('0'));

         //unStake lp
         await instance.connect(owner).unStake(assetToken.address, toUnitString('10'));

         //unStake after query lp
         [_index, _stakingAmount, _pendingRewardOwner] = await instance.queryAssetReward(owner.address, assetToken.address);
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
         [_index, _stakingAmount, _pendingRewardOwner] = await instance.queryAssetReward(owner.address, assetToken.address);
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
         await instance.stake(assetToken.address, toUnitString('50'));
         await instance.stake(assetToken2.address, toUnitString('80'));

         //check balance
         let instanceStakingTokenBalance = await stakingToken.balanceOf(instance.address);
         expect(instanceStakingTokenBalance).to.equal(toUnitString('50'));
         let instanceStakingTokenBalance2 = await stakingToken2.balanceOf(instance.address);
         expect(instanceStakingTokenBalance2).to.equal(toUnitString('80'));


         //factory call transfer and deposit reward
         await govToken.connect(owner).transfer(instance.address, toUnitString('100'));
         await instance.depositReward(assetToken.address, toUnitString('100'));
         await govToken.connect(owner).transfer(instance.address, toUnitString('100'));
         await instance.depositReward(assetToken2.address, toUnitString('100'));


         let [_index, _stakingAmount, _pendingReward] = await instance.queryAssetReward(owner.address, assetToken.address);
         expect(_index).to.equal(toUnitString('2.02'));
         expect(_stakingAmount).to.equal(toUnitString('50'));
         expect(_pendingReward).to.equal(0);

         [_index, _stakingAmount, _pendingReward] = await instance.queryAssetReward(owner.address, assetToken2.address);
         expect(_index).to.equal(0);
         expect(_stakingAmount).to.equal(toUnitString('80'));
         expect(_pendingReward).to.equal(0);

           //check balance
         let ownerGovTokenBalance = await govToken.balanceOf(owner.address);
         expect(ownerGovTokenBalance).to.equal(toUnitString('800'));


         //claim all
         // await instance.claim(ZERO_ADDRESS);
         //
         // [_index, _stakingAmount, _pendingReward] = await instance.queryAssetReward(owner.address, assetToken.address);
         // expect(_index).to.equal(toUnitString('4.02'));
         // expect(_stakingAmount).to.equal(toUnitString('50'));
         // expect(_pendingReward).to.equal(0);
         //
         // [_index, _stakingAmount, _pendingReward] = await instance.queryAssetReward(owner.address, assetToken2.address);
         // expect(_index).to.equal(toUnitString('1.25'));
         // expect(_stakingAmount).to.equal(toUnitString('80'));
         // expect(_pendingReward).to.equal(0);
         //
         //  //check balance
         // ownerGovTokenBalance = await govToken.balanceOf(owner.address);
         // expect(ownerGovTokenBalance).to.equal(toUnitString('1000'));

      });
   });

});
