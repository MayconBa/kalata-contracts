// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "./interfaces/IMint.sol";
import "./interfaces/IOracle.sol";
import "./interfaces/IBEP20Token.sol";
import "./interfaces/IERC20.sol";
import "./libraries/SafeDecimalMath.sol";

/**
    The Mint Contract implements the logic for Collateralized Debt Positions (CDPs),
    through which users can mint new mAsset tokens against their deposited collateral (UST or mAssets).
    Current prices of collateral and minted mAssets are read from the Oracle Contract determine the C-ratio of each CDP.
    The Mint Contract also contains the logic for liquidating CDPs with C-ratios below the minimum for their minted mAsset through auction.
*/
contract Mint is OwnableUpgradeable, ReentrancyGuardUpgradeable, IMint {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    uint private constant PRICE_EXPIRE_TIME = 300;

    Config private config;

    mapping(address => AssetConfig) private assetConfigMap;

    //for looping assetConfigMap;
    address [] private assetTokenArray;

    mapping(uint => Position) private idxPositionMap;

    //for looping idxPositionMap
    uint[] private postionIdxArray;

    uint private currentpositionIndex;


    modifier onlyFactoryOrOwner() {
        require(config.factory == _msgSender() || owner() == _msgSender(), "Unauthorized, only factory/owner can perform");
        _;
    }


    function initialize(address factory, address oracle, address collector, address baseToken, uint protocolFeeRate) external initializer {
        __Ownable_init();
        currentpositionIndex = 1;
        require(protocolFeeRate <= SafeDecimalMath.unit(), "protocolFeeRate must be less than 100%.");
        _updateConfig(factory, oracle, collector, baseToken, protocolFeeRate);
    }


    function setFactory(address factory) override external onlyOwner {
        require(factory != address(0), "Invalid parameter");
        config.factory = factory;
    }

    function updateConfig(address factory, address oracle, address collector, address baseToken, uint protocolFeeRate) override external onlyOwner {
        _updateConfig(factory, oracle, collector, baseToken, protocolFeeRate);
        emit UpdateConfig(msg.sender, factory, oracle, collector, baseToken, protocolFeeRate);
    }


    function _updateConfig(address factory, address oracle, address collector, address baseToken, uint protocolFeeRate) private {
        config = Config({
        factory : factory,
        oracle : oracle,
        collector : collector,
        baseToken : baseToken,
        protocolFeeRate : protocolFeeRate
        });

    }

    function updateAsset(address assetToken, uint auctionDiscount, uint minCollateralRatio) override external onlyFactoryOrOwner {
        _saveAsset(assetToken, auctionDiscount, minCollateralRatio);
        emit UpdateAsset(msg.sender, assetToken, auctionDiscount, minCollateralRatio);

    }

    function registerAsset(address assetToken, uint auctionDiscount, uint minCollateralRatio) override external onlyFactoryOrOwner {
        require(assetConfigMap[assetToken].token == address(0), "Asset was already registered");
        _saveAsset(assetToken, auctionDiscount, minCollateralRatio);
        emit RegisterAsset(msg.sender, assetToken, auctionDiscount, minCollateralRatio);
    }

    function _saveAsset(address assetToken, uint auctionDiscount, uint minCollateralRatio) private {
        require(assetToken != address(0), "Invalid assetToken address");
        assertAuctionDiscount(auctionDiscount);
        assertMinCollateralRatio(minCollateralRatio);
        AssetConfig memory assetConfig = assetConfigMap[assetToken];
        assetConfig.auctionDiscount = auctionDiscount;
        assetConfig.minCollateralRatio = minCollateralRatio;
        assetConfig.token = assetToken;
        saveAssetConfig(assetToken, assetConfig);
    }


    function registerMigration(address assetToken, uint endPrice) override external onlyFactoryOrOwner {
        require(assetToken != address(0), "Invalid assetToken address");
        AssetConfig memory assetConfig = assetConfigMap[assetToken];
        assetConfig.endPrice = endPrice;
        assetConfig.minCollateralRatio = SafeDecimalMath.unit();
        saveAssetConfig(assetToken, assetConfig);
        emit RegisterMigration(msg.sender, assetToken, endPrice);
    }

    /**
      *  OpenPosition
      *  Used for creating a new CDP with USD collateral.
      *  Opens a new CDP with an initial deposit of collateral.
      *  The user specifies the target minted mAsset for the CDP, and sets the desired initial collateralization ratio,
      *  which must be greater or equal than the minimum for the mAsset.
      *  sender is the end user
      *
    */
    function openPosition(address collateralToken, uint collateralAmount, address assetToken, uint collateralRatio) override external nonReentrant returns (uint){
        address sender = _msgSender();
        require(collateralToken != address(0), "Invalid collateralToken address");
        require(assetToken != address(0), "Invalid assetContract address");
        require(collateralAmount > 0, "Wrong collateral");

        //User should invoke IERC20.approve
        require(IERC20(collateralToken).transferFrom(sender, address(this), collateralAmount), "Unable to execute transferFrom, recipient may have reverted");

        AssetConfig memory assetConfig = assetConfigMap[assetToken];

        require(assetConfig.token == assetToken, "Asset not registed");
        require(assetConfig.endPrice == 0, "Operation is not allowed for the deprecated asset");
        require(assetConfig.minCollateralRatio > 0, "Invalid config.minCollateralRatio");
        require(collateralRatio >= assetConfig.minCollateralRatio, "Can not open a position with low collateral ratio than minimum");

        uint relativeCollateralPrice = queryPrice(collateralToken, assetToken);

        uint mintAmount = collateralAmount.multiplyDecimal(relativeCollateralPrice).divideDecimal(collateralRatio);

        require(mintAmount > 0, "collateral is too small");

        Position memory position = Position({
        idx : currentpositionIndex,
        owner : sender,
        collateralToken : collateralToken,
        collateralAmount : collateralAmount,
        assetToken : assetToken,
        assetAmount : mintAmount
        });

        savePosition(position.idx, position);

        currentpositionIndex += 1;
        IBEP20Token(assetToken).mint(sender, mintAmount);

        ownerPositionIndex[sender][collateralToken][assetToken] = position.idx;
        emit OpenPosition(sender, collateralToken, collateralAmount, assetToken, collateralRatio, position.idx, mintAmount);
        return position.idx;
    }


    //Deposits additional collateral to an existing CDP to raise its C-ratio.
    //After method IERC20.approve()
    function deposit(uint positionIndex, address collateralToken, uint collateralAmount) override external nonReentrant {
        address sender = _msgSender();
        require(collateralToken != address(0), "Invalid collateralToken address");
        require(positionIndex > 0, "Invalid positionIndex");

        Position memory position = idxPositionMap[positionIndex];
        require(position.owner == sender, "deposit unauthorized");

        assertCollateral(position.collateralToken, collateralToken, collateralAmount);

        address assetToken = position.assetToken;
        AssetConfig memory assetConfig = assetConfigMap[assetToken];
        assertMigratedAsset(assetConfig.endPrice);

        //IERC20(collateralToken).allowance(sender, address(this));

        require(IERC20(collateralToken).transferFrom(sender, address(this), collateralAmount), "Unable to execute transferFrom, recipient may have reverted");


        position.collateralAmount = position.collateralAmount.add(collateralAmount);

        savePosition(positionIndex, position);

        emit Deposit(msg.sender, positionIndex, collateralToken, collateralAmount);
    }


    //Withdraws collateral from the CDP. Cannot withdraw more than an amount that would drop the CDP's C-ratio below the minted mAsset's mandated minimum.
    function withdraw(uint positionIndex, address collateralToken, uint withdrawAmount) override external {
        require(collateralToken != address(0), "invalid address");
        Position memory position = idxPositionMap[positionIndex];
        require(position.owner == _msgSender(), "withdraw unauthorized");
        assertCollateral(position.collateralToken, collateralToken, withdrawAmount);
        require(position.collateralAmount >= withdrawAmount, "Cannot withdraw more than you provide");

        address assetToken = position.assetToken;

        AssetConfig memory assetConfig = assetConfigMap[assetToken];


        uint relativeCollateralPrice = queryPrice(position.collateralToken, position.assetToken);

        // Compute new collateral amount
        uint newCollateralAmount = position.collateralAmount.sub(withdrawAmount);

        // Convert asset to collateral unit
        uint assetValueInCollateralAsset = position.assetAmount.multiplyDecimal(relativeCollateralPrice);

        require(assetValueInCollateralAsset.multiplyDecimal(assetConfig.minCollateralRatio) <= newCollateralAmount, "Cannot withdraw collateral over than minimum collateral ratio");

        position.collateralAmount = newCollateralAmount;
        if (position.collateralAmount == 0 && position.assetAmount == 0) {
            removePosition(positionIndex);
        } else {
            savePosition(positionIndex, position);
        }
        require(config.protocolFeeRate > 0, "config.protocolFeeRate is zero");
        uint protocolFee = withdrawAmount.multiplyDecimal(config.protocolFeeRate);

        //to sender
        require(IERC20(collateralToken).transfer(_msgSender(), withdrawAmount .sub(protocolFee)), "Mint:withdraw,transfer to sender failed");

        //to collector
        require(IERC20(collateralToken).transfer(config.collector, protocolFee), "Mint:withdraw,IERC20 transfer to collector failed");

        emit Withdraw(msg.sender, positionIndex, collateralToken, withdrawAmount, protocolFee);
    }

    //In case the collateralRatio is too large, user can mint more mAssets to reduce the collateralRatio;
    function mint(uint positionIndex, address assetToken, uint assetAmount) override external {
        require(assetToken != address(0), "invalid address");

        Position memory position = idxPositionMap[positionIndex];
        require(position.owner == _msgSender(), "mint unauthorized");
        assertAsset(position.assetToken, assetToken, assetAmount);

        AssetConfig memory assetConfig = assetConfigMap[position.assetToken];
        assertMigratedAsset(assetConfig.endPrice);

        uint relativeCollateralPrice = queryPrice(position.collateralToken, position.assetToken);

        // Compute new asset amount
        uint newAssetAmount = assetAmount.add(position.assetAmount);

        // Convert asset to collateral unit
        uint assetValueInCollateralAsset = newAssetAmount.multiplyDecimal(relativeCollateralPrice);

        require(assetValueInCollateralAsset.multiplyDecimal(assetConfig.minCollateralRatio) <= position.collateralAmount, "Cannot mint asset over than min collateral ratio");

        position.assetAmount = position.assetAmount.add(assetAmount);
        savePosition(positionIndex, position);

        IBEP20Token(assetConfig.token).mint(_msgSender(), assetAmount);
        emit Mint(msg.sender, positionIndex, assetToken, assetAmount);
    }

    function closePosition(uint positionIndex) override external {
        address positionOwner = _msgSender();
        Position memory position = idxPositionMap[positionIndex];
        require(position.assetAmount > 0 && position.assetToken != address(0) && position.collateralAmount > 0 && position.assetAmount > 0, "Nothing to close");
        require(position.owner == positionOwner, "closePosition: unauthorized");

        require(IERC20(position.assetToken).transferFrom(positionOwner, address(this), position.assetAmount), "transferFrom failed");
        burnAsset(position.assetToken, address(this), position.assetAmount);

        require(IERC20(position.collateralToken).transfer(positionOwner, position.assetAmount), "Mint:closePosition,transfer to postion owner failed");
        removePosition(positionIndex);
        emit Burn(msg.sender, positionIndex, position.assetToken, position.assetAmount);
        delete ownerPositionIndex[positionOwner][position.collateralToken][position.assetToken];
    }


    function loadDiscountedPrice(uint positionIndex, address assetToken) private view returns (uint discountedPrice){
        Position memory position = idxPositionMap[positionIndex];
        AssetConfig memory assetConfig = assetConfigMap[assetToken];

        uint price = queryPrice(position.assetToken, position.collateralToken);

        // Check the position is in auction state
        // asset_amount * price_to_collateral * auction_threshold > collateral_amount

        require(position.assetAmount.multiplyDecimal(price).multiplyDecimal(assetConfig.minCollateralRatio) >= position.collateralAmount, "Cannot liquidate a safely collateralized position");

        // Compute discounted price
        discountedPrice = price.multiplyDecimal(assetConfig.auctionDiscount).divideDecimal(SafeDecimalMath.unit());
    }

    function auction(address sender, uint positionIndex, address assetToken, uint assetAmount) override external {
        require(assetToken != address(0) && sender != address(0), "invalid address");
        Position memory position = idxPositionMap[positionIndex];

        assertMigratedAsset(assetConfigMap[assetToken].endPrice);

        require(assetAmount <= position.assetAmount, "Cannot liquidate more than the position amount");

        // Compute discounted price
        uint discountedPrice = loadDiscountedPrice(positionIndex, assetToken);

        // Convert asset value in discounted colalteral unit
        uint assetValueInCollateralAsset = assetAmount.multiplyDecimal(discountedPrice).divideDecimal(SafeDecimalMath.unit());


        AssetTransfer[] memory messages = new AssetTransfer[](4);

        uint returnCollateralAmount;
        uint refundAssetAmount;

        if (assetValueInCollateralAsset > position.collateralAmount) {
            // refunds left asset to position liquidator
            refundAssetAmount = assetValueInCollateralAsset.sub(position.collateralAmount).multiplyDecimal(discountedPrice).divideDecimal(SafeDecimalMath.unit());
            messages[messages.length] = AssetTransfer(assetToken, address(this), sender, refundAssetAmount);
            returnCollateralAmount = position.collateralAmount;
        } else {
            returnCollateralAmount = assetValueInCollateralAsset;
            refundAssetAmount = 0;
        }

        uint liquidatedAssetAmount = assetAmount.sub(refundAssetAmount);
        uint leftAssetAmount = position.assetAmount.sub(liquidatedAssetAmount);
        uint leftCollateralAmount = position.collateralAmount.sub(returnCollateralAmount);


        if (leftCollateralAmount == 0) {
            // all collaterals are sold out
            removePosition(positionIndex);
        } else if (leftAssetAmount == 0) {
            // all assets are paid
            removePosition(positionIndex);
            // refunds left collaterals to position owner
            messages[messages.length] = AssetTransfer(position.collateralToken, address(this), position.owner, leftCollateralAmount);
        } else {
            position.collateralAmount = leftCollateralAmount;
            position.assetAmount = leftAssetAmount;
            savePosition(positionIndex, position);
        }

        burnAsset(assetToken, sender, liquidatedAssetAmount);

        uint protocolFee = calculateProtocolFee(returnCollateralAmount);

        returnCollateralAmount = returnCollateralAmount.sub(protocolFee);

        //Asset memory returnCollateralAsset = Asset({token : position.collateralToken, amount : returnCollateralAmount});
        // messages.push(return_collateral_asset.into_msg(&deps, env.contract.address.clone(), sender)?);

        messages[messages.length] = AssetTransfer(position.collateralToken, address(this), sender, returnCollateralAmount);

        //Asset memory protocol_fee_asset = Asset({token : position.collateralToken, amount : protocolFee});
        //  messages.push(protocol_fee_asset.into_msg(&deps, env.contract.address, deps.api.human_address(&config.collector)?)?);

        messages[messages.length] = AssetTransfer(position.collateralToken, address(this), config.collector, protocolFee);

        for (uint i = 0; i < messages.length; i++) {
            if (messages[i].token != address(0)) {
                transferAsset(messages[i].token, messages[i].sender, messages[i].recipient, messages[i].amount);
            }
        }
        emit Auction(msg.sender, positionIndex, position.owner, returnCollateralAmount, liquidatedAssetAmount, protocolFee);

    }

    function queryConfig() override external view returns (address factory, address oracle, address collector, address baseToken, uint protocolFeeRate){
        Config memory c = config;
        factory = c.factory;
        oracle = c.oracle;
        collector = c.collector;
        baseToken = c.baseToken;
        protocolFeeRate = c.protocolFeeRate;
    }


    function queryAssetConfig(address assetToken) override external view returns (uint auctionDiscount, uint minCollateralRatio, uint endPrice){
        AssetConfig memory m = assetConfigMap[assetToken];
        auctionDiscount = m.auctionDiscount;
        minCollateralRatio = m.minCollateralRatio;
        endPrice = m.endPrice;
    }

    function queryPosition(uint positionIndex) override external view returns (
        address positionOwner,
        address collateralToken,
        uint collateralAmount,
        address assetToken,
        uint assetAmount
    ){
        Position memory m = idxPositionMap[positionIndex];
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
        uint length = postionIdxArray.length;
        idxes = new uint[](length);
        positionOwners = new address[](length);
        collateralTokens = new address[](length);
        collateralAmounts = new uint[](length);
        assetTokens = new address[](length);
        assetAmounts = new uint[](length);
        uint index = 0;
        for (uint i = 0; i < length; i++) {
            Position memory position = idxPositionMap[postionIdxArray[i]];
            if (position.owner == owner) {
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

    function queryPositions(address owner, address assetToken) override external view returns (
        uint[] memory idxes,
        address[]  memory positionOwners,
        address[]  memory collateralTokens,
        uint[] memory collateralAmounts,
        address[]  memory assetTokens,
        uint[] memory assetAmounts
    ) {
        uint length = postionIdxArray.length;
        idxes = new uint[](length);
        positionOwners = new address[](length);
        collateralTokens = new address[](length);
        collateralAmounts = new uint[](length);
        assetTokens = new address[](length);
        assetAmounts = new uint[](length);
        uint index = 0;
        for (uint i = 0; i < length; i++) {
            Position memory position = idxPositionMap[postionIdxArray[i]];
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


    ///// private methods///////
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
        uint requiredTime = block.timestamp.sub(PRICE_EXPIRE_TIME);
        // TODO
        // require(lastUpdatedTime >= requiredTime && denominateLastUpdatedTime >= requiredTime, "Price is too old");
        return relativePrice;

    }

    function readPrice(address token) private view returns (uint price, uint lastUpdatedTime){
        if (config.baseToken == token) {
            (price,lastUpdatedTime) = (SafeDecimalMath.unit(), 2 ** 256 - 1);
        } else {
            (price, lastUpdatedTime) = IOracle(config.oracle).queryPrice(token);
        }
    }


    function calculateProtocolFee(uint returnCollateralAmount) private view returns (uint protocolFee){
        protocolFee = returnCollateralAmount.multiplyDecimal(config.protocolFeeRate).divideDecimal(SafeDecimalMath.unit());
    }

    function transferAsset(address assetToken, address sender, address recipient, uint amount) private {
        require(IERC20(assetToken).transferFrom(sender, recipient, amount), "Unable to execute transferFrom, recipient may have reverted");
    }

    function burnAsset(address assetToken, address tokenOwner, uint amount) private {
        IBEP20Token(assetToken).burn(tokenOwner, amount);
    }

    function assertAuctionDiscount(uint auctionDiscount) pure private {
        require(auctionDiscount <= SafeDecimalMath.unit(), "auctionDiscount must be less than 100%.");
    }

    function assertMinCollateralRatio(uint minCollateralRatio) private pure {
        require(minCollateralRatio >= SafeDecimalMath.unit(), "minCollateralRatio must be bigger than 100%");
    }

    function saveAssetConfig(address assetToken, AssetConfig memory assetConfig) private {
        bool exists = false;
        for (uint i = 0; i < assetTokenArray.length; i++) {
            if (assetTokenArray[i] == assetToken) {
                exists = true;
                break;
            }
        }
        if (!exists) {
            assetTokenArray.push(assetToken);
        }
        assetConfigMap[assetToken] = assetConfig;
    }

    function savePosition(uint positionIndex, Position memory position) private {
        bool exists = false;
        for (uint i = 0; i < postionIdxArray.length; i++) {
            if (postionIdxArray[i] == positionIndex) {
                exists = true;
                break;
            }
        }
        if (!exists) {
            postionIdxArray.push(positionIndex);
        }
        idxPositionMap[positionIndex] = position;
    }

    function removePosition(uint positionIndex) private {
        delete idxPositionMap[positionIndex];
        uint length = postionIdxArray.length;
        for (uint i = 0; i < length; i++) {
            if (postionIdxArray[i] == positionIndex) {
                if (i != length - 1) {
                    postionIdxArray[i] = postionIdxArray[length - 1];
                }
                delete postionIdxArray[length - 1];
            }
        }
    }


}
