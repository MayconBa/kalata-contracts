// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

//The Factory contract is Kalata Protocol's central directory and
///organizes information related to mAssets and the Kalata Token (KALA).
///It is also responsible for minting new KALA tokens each block and
///distributing them to the Staking Contract for rewarding LP Token stakers.

///After the initial bootstrapping of Kalata Protocol contracts,
///the Factory is assigned to be the owner for the Mint, Staking,
interface IFactory {

    event RevokeAsset(address indexed sender, address indexed assetToken, uint endPrice);
    event Distribute(address indexed sender, address  indexed asset, uint amount);
    event UpdateConfig(address indexed sender, uint[] scheduleStartTime, uint[] scheduleEndTime, uint[] scheduleAmounts);
    event UpdateWeight(address indexed sender, address  indexed assetToken, uint weight);
    event TokenCreated(address indexed sender, bytes32 name, bytes32 symbol, uint initialSupply, address  indexed token);
    event MigrateAsset(address indexed sender, uint endPrice, address  indexed assetToken);

    function updateConfig(address mint, address staking, address uniswapFactory, address baseToken, address govToken) external;

    function updateDistributionSchedules(uint[] calldata startTimes, uint[] calldata endTimes, uint[] calldata amounts) external;

    function updateWeight(address assetToken, uint weight) external;

    function whitelist(bytes32 name, bytes32 symbol, uint auctionDiscount, uint minCollateralRatio, uint weight) external;

    function registerAsset(
        address tokenAddress,
        address pairAddress,
        bytes32 name,
        bytes32 symbol,
        uint auctionDiscount,
        uint minCollateralRatio,
        uint weight
    ) external;

    function distribute() external;

    function revokeAsset(address assetToken, uint endPrice) external;

    function migrateAsset(bytes32 name, bytes32 symbol, address assetToken, uint endPrice) external;

    function queryConfig() external view returns (
        address mint,
        address staking,
        address uniswapFactory,
        address baseToken,
        address govToken
    );

    //Add this method beside queryConfig, because too many variables are not allowed in solidity
    function queryDistributionSchedules() external view returns (
        uint[] memory startTimes, //seconds
        uint[] memory endTimes, //seconds
        uint[] memory amounts//distribution amount for the interval
    );

    function queryDistributeAmount() external view returns (uint);

    function queryWeight(address token) external view returns (uint);

    function queryAllAssetWeights() external view returns (address[] memory assets, uint[] memory weights);

    function queryTotalWeight() external view returns (uint);

    function queryToken(bytes32 symbol) external view returns (address token);

    function queryAssets() external view returns (bytes32[] memory names, bytes32[] memory symbols, address[] memory addresses, address[] memory busdPairAddresses);
}


