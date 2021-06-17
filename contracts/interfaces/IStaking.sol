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

    struct AssetStake {
        address stakingToken;
        uint pendingReward;
        uint stakingAmount;
        uint rewardIndex;
    }


    struct Reward {
        uint index;
        uint stakingAmount;
        uint pendingReward;
    }


    function initialize(address factory, address _govToken) external;

    function setFactory(address factory) external;

    event SetFactory(address factory);

    function registerAsset(address asset, address stakingToken) external;

    event RegisterAsset(address indexed asset, address indexed stakingToken);

    function stake(address asset, uint stakingTokenAmount) external;

    event Stake(address indexed asset, uint stakingTokenAmount);

    function unStake(address asset, uint amount) external;

    event UnStake(address indexed asset, uint amount);

    function depositReward(address asset, uint amount) external;

    event DepositReward(address asset, uint amount);

    function claim(address asset) external;

    event Withdraw(address indexed asset, address indexed sender, uint amount);

    function queryStakes() external view returns (
        address[] memory assets,
        uint[] memory pendingRewards,
        uint[] memory stakingAmounts
    );

    function queryStake(address asset) external view returns (
        address stakingToken,
        uint pendingReward,
        uint stakingAmount,
        uint rewardIndex
    );


    function queryReward(address staker, address asset) external view returns (
        uint index,
        uint stakingAmount,
        uint pendingReward
    );

    function queryRewards(address staker) external view returns (
        address[] memory assets,
        uint[] memory stakingAmounts,
        uint[] memory pendingRewards
    );

    function queryAllAssets() external view returns (
        address[] memory assets,
        address[] memory stakingTokens,
        uint[] memory pendingRewards,
        uint[] memory stakingAmounts,
        uint[] memory rewardIndexs
    );


    function queryConfig() external view returns (address configOwner, address govToken);


}


