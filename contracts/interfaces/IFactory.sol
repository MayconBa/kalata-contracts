pragma solidity >=0.6.0;

interface IFactory {

    event RevokeAsset(address indexed sender, address indexed assetToken, uint endPrice);
    event Distribute(address indexed sender, address  indexed asset, uint amount);
    event UpdateWeight(address indexed sender, address  indexed assetToken, uint weight);
    event TokenCreated(address indexed sender, bytes32 name, bytes32 symbol, uint initialSupply, address  indexed token);
    event MigrateAsset(address indexed sender, uint endPrice, address  indexed assetToken);

    function updateDistributionSchedules(uint[] calldata startTimes, uint[] calldata endTimes, uint[] calldata amounts) external;

    function updateWeight(address assetToken, uint weight) external;

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


}


