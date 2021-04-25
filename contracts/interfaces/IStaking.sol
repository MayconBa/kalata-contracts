// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

//The Staking Contract contains the logic for LP Token staking and reward distribution.
//Staking rewards for LP stakers come from the new KALA tokens generated at each block by the Factory Contract
//and are split between all combined staking pools.
//The new KALA tokens are distributed in proportion to size of staked LP tokens multiplied
//by the weight of that asset's staking pool.
interface IStaking {

    struct Config {
        address factory;
        address govToken;
    }

    struct Stake {
        //lp token
        address stakingToken;
        // not distributed amount due to zero bonding
        uint pendingReward;
        uint totalStakingAmount;
        uint rewardIndex;
    }


    struct Reward {
        uint index;
        uint bondAmount;
        uint pendingReward;
    }

    function initialize(address factory, address _govToken) external;

    function setFactory(address factory) external;

    function registerAsset(address assetToken, address stakingToken) external;

    function stake(address assetToken, uint amount) external;

    function unstake(address assetToken, uint amount) external;

    function depositReward(address assetToken, uint amount) external;

    function claim(address assetToken) external;

    function queryStake(address assetToken) external view returns (address stakingToken, uint pendingReward, uint totalStakingAmount, uint rewardIndex);

    function queryStakes()   external view returns (
        address[] memory tokens,
        address[] memory stakingTokens,
        uint[] memory pendingRewards,
        uint[] memory totalStakingAmounts,
        uint[] memory rewardIndexes
    );

    function queryConfig() external view returns (address configOwner, address govToken);

    function queryAssetReward(address staker, address assetToken) external view returns (uint index, uint bondAmount, uint pendingReward);

    function queryAllAssetRewards(address staker) external view returns (
        address[] memory assetTokens,
        uint[] memory indexes,
        uint[] memory bondAmounts,
        uint[] memory pendingRewards
    );

    event RegisterAsset(address indexed assetToken, address indexed stakingToken);
    event Withdraw(address indexed assetToken, address indexed sender, uint amount);
    event Bond(address indexed assetToken, uint amount);
    event UnBond(address indexed assetToken, uint amount);

}


