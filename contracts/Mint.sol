// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "./interfaces/IMint.sol";
import "./interfaces/IOracle.sol";
import "./interfaces/IBEP20Token.sol";
import "./interfaces/IERC20.sol";
import "./libraries/SafeDecimalMath.sol";
import "./SafeAccess.sol";


/**
    The Mint Contract implements the logic for Collateralized Debt Positions (CDPs),
    through which users can mint new mAsset tokens against their deposited collateral (UST or mAssets).
    Current prices of collateral and minted mAssets are read from the Oracle Contract determine the C-ratio of each CDP.
    The Mint Contract also contains the logic for liquidating CDPs with C-ratios below the minimum for their minted mAsset through auction.
*/
contract Mint is OwnableUpgradeable, ReentrancyGuardUpgradeable, IMint, SafeAccess {
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using EnumerableSet for EnumerableSet.UintSet;

    // 0.00000000000001
    uint constant APPROXIMATE_ZERO = 10000;

    struct AssetConfig {
        address token;
        uint auctionDiscount;
        uint minCollateralRatio;
        uint endPrice;
    }

    struct Position {
        uint idx;
        address owner;
        address collateralToken; //busd
        uint collateralAmount;
        address assetToken;
        uint assetAmount;
    }

    struct Asset {
        address token;
        uint amount;
    }

    struct AssetTransfer {
        address token;
        address sender;
        address recipient;
        uint amount;
    }

    address private _factory;
    address private _oracle;
    address private _collector;
    address private _baseToken;

    uint private _protocolFeeRate;//0.015
    uint private _priceExpireTime;

    mapping(address => AssetConfig) private _assetConfigMap;
    address [] private _assets;


    mapping(uint => Position) private _idxPositionMap;
    mapping(address => EnumerableSet.UintSet) private _userPostionIndexes;
    EnumerableSet.UintSet private _postionIndexes;

    uint private _currentPositionIndex;

    modifier onlyFactoryOrOwner() {
        require(_factory == _msgSender() || owner() == _msgSender(), "Unauthorized, only factory/owner can perform");
        _;
    }

    function initialize(address factory, address oracle, address collector, address baseToken, uint protocolFeeRate, uint priceExpireTime) external initializer {
        __Ownable_init();
        _currentPositionIndex = 1;
        require(protocolFeeRate <= SafeDecimalMath.unit(), "protocolFeeRate must be less than 100%.");
        _updateConfig(factory, oracle, collector, baseToken, protocolFeeRate, priceExpireTime);
    }


    function updateConfig(address factory, address oracle, address collector, address baseToken, uint protocolFeeRate, uint priceExpireTime) override external onlyOwner {
        _updateConfig(factory, oracle, collector, baseToken, protocolFeeRate, priceExpireTime);
        emit UpdateConfig(msg.sender, factory, oracle, collector, baseToken, protocolFeeRate);
    }


    function _updateConfig(address factory, address oracle, address collector, address baseToken, uint protocolFeeRate, uint priceExpireTime) private {
        require(
            factory != address(0)
            && oracle != address(0)
            && collector != address(0)
            && baseToken != address(0)
            && protocolFeeRate > 0
            && priceExpireTime > 0,
            "Router: _UPDATE_CONFIG_INVALD_PARAMETERS"
        );
        _factory = factory;
        _oracle = oracle;
        _collector = collector;
        _baseToken = baseToken;
        _protocolFeeRate = protocolFeeRate;
        _priceExpireTime = priceExpireTime;
    }

    function updateAsset(address assetToken, uint auctionDiscount, uint minCollateralRatio) override external onlyFactoryOrOwner {
        _saveAsset(assetToken, auctionDiscount, minCollateralRatio);
        emit UpdateAsset(msg.sender, assetToken, auctionDiscount, minCollateralRatio);

    }

    function registerAsset(address assetToken, uint auctionDiscount, uint minCollateralRatio) override external onlyFactoryOrOwner {
        require(_assetConfigMap[assetToken].token == address(0), "Asset was already registered");
        _saveAsset(assetToken, auctionDiscount, minCollateralRatio);
        emit RegisterAsset(msg.sender, assetToken, auctionDiscount, minCollateralRatio);
    }

    function _saveAsset(address assetToken, uint auctionDiscount, uint minCollateralRatio) private {
        require(assetToken != address(0), "Invalid assetToken address");
        assertAuctionDiscount(auctionDiscount);
        assertMinCollateralRatio(minCollateralRatio);
        AssetConfig memory assetConfig = _assetConfigMap[assetToken];
        assetConfig.auctionDiscount = auctionDiscount;
        assetConfig.minCollateralRatio = minCollateralRatio;
        assetConfig.token = assetToken;
        saveAssetConfig(assetToken, assetConfig);
    }


    function registerMigration(address assetToken, uint endPrice) override external onlyFactoryOrOwner {
        require(assetToken != address(0), "Invalid assetToken address");
        AssetConfig memory assetConfig = _assetConfigMap[assetToken];
        assetConfig.endPrice = endPrice;
        assetConfig.minCollateralRatio = SafeDecimalMath.unit();
        saveAssetConfig(assetToken, assetConfig);
        emit RegisterMigration(msg.sender, assetToken, endPrice);
    }


    function openPosition(address collateralToken, uint collateralAmount, address assetToken, uint collateralRatio) override external nonReentrant nonContractAccess returns (uint){
        address sender = _msgSender();
        require(collateralToken != address(0), "Invalid collateralToken address");
        require(assetToken != address(0), "Invalid assetContract address");
        require(collateralAmount > 0, "Wrong collateral");

        //User should invoke IERC20.approve
        require(IERC20(collateralToken).transferFrom(sender, address(this), collateralAmount), "Unable to execute transferFrom, recipient may have reverted");

        AssetConfig memory assetConfig = _assetConfigMap[assetToken];

        require(assetConfig.token == assetToken, "Asset not registed");
        require(assetConfig.endPrice == 0, "Operation is not allowed for the deprecated asset");
        require(assetConfig.minCollateralRatio > 0, "Invalid _minCollateralRatio");
        require(collateralRatio >= assetConfig.minCollateralRatio, "Can not open a position with low collateral ratio than minimum");

        uint relativeCollateralPrice = queryPrice(collateralToken, assetToken);

        uint mintAmount = collateralAmount.multiplyDecimal(relativeCollateralPrice).divideDecimal(collateralRatio);

        require(mintAmount > 0, "collateral is too small");

        Position memory position = Position({
        idx : _currentPositionIndex,
        owner : sender,
        collateralToken : collateralToken,
        collateralAmount : collateralAmount,
        assetToken : assetToken,
        assetAmount : mintAmount
        });

        savePosition(position);

        _currentPositionIndex += 1;
        IBEP20Token(assetToken).mint(sender, mintAmount);

        ownerPositionIndex[sender][collateralToken][assetToken] = position.idx;
        emit OpenPosition(sender, collateralToken, collateralAmount, assetToken, collateralRatio, position.idx, mintAmount);
        return position.idx;
    }


    //Deposits additional collateral to an existing CDP to raise its C-ratio.
    //After method IERC20.approve()
    function deposit(uint positionIndex, address collateralToken, uint collateralAmount) override external nonReentrant nonContractAccess {
        address sender = _msgSender();
        require(collateralToken != address(0), "Invalid collateralToken address");
        require(positionIndex > 0, "Invalid positionIndex");

        Position memory position = _idxPositionMap[positionIndex];
        require(position.owner == sender, "deposit unauthorized");

        assertCollateral(position.collateralToken, collateralToken, collateralAmount);

        address assetToken = position.assetToken;
        AssetConfig memory assetConfig = _assetConfigMap[assetToken];
        assertMigratedAsset(assetConfig.endPrice);

        require(IERC20(collateralToken).transferFrom(sender, address(this), collateralAmount), "Unable to execute transferFrom, recipient may have reverted");
        position.collateralAmount = position.collateralAmount.add(collateralAmount);

        savePosition(position);

        emit Deposit(msg.sender, positionIndex, collateralToken, collateralAmount);
    }


    //Withdraws collateral from the CDP. Cannot withdraw more than an amount that would drop the CDP's C-ratio below the minted mAsset's mandated minimum.
    function withdraw(uint positionIndex, address collateralToken, uint withdrawAmount) override external nonContractAccess {
        require(collateralToken != address(0), "invalid address");
        Position memory position = _idxPositionMap[positionIndex];
        require(position.owner == _msgSender(), "withdraw unauthorized");
        assertCollateral(position.collateralToken, collateralToken, withdrawAmount);
        require(position.collateralAmount >= withdrawAmount, "Cannot withdraw more than you provide");

        address assetToken = position.assetToken;

        AssetConfig memory assetConfig = _assetConfigMap[assetToken];


        uint relativeCollateralPrice = queryPrice(position.collateralToken, position.assetToken);

        // Compute new collateral amount
        uint newCollateralAmount = position.collateralAmount.sub(withdrawAmount);

        // Convert asset to collateral unit
        uint assetValueInCollateralAsset = position.assetAmount.multiplyDecimal(relativeCollateralPrice);

        require(assetValueInCollateralAsset.multiplyDecimal(
            assetConfig.minCollateralRatio) <= newCollateralAmount,
            "Cannot withdraw collateral over than minimum collateral ratio"
        );

        position.collateralAmount = newCollateralAmount;
        if (position.collateralAmount == 0 && position.assetAmount == 0) {
            removePosition(position);
        } else {
            savePosition(position);
        }
        require(_protocolFeeRate > 0, "_protocolFeeRate is zero");
        uint protocolFee = withdrawAmount.multiplyDecimal(_protocolFeeRate);

        //to sender
        require(IERC20(collateralToken).transfer(_msgSender(), withdrawAmount .sub(protocolFee)), "Mint:withdraw,transfer to sender failed");

        //to collector
        require(IERC20(collateralToken).transfer(_collector, protocolFee), "Mint:withdraw,IERC20 transfer to collector failed");

        emit Withdraw(msg.sender, positionIndex, collateralToken, withdrawAmount, protocolFee);
    }

    //In case the collateralRatio is too large, user can mint more mAssets to reduce the collateralRatio;
    function mint(uint positionIndex, address assetToken, uint assetAmount) override external nonContractAccess {
        require(assetToken != address(0), "invalid address");

        Position memory position = _idxPositionMap[positionIndex];
        require(position.owner == _msgSender(), "mint unauthorized");
        assertAsset(position.assetToken, assetToken, assetAmount);

        AssetConfig memory assetConfig = _assetConfigMap[position.assetToken];
        assertMigratedAsset(assetConfig.endPrice);

        uint relativeCollateralPrice = queryPrice(position.collateralToken, position.assetToken);

        // Compute new asset amount
        uint newAssetAmount = assetAmount.add(position.assetAmount);

        // Convert asset to collateral unit
        uint assetValueInCollateralAsset = newAssetAmount.multiplyDecimal(relativeCollateralPrice);

        require(assetValueInCollateralAsset.multiplyDecimal(assetConfig.minCollateralRatio) <= position.collateralAmount, "Cannot mint asset over than min collateral ratio");

        position.assetAmount = position.assetAmount.add(assetAmount);
        savePosition(position);

        IBEP20Token(assetConfig.token).mint(_msgSender(), assetAmount);
        emit Mint(msg.sender, positionIndex, assetToken, assetAmount);
    }

    function closePosition(uint positionIndex) override external nonContractAccess {
        address positionOwner = _msgSender();
        Position memory position = _idxPositionMap[positionIndex];
        require(position.assetAmount > 0 && position.assetToken != address(0) && position.collateralAmount > 0 && position.assetAmount > 0, "Nothing to close");
        require(position.owner == positionOwner, "closePosition: unauthorized");

        require(IERC20(position.assetToken).transferFrom(positionOwner, address(this), position.assetAmount), "transferFrom failed");
        IBEP20Token(position.assetToken).burn(address(this), position.assetAmount);

        uint withdrawAmount = position.collateralAmount;

        uint protocolFee = withdrawAmount.multiplyDecimal(_protocolFeeRate);

        //to sender
        require(IERC20(position.collateralToken).transfer(positionOwner, withdrawAmount.sub(protocolFee)), "Mint:withdraw,transfer to sender failed");

        //to collector
        require(IERC20(position.collateralToken).transfer(_collector, protocolFee), "Mint:withdraw,IERC20 transfer to collector failed");

        //require(IERC20(position.collateralToken).transfer(positionOwner, position.collateralAmount), "Mint:closePosition,transfer to postion owner failed");

        removePosition(position);
        emit Burn(msg.sender, positionIndex, position.assetToken, position.assetAmount);
        delete ownerPositionIndex[positionOwner][position.collateralToken][position.assetToken];
    }

    function queryInvalidPositioins(address asset) override external view returns (
        uint[] memory positionIdxes,
        address[] memory positionOwners,
        address[] memory positionCollaterals,
        uint[] memory positionCollateralAmounts,
        address[] memory positionAssets,
        uint[] memory positionAssetAmounts
    ){
        positionIdxes = new uint[](0);
        positionOwners = new address[](0);
        positionCollaterals = new address[](0);
        positionCollateralAmounts = new uint[](0);
        positionAssets = new address[](0);
        positionAssetAmounts = new uint[](0);
        (uint assetPrice,) = IOracle(_oracle).queryPrice(asset);
        if (assetPrice > 0) {
            uint index = 0;
            for (uint i = 0; i < _postionIndexes.length(); i++) {
                Position memory position = _idxPositionMap[_postionIndexes.at(i)];
                if (position.assetToken == asset && !isValidPostion(position, assetPrice)) {
                    positionIdxes[index] = position.idx;
                    positionOwners[index] = position.owner;
                    positionCollaterals[index] = position.collateralToken;
                    positionCollateralAmounts[index] = position.collateralAmount;
                    positionAssets[index] = position.assetToken;
                    positionAssetAmounts[index] = position.assetAmount;
                    index = index + 1;
                }
            }
        }
    }

    function isValidPostion(Position memory position, uint assetPrice) private view returns (bool){
        uint currentCollateralRatio = position.collateralAmount.divideDecimal(position.assetAmount.multiplyDecimal(assetPrice));
        return currentCollateralRatio >= _assetConfigMap[position.assetToken].minCollateralRatio;
    }

    function auction(uint positionIndex, uint liquidateAssetAmount) override external nonContractAccess {
        address sender = msg.sender;
        Position memory position = _idxPositionMap[positionIndex];
        AssetConfig memory assetConfig = _assetConfigMap[position.assetToken];
        (uint assetPrice,) = IOracle(_oracle).queryPrice(position.assetToken);
        require(!isValidPostion(position, assetPrice), "Mint: AUCTION_CANNOT_LIQUIDATE_SAFELY_POSITION");

        // discountedPrice = assetPrice / (1 - discount)
        uint discountedPrice = assetPrice.divideDecimal(SafeDecimalMath.unit().sub(assetConfig.auctionDiscount));

        //  maxLiquidateAssetAmount = position.collateralAmount / discountedPrice
        uint maxLiquidateAssetAmount = position.collateralAmount.divideDecimal(discountedPrice);

        if (liquidateAssetAmount > maxLiquidateAssetAmount) {
            liquidateAssetAmount = maxLiquidateAssetAmount;
        }
        if (liquidateAssetAmount > position.assetAmount) {
            liquidateAssetAmount = position.assetAmount;
        }

        require(IBEP20Token(position.assetToken).allowance(sender, address(this)) >= liquidateAssetAmount, "Mint: AUCTION_ALLWANCE_NOT_ENOUGH");
        IBEP20Token(position.assetToken).transferFrom(sender, address(this), liquidateAssetAmount);
        IBEP20Token(position.assetToken).burn(address(this), liquidateAssetAmount);

        //returnCollateralAmount = liquidateAssetAmount * discountedPrice
        uint returnCollateralAmount = liquidateAssetAmount.multiplyDecimal(discountedPrice);

        position.collateralAmount = position.collateralAmount.sub(returnCollateralAmount);
        position.assetAmount = position.assetAmount.sub(liquidateAssetAmount);

        if (position.collateralAmount <= APPROXIMATE_ZERO) {
            // all collaterals are sold out
            removePosition(position);
        } else if (position.assetAmount <= APPROXIMATE_ZERO) {
            //transfer left collateralToken to owner
            IERC20(position.collateralToken).transfer(position.owner, position.collateralAmount);
            removePosition(position);
        } else {
            _idxPositionMap[positionIndex] = position;
        }

        uint protocolFee = returnCollateralAmount.multiplyDecimal(_protocolFeeRate);
        returnCollateralAmount = returnCollateralAmount.sub(protocolFee);

        require(IBEP20Token(position.collateralToken).transfer(_collector, protocolFee), "Mint: AUCTION_TRANSFER_FAIL");
        require(IBEP20Token(position.collateralToken).transfer(sender, returnCollateralAmount), "Mint: AUCTION_TRANSFER_FAIL");
        emit Auction(sender, position.owner, positionIndex, liquidateAssetAmount, returnCollateralAmount, protocolFee);

    }


    function queryConfig() override external view returns (address factory, address oracle, address collector, address baseToken, uint protocolFeeRate, uint priceExpireTime){
        factory = _factory;
        oracle = _oracle;
        collector = _collector;
        baseToken = _baseToken;
        protocolFeeRate = _protocolFeeRate;
        priceExpireTime = _priceExpireTime;
    }


    function queryAssetConfig(address assetToken) override external view returns (uint auctionDiscount, uint minCollateralRatio, uint endPrice){
        AssetConfig memory m = _assetConfigMap[assetToken];
        auctionDiscount = m.auctionDiscount;
        minCollateralRatio = m.minCollateralRatio;
        endPrice = m.endPrice;
    }


    function queryAllAssetConfigs() override external view returns (
        address [] memory assets,
        uint[] memory auctionDiscounts,
        uint[] memory minCollateralRatios,
        uint[] memory endPrices
    ){
        assets = _assets;
        auctionDiscounts = new uint[](assets.length);
        minCollateralRatios = new uint[](assets.length);
        endPrices = new uint[](assets.length);

        for (uint i; i < assets.length; i++) {
            AssetConfig memory m = _assetConfigMap[assets[i]];
            auctionDiscounts[i] = m.auctionDiscount;
            minCollateralRatios[i] = m.minCollateralRatio;
            endPrices[i] = m.endPrice;
        }
    }

    function queryPosition(uint positionIndex) override external view returns (
        address positionOwner,
        address collateralToken,
        uint collateralAmount,
        address assetToken,
        uint assetAmount
    ){
        Position memory m = _idxPositionMap[positionIndex];
        positionOwner = m.owner;
        collateralToken = m.collateralToken;
        collateralAmount = m.collateralAmount;
        assetToken = m.assetToken;
        assetAmount = m.assetAmount;
    }

    function queryAllPositions(address owner) override external view returns (
        uint[] memory idxes,
        address[]  memory positionOwners,
        address[]  memory collateralTokens,
        uint[] memory collateralAmounts,
        address[]  memory assetTokens,
        uint[] memory assetAmounts
    ){
        require(owner != address(0), "Invalid address");
        idxes = new uint[](_userPostionIndexes[owner].length());
        positionOwners = new address[](idxes.length);
        collateralTokens = new address[](idxes.length);
        collateralAmounts = new uint[](idxes.length);
        assetTokens = new address[](idxes.length);
        assetAmounts = new uint[](idxes.length);
        uint index = 0;
        for (uint i = 0; i < idxes.length; i++) {
            Position memory position = _idxPositionMap[_userPostionIndexes[owner].at(i)];
            idxes[index] = position.idx;
            positionOwners[index] = (position.owner);
            collateralTokens[index] = (position.collateralToken);
            collateralAmounts[index] = (position.collateralAmount);
            assetTokens[index] = (position.assetToken);
            assetAmounts[index] = (position.assetAmount);
            index++;
        }
    }

    function queryPositions(address owner, address assetToken) override external view returns (
        uint[] memory idxes,
        address[]  memory positionOwners,
        address[]  memory collateralTokens,
        uint[] memory collateralAmounts,
        address[]  memory assetTokens,
        uint[] memory assetAmounts
    ) {
        uint length = _postionIndexes.length();
        idxes = new uint[](length);
        positionOwners = new address[](length);
        collateralTokens = new address[](length);
        collateralAmounts = new uint[](length);
        assetTokens = new address[](length);
        assetAmounts = new uint[](length);
        uint index = 0;
        for (uint i = 0; i < length; i++) {
            Position memory position = _idxPositionMap[_postionIndexes.at(i)];
            if ((position.owner == owner || owner == address(0)) && (position.assetToken == assetToken || assetToken == address(0))) {
                idxes[index] = position.idx;
                positionOwners[index] = (position.owner);
                collateralTokens[index] = (position.collateralToken);
                collateralAmounts[index] = (position.collateralAmount);
                assetTokens[index] = (position.assetToken);
                assetAmounts[index] = (position.assetAmount);
                index++;
            }
        }

    }


    function assertMigratedAsset(uint endPrice) pure private {
        require(endPrice == 0, "Operation is not allowed for the deprecated asset");
    }

    function assertCollateral(address positionCollateralToken, address collateralToken, uint collateralAmount) pure private {
        require(positionCollateralToken == collateralToken && collateralAmount != 0, " Wrong collateral");
    }

    // Check zero balance & same asset with position
    function assertAsset(address postionAssetToken, address assetToken, uint assetAmount) pure private {
        require(assetToken == postionAssetToken && assetAmount > 0, "Wrong asset");
    }
    //positionOwner=>collateralToken=>assetToken=>positionIndex
    mapping(address => mapping(address => mapping(address => uint))) ownerPositionIndex;

    //Since openPosition function cannot  return value(because it's a transaction,only returns transaction receipt), use this method to get the positionIndex
    function queryPositionIndex(address postionOwner, address collateralToken, address assetToken) override external view returns (uint positionIndex){
        positionIndex = ownerPositionIndex[postionOwner][collateralToken][assetToken];
    }

    function queryPrice(address targetAssetToken, address denominateAssetToken) private view returns (uint){
        (uint tokenPrice, uint lastUpdatedTime) = readPrice(targetAssetToken);
        (uint denominateTokenPrice, uint denominateLastUpdatedTime) = readPrice(denominateAssetToken);
        require(tokenPrice > 0, "Oracle price is zero");
        require(denominateTokenPrice > 0, "Oracle price is zero");
        uint relativePrice = tokenPrice.divideDecimal(denominateTokenPrice);
        uint requiredTime = block.timestamp.sub(_priceExpireTime);
        require(lastUpdatedTime >= requiredTime && denominateLastUpdatedTime >= requiredTime, "Price is too old");
        return relativePrice;

    }

    function readPrice(address token) private view returns (uint price, uint lastUpdatedTime){
        if (_baseToken == token) {
            (price,lastUpdatedTime) = (SafeDecimalMath.unit(), 2 ** 256 - 1);
        } else {
            (price, lastUpdatedTime) = IOracle(_oracle).queryPrice(token);
        }
    }


    function calculateProtocolFee(uint returnCollateralAmount) private view returns (uint protocolFee){
        protocolFee = returnCollateralAmount.multiplyDecimal(_protocolFeeRate);
    }

    function transferAsset(address assetToken, address sender, address recipient, uint amount) private {
        require(IERC20(assetToken).transferFrom(sender, recipient, amount), "Unable to execute transferFrom, recipient may have reverted");
    }


    function assertAuctionDiscount(uint auctionDiscount) pure private {
        require(auctionDiscount <= SafeDecimalMath.unit(), "auctionDiscount must be less than 100%.");
    }

    function assertMinCollateralRatio(uint minCollateralRatio) private pure {
        require(minCollateralRatio >= SafeDecimalMath.unit(), "minCollateralRatio must be bigger than 100%");
    }

    function saveAssetConfig(address assetToken, AssetConfig memory assetConfig) private {
        bool exists = false;
        for (uint i = 0; i < _assets.length; i++) {
            if (_assets[i] == assetToken) {
                exists = true;
                break;
            }
        }
        if (!exists) {
            _assets.push(assetToken);
        }
        _assetConfigMap[assetToken] = assetConfig;
    }

    function savePosition(Position memory position) private {
        _postionIndexes.add(position.idx);
        _idxPositionMap[position.idx] = position;
        _userPostionIndexes[position.owner].add(position.idx);
    }

    function removePosition(Position memory position) private {
        delete _idxPositionMap[position.idx];
        _postionIndexes.remove(position.idx);
        _userPostionIndexes[position.owner].remove(position.idx);
    }

}
