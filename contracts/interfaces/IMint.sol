pragma solidity >=0.6.0;

interface IMint {
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

    function updateAsset(address assetToken, uint auctionDiscount, uint minCollateralRatio) external;

    function registerAsset(address assetToken, uint auctionDiscount, uint minCollateralRatio) external;

    function registerMigration(address assetToken, uint endPrice) external;

    function openPosition(address collateralToken, uint collateralAmount, address assetToken, uint collateralRatio) external returns (uint);

    function deposit(uint positionIndex, address collateralAssetToken, uint collateralAmount) external;

    function withdraw(uint positionIndex, address collateralToken, uint withdrawAmount) external;

    function mint(uint positionIndex, address assetTOken, uint assetAmount) external;

    function closePosition(uint positionIndex) external;

    function auction(uint positionIndex, uint liquidateAssetAmount) external;


}


