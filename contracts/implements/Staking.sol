// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;


import "hardhat/console.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../interfaces/IStaking.sol";
import "../libraries/SafeDecimalMath.sol";
import "../interfaces/IBEP20Token.sol";


// The Staking Contract contains the logic for LP Token staking and reward distribution.
// Staking rewards for LP stakers come from the new Kala tokens generated at each block by the Factory Contract and are split between all combined staking pools.
// The new Kala tokens are distributed in proportion to size of staked LP tokens multiplied by the weight of that asset's staking pool.
contract Staking is OwnableUpgradeable, IStaking {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    Config config;

    mapping(address => StakingPool) assetPoolMap;

    //sender=>assetToken=>Reward
    mapping(address => mapping(address => Reward)) stakerAssetRewardMap;

    //sender=>assetToken[], used for loop stakerAssetRewardMap easily
    mapping(address => address[]) stakerAssetsMap;


    modifier onlyFactoryOrOwner() {
        require(config.factory == msg.sender || msg.sender == owner(), "Unauthorized,only Staking's owner/factory can perform");
        _;
    }

    function initialize(address _factory, address _govToken) override external virtual initializer {
        __Ownable_init();
        config.factory = _factory;
        config.govToken = _govToken;
    }


    function setFactory(address factory) override external onlyOwner {
        require(factory != address(0), "Invalid parameter");
        config.factory = factory;
    }

    // Registers a new staking pool for an asset token and associates the LP token(Pair) with the staking pool.
    // assetToken: Contract address of mAsset/Kala token (staking pool identifier)
    // stakingToken: Contract address of asset's corresponding LP Token
    function registerAsset(address assetToken, address stakingToken) override external onlyFactoryOrOwner {
        require(assetPoolMap[assetToken].stakingToken == address(0), "Asset was already registered");

        assetPoolMap[assetToken] = StakingPool({stakingToken : stakingToken, pendingReward : 0, totalBondAmount : 0, rewardIndex : 0});

        emit RegisterAsset(assetToken, stakingToken);
    }

    // Can be issued when the user sends LP Tokens to the Staking contract.
    // The LP token must be recognized by the staking pool of the specified asset token.
    function bond(address assetToken, uint amount) override external {
        require(assetToken != address(0), "invalid asset token");
        require(amount > 0, "invalid amount");

        StakingPool memory pool = assetPoolMap[assetToken];
        require(pool.stakingToken != address(0), "unauthorized");

        Reward memory reward = stakerAssetRewardMap[msg.sender][assetToken];

        reward.index = pool.rewardIndex;
        reward.pendingReward = reward.pendingReward.add(reward.bondAmount.multiplyDecimal(pool.rewardIndex.sub(reward.index)));

        require(IBEP20Token(pool.stakingToken).transferFrom(msg.sender, address(this), amount), "transferFrom fail");

        //Increase bond_amount
        pool.totalBondAmount = pool.totalBondAmount.add(amount);
        reward.bondAmount = reward.bondAmount.add(amount);

        //save
        assetPoolMap[assetToken] = pool;

        saveReward(msg.sender, assetToken, reward.index, reward.bondAmount, reward.pendingReward);

        emit Bond(assetToken, amount);
    }



    /**
        Users can issue the unbond message at any time to remove their staked LP tokens from a staking position.
        assetToken: Contract address of mAsset/KALA token (staking pool identifier)
        amount: Amount of LP tokens to unbond
    */
    function unBond(address assetToken, uint amount) override external {
        require(amount > 0, "invalid amount");

        address sender = msg.sender;

        StakingPool memory stakingPool = assetPoolMap[assetToken];
        Reward memory rewardInfo = stakerAssetRewardMap[sender][assetToken];
        require(stakingPool.stakingToken != address(0), "unauthorized");
        require(rewardInfo.bondAmount >= amount, "Cannot unbond more than bond amount");

        rewardInfo.index = stakingPool.rewardIndex;
        rewardInfo.pendingReward = rewardInfo.pendingReward.add(rewardInfo.bondAmount.multiplyDecimal(stakingPool.rewardIndex.sub(rewardInfo.index)));

        stakingPool.totalBondAmount = stakingPool.totalBondAmount.sub(amount);
        rewardInfo.bondAmount = rewardInfo.bondAmount.sub(amount);

        if (rewardInfo.pendingReward == 0 && rewardInfo.bondAmount == 0) {
            removeReward(sender, assetToken);
        } else {
            saveReward(sender, assetToken, rewardInfo.index, rewardInfo.bondAmount, rewardInfo.pendingReward);
        }

        assetPoolMap[assetToken] = stakingPool;
        IBEP20Token(stakingPool.stakingToken).transfer(msg.sender, amount);

        emit UnBond(assetToken, amount);
    }


    /**
        Can be issued when the user sends KALA tokens to the Staking contract,
        which will be used as rewards for the specified asset's staking pool.
        Used by Factory Contract to deposit newly minted KALA tokens.
    **/
    function depositReward(address assetToken, uint amount) override external {
        //require(config.govToken == msg.sender, "unauthorized");
        StakingPool memory stakingPool = assetPoolMap[assetToken];
        if (stakingPool.totalBondAmount == 0) {
            stakingPool.pendingReward = stakingPool.pendingReward.add(amount);
        } else {

            uint rewardPerBond = (amount.add(stakingPool.pendingReward)).divideDecimal(stakingPool.totalBondAmount);
            stakingPool.rewardIndex = stakingPool.rewardIndex.add(rewardPerBond);
            stakingPool.pendingReward = 0;
        }
        assetPoolMap[assetToken] = stakingPool;
    }



    /*
         Page Stake  -> Claim all rewards
         withdraw all rewards or single reward depending on asset_token
         Withdraws a user's rewards for a specific staking position.
    */
    function withdraw(address _assetToken) override public {
        // require(_assetToken != address(0), "Invalid assetToken address");
        uint amount;
        address sender = msg.sender;
        if (_assetToken != address(0)) {
            Reward memory reward = stakerAssetRewardMap[sender][_assetToken];
            uint pendingReward = withdrawReward(sender, _assetToken, reward.index, reward.bondAmount, reward.pendingReward);
            amount = amount.add(pendingReward);
        } else {

            uint stakerAssetSize = stakerAssetsMap[sender].length;
            for (uint i = 0; i < stakerAssetSize; i++) {
                Reward memory reward = stakerAssetRewardMap[sender][stakerAssetsMap[sender][i]];
                uint pendingReward = withdrawReward(sender, stakerAssetsMap[sender][i], reward.index, reward.bondAmount, reward.pendingReward);
                amount = amount.add(pendingReward);
            }
        }
        if (amount > 0) {
            IBEP20Token(config.govToken).transfer(sender, amount);
        }

        emit Withdraw(_assetToken, sender, amount);
    }


    function withdrawReward(address sender, address assetToken, uint rewardIndex, uint rewardBondAmount, uint rewardPendingReward) private returns (uint){
        StakingPool memory stakingPool = assetPoolMap[assetToken];

        if (rewardBondAmount == 0) {
            removeReward(sender, assetToken);
        } else {
            saveReward(sender, assetToken, stakingPool.rewardIndex, rewardBondAmount, 0);
        }

        return rewardPendingReward.add(rewardBondAmount.multiplyDecimal(stakingPool.rewardIndex.sub(rewardIndex)));
    }


    function queryStakingPool(address assetToken) override external view returns (address stakingToken, uint pendingReward, uint totalBondAmount, uint rewardIndex) {
        require(assetToken != address(0), "Invalid assetToken address");
        StakingPool memory stakingPool = assetPoolMap[assetToken];
        stakingToken = stakingPool.stakingToken;
        pendingReward = stakingPool.pendingReward;
        totalBondAmount = stakingPool.totalBondAmount;
        rewardIndex = stakingPool.rewardIndex;
    }

    function queryConfig() override external view returns (address factory, address govToken){
        Config memory m = config;
        factory = m.factory;
        govToken = m.govToken;
    }

    function queryAssetReward(address staker, address assetToken) override external view returns (uint index, uint bondAmount, uint pendingReward){
        require(staker != address(0), "Invalid staker address");
        require(assetToken != address(0), "Invalid assetToken address");
        Reward memory reward = stakerAssetRewardMap[staker][assetToken];
        index = reward.index;
        bondAmount = reward.bondAmount;
        pendingReward = reward.pendingReward;
    }

    function queryAllAssetRewards(address staker) override external view returns (
        address[] memory assetTokens,
        uint[] memory indexes,
        uint[] memory bondAmounts,
        uint[] memory pendingRewards
    ) {
        require(staker != address(0), "Invalid staker address");
        uint length = stakerAssetsMap[staker].length;

        assetTokens = new address[](length);
        indexes = new uint[](length);
        bondAmounts = new uint[](length);
        pendingRewards = new uint[](length);

        for (uint i = 0; i < length; i++) {
            address assetToken = stakerAssetsMap[staker][i];
            Reward memory reward = stakerAssetRewardMap[staker][assetToken];
            assetTokens[i] = assetToken;
            indexes[i] = reward.index;
            bondAmounts[i] = reward.bondAmount;
            pendingRewards[i] = reward.pendingReward;
        }


    }

    ///// private methods ///
    function saveReward(address sender, address assetToken, uint _index, uint _bondAmount, uint _pendingReward) private {
        uint exists = 0;

        for (uint i = 0; i < stakerAssetsMap[sender].length; i++) {
            if (stakerAssetsMap[sender][i] == assetToken) {
                exists = 1;
                break;
            }
        }
        if (exists == 0) {
            stakerAssetsMap[sender].push(assetToken);
        }

        stakerAssetRewardMap[sender][assetToken] = Reward({index : _index, bondAmount : _bondAmount, pendingReward : _pendingReward});
    }

    function removeReward(address sender, address assetToken) private {
        for (uint i = 0; i < stakerAssetsMap[sender].length; i++) {
            if (stakerAssetsMap[sender][i] == assetToken) {
                for (uint j = i + 1; j < stakerAssetsMap[sender].length; j++) {
                    if (j == stakerAssetsMap[sender].length - 1) {
                        //delete last elements
                        delete stakerAssetsMap[sender][j];
                    } else {
                        //move forward
                        stakerAssetsMap[sender][j - 1] = stakerAssetsMap[sender][j];
                    }
                }
                break;
            }
        }
        delete stakerAssetRewardMap[sender][assetToken];
    }


}