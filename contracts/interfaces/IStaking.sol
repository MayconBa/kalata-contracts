// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

interface IStaking {

    event UpdateConfig(address indexed sender, address factory, address govToken, address collateralContract);
    event RegisterAsset(address indexed sender, address indexed asset, address indexed stakingToken);
    event Stake(address indexed sender, address indexed asset, uint stakingTokenAmount);
    event DepositReward(address indexed sender, address indexed asset, uint amounts);
    event DepositRewards(address indexed sender, address[] assets, uint[] amounts);
    event Withdraw(address indexed sender, address indexed asset, uint amount);
    event UnStake(address indexed sender, address indexed asset, uint amount);
    event UpdateClaimIntervals(address indexed sender, address[] assets, uint[] intervals);
    event SetLockable(address indexed sender, address asset, bool lockable);
    event UpdateCollateralAssetMapping(address indexed sender, address[] assets, address[] collateralAssets);

    function updateConfig(address factory, address govToken, address kalaCollateralContract) external;

    function registerAsset(address asset, address stakingToken) external;

    function stake(address asset, uint stakingAmount) external;

    function unStake(address asset, uint amount) external;

    function depositRewards(address[] memory assets, uint[] memory amounts) external;

    function depositReward(address asset, uint amount) external;

    function claim(address asset) external;

    function queryStakes() external view returns (
        address[] memory assets,
        uint[] memory pendingRewards,
        uint[] memory stakingAmounts
    );

    function queryStake(address asset) external view returns (
        address stakingToken,
        uint pendingReward,
        uint stakingAmount,
        uint rewardIndex,
        uint registerTimestamp
    );


    function queryUserStakingItem(address staker, address asset) external view returns (
        uint index,
        uint stakingAmount,
        uint pendingReward,
        uint indexReward,
        uint claimableReward
    );

    function queryRewards(address staker) external view returns (
        address[] memory assets,
        uint[] memory stakingAmounts,
        uint[] memory pendingRewards,
        uint[] memory claimableRewards
    );

    function queryAllAssets() external view returns (
        address[] memory assets,
        address[] memory stakingTokens,
        uint[] memory pendingRewards,
        uint[] memory stakingAmounts,
        uint[] memory rewardIndexs
    );

    function queryConfig() external view returns (address factory, address govToken, address collateralContract);

    function updateCollateralAssetMapping(address[] memory assets, address[] memory collateralAssets) external;

    function queryCollateralAssetMapping() external view returns (address[] memory assets, address[] memory collateralAssets);


    function updateClaimIntervals(address[] memory assets, uint[] memory intervals) external;

    function queryClaimIntervals() external view returns (address[] memory assets, uint[] memory intervals);

    function queryRemaingClaimTimes(address staker) external view returns (address[] memory assets, uint[] memory remaingClaimTimes);

}


