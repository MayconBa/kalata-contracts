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


contract Mint is ReentrancyGuardUpgradeable, IMint, SafeAccess {
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using EnumerableSet for EnumerableSet.UintSet;

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
        address collateralToken;
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

    uint private _protocolFeeRate;
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


    function openPosition(address collateralToken, uint collateralAmount, address assetToken, uint collateralRatio) override external nonReentrant  returns (uint){
        address sender = _msgSender();
        require(collateralToken != address(0), "Invalid collateralToken address");
        require(assetToken != address(0), "Invalid assetContract address");
        require(collateralAmount > 0, "Wrong collateral");

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


    function deposit(uint positionIndex, address collateralToken, uint collateralAmount) override external nonReentrant  {
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


    function withdraw(uint positionIndex, address collateralToken, uint withdrawAmount) override external  {
        require(collateralToken != address(0), "invalid address");
        Position memory position = _idxPositionMap[positionIndex];
        require(position.owner == _msgSender(), "withdraw unauthorized");
        assertCollateral(position.collateralToken, collateralToken, withdrawAmount);
        require(position.collateralAmount >= withdrawAmount, "Cannot withdraw more than you provide");

        address assetToken = position.assetToken;

        AssetConfig memory assetConfig = _assetConfigMap[assetToken];


        uint relativeCollateralPrice = queryPrice(position.collateralToken, position.assetToken);


        uint newCollateralAmount = position.collateralAmount.sub(withdrawAmount);


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


        require(IERC20(collateralToken).transfer(_msgSender(), withdrawAmount .sub(protocolFee)), "Mint:withdraw,transfer to sender failed");

        require(IERC20(collateralToken).transfer(_collector, protocolFee), "Mint:withdraw,IERC20 transfer to collector failed");

        emit Withdraw(msg.sender, positionIndex, collateralToken, withdrawAmount, protocolFee);
    }

    function mint(uint positionIndex, address assetToken, uint assetAmount) override external  {
        require(assetToken != address(0), "invalid address");

        Position memory position = _idxPositionMap[positionIndex];
        require(position.owner == _msgSender(), "mint unauthorized");
        assertAsset(position.assetToken, assetToken, assetAmount);

        AssetConfig memory assetConfig = _assetConfigMap[position.assetToken];
        assertMigratedAsset(assetConfig.endPrice);

        uint relativeCollateralPrice = queryPrice(position.collateralToken, position.assetToken);


        uint newAssetAmount = assetAmount.add(position.assetAmount);

        uint assetValueInCollateralAsset = newAssetAmount.multiplyDecimal(relativeCollateralPrice);

        require(assetValueInCollateralAsset.multiplyDecimal(assetConfig.minCollateralRatio) <= position.collateralAmount, "Cannot mint asset over than min collateral ratio");

        position.assetAmount = position.assetAmount.add(assetAmount);
        savePosition(position);

        IBEP20Token(assetConfig.token).mint(_msgSender(), assetAmount);
        emit Mint(msg.sender, positionIndex, assetToken, assetAmount);
    }

    function closePosition(uint positionIndex) override external  {
        address positionOwner = _msgSender();
        Position memory position = _idxPositionMap[positionIndex];
        require(position.assetAmount > 0 && position.assetToken != address(0) && position.collateralAmount > 0 && position.assetAmount > 0, "Nothing to close");
        require(position.owner == positionOwner, "closePosition: unauthorized");

        require(IERC20(position.assetToken).transferFrom(positionOwner, address(this), position.assetAmount), "transferFrom failed");
        IBEP20Token(position.assetToken).burn(address(this), position.assetAmount);

        uint withdrawAmount = position.collateralAmount;

        uint protocolFee = withdrawAmount.multiplyDecimal(_protocolFeeRate);

        require(IERC20(position.collateralToken).transfer(positionOwner, withdrawAmount.sub(protocolFee)), "Mint:withdraw,transfer to sender failed");
        require(IERC20(position.collateralToken).transfer(_collector, protocolFee), "Mint:withdraw,IERC20 transfer to collector failed");
        removePosition(position);
        emit Burn(msg.sender, positionIndex, position.assetToken, position.assetAmount);
        delete ownerPositionIndex[positionOwner][position.collateralToken][position.assetToken];
    }



    function isValidPostion(Position memory position, uint assetPrice) private view returns (bool){
        uint currentCollateralRatio = position.collateralAmount.divideDecimal(position.assetAmount.multiplyDecimal(assetPrice));
        return currentCollateralRatio >= _assetConfigMap[position.assetToken].minCollateralRatio;
    }

    function auction(uint positionIndex, uint liquidateAssetAmount) override external  {
        address sender = msg.sender;
        Position memory position = _idxPositionMap[positionIndex];
        AssetConfig memory assetConfig = _assetConfigMap[position.assetToken];
        (uint assetPrice,) = IOracle(_oracle).queryPrice(position.assetToken);
        require(!isValidPostion(position, assetPrice), "Mint: AUCTION_CANNOT_LIQUIDATE_SAFELY_POSITION");

        uint discountedPrice = assetPrice.divideDecimal(SafeDecimalMath.unit().sub(assetConfig.auctionDiscount));

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


        uint returnCollateralAmount = liquidateAssetAmount.multiplyDecimal(discountedPrice);

        position.collateralAmount = position.collateralAmount.sub(returnCollateralAmount);
        position.assetAmount = position.assetAmount.sub(liquidateAssetAmount);

        if (position.collateralAmount <= APPROXIMATE_ZERO) {

            removePosition(position);
        } else if (position.assetAmount <= APPROXIMATE_ZERO) {
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


    function assertMigratedAsset(uint endPrice) pure private {
        require(endPrice == 0, "Operation is not allowed for the deprecated asset");
    }

    function assertCollateral(address positionCollateralToken, address collateralToken, uint collateralAmount) pure private {
        require(positionCollateralToken == collateralToken && collateralAmount != 0, " Wrong collateral");
    }


    function assertAsset(address postionAssetToken, address assetToken, uint assetAmount) pure private {
        require(assetToken == postionAssetToken && assetAmount > 0, "Wrong asset");
    }


    mapping(address => mapping(address => mapping(address => uint))) ownerPositionIndex;



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
