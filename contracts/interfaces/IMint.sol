// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

///The Mint Contract implements the logic for Collateralized Debt Positions (CDPs),
///through which users can mint new mAsset tokens against their deposited collateral (UST or mAssets).
///Current prices of collateral and minted mAssets are read from the Oracle Contract determine the C-ratio of each CDP.
///The Mint Contract also contains the logic for liquidating CDPs with C-ratios below the minimum for their minted mAsset through auction.
interface IMint {

    event UpdateConfig(address indexed sender, address indexed factory, address indexed oracle, address collector, address baseToken, uint protocolFeeRate);
    event UpdateAsset(address indexed sender, address indexed assetToken, uint indexed auctionDiscount, uint minCollateralRatio);
    event RegisterAsset(address indexed sender, address indexed assetToken, uint auctionDiscount, uint minCollateralRatio);
    event RegisterMigration(address indexed sender, address indexed assetToken, uint endPrice);
    event Deposit(address indexed sender, uint positionIndex, address indexed collateralToken, uint collateralAmount);
    event Auction(address indexed sender, address indexed positionOwner, uint positionIndex, uint liquidateAssetAmount, uint returnCollateralAmount, uint protocolFee);
    event OpenPosition(
        address indexed sender,
        address indexed collateralToken,
        uint collateralAmount,
        address indexed assetToken,
        uint collateralRatio,
        uint positionIndex,
        uint mintAmount
    );
    event Withdraw(address indexed sender, uint positionIndex, address indexed collateralToken, uint collateralAmount, uint protocolFee);
    event Mint(address indexed sender, uint positionIndex, address indexed assetToken, uint assetAmount);
    event Burn(address indexed sender, uint positionIndex, address indexed assetToken, uint assetAmount);

    function updateConfig(address factory, address oracle, address collector, address baseToken, uint protocolFeeRate, uint priceExpireTime) external;

    function updateAsset(address assetToken, uint auctionDiscount, uint minCollateralRatio) external;

    function registerAsset(address assetToken, uint auctionDiscount, uint minCollateralRatio) external;

    function registerMigration(address assetToken, uint endPrice) external;

    function openPosition(address collateralToken, uint collateralAmount, address assetToken, uint collateralRatio) external returns (uint);

    function queryPositionIndex(address postionOwner, address collateralToken, address assetToken) external view returns (uint positionIndex);

    function deposit(uint positionIndex, address collateralAssetToken, uint collateralAmount) external;

    function withdraw(uint positionIndex, address collateralToken, uint withdrawAmount) external;

    function mint(uint positionIndex, address assetTOken, uint assetAmount) external;

    function closePosition(uint positionIndex) external;

    function auction(uint positionIndex, uint liquidateAssetAmount) external;

    function queryConfig() external view returns (
        address factory, address oracle, address collector, address baseToken, uint protocolFeeRate, uint priceExpireTime
    );

    function queryAssetConfig(address assetToken) external view returns (uint auctionDiscount, uint minCollateralRatio, uint endPrice);

    function queryAllAssetConfigs() external view returns (
        address [] memory assets,
        uint[] memory auctionDiscounts,
        uint[] memory minCollateralRatios,
        uint[] memory endPrices
    );

    function queryPosition(uint positionIndex) external view returns (
        address positionOwner,
        address collateralToken,
        uint collateralAmount,
        address assetToken,
        uint assetAmount
    );


    function queryAllPositions(address owner) external view returns (
        uint[] memory idxes,
        address[]  memory positionOwners,
        address[]  memory collateralTokens,
        uint[] memory collateralAmounts,
        address[]  memory assetTokens,
        uint[] memory assetAmounts
    );

    function queryPositions(address owner, address assetToken) external view returns (
        uint[] memory idxes,
        address[]  memory positionOwners,
        address[]  memory collateralTokens,
        uint[] memory collateralAmounts,
        address[]  memory assetTokens,
        uint[] memory assetAmounts
    );

    function queryInvalidPositioins(address asset) external view returns (
        uint[] memory positionIdxes,
        address[] memory positionOwners,
        address[] memory positionCollaterals,
        uint[] memory positionCollateralAmounts,
        address[] memory positionAssets,
        uint[] memory positionAssetAmounts
    );
}


