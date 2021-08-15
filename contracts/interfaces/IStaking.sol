
pragma solidity >=0.6.0;

interface IStaking {
    event RegisterAsset(address indexed sender, address indexed asset, address indexed stakingToken);
    event Stake(address indexed sender, address indexed asset, uint stakingTokenAmount);
    event DepositReward(address indexed sender, address indexed asset, uint amounts);
    event DepositRewards(address indexed sender, address[] assets, uint[] amounts);
    event Withdraw(address indexed sender, address indexed asset, uint amount);
    event UnStake(address indexed sender, address indexed asset, uint amount);
    event UpdateClaimIntervals(address indexed sender, address[] assets, uint[] intervals);
    event SetLockable(address indexed sender, address asset, bool lockable);
    event UpdateCollateralAssetMapping(address indexed sender, address[] assets, address[] collateralAssets);

    function registerAsset(address asset, address stakingToken) external;

    function stake(address asset, uint stakingAmount) external;

    function unStake(address asset, uint amount) external;

    function depositRewards(address[] memory assets, uint[] memory amounts) external;

    function depositReward(address asset, uint amount) external;

    function claim(address asset) external;

    function updateCollateralAssetMapping(address[] memory assets, address[] memory collateralAssets) external;

    function updateClaimIntervals(address[] memory assets, uint[] memory intervals) external;

}


