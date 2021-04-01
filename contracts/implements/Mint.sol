// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../interfaces/IMint.sol";
import "../interfaces/IOracle.sol";
import "../interfaces/IBEP20Token.sol";
import "../interfaces/IERC20.sol";
import "../libraries/SafeDecimalMath.sol";

/**
    The Mint Contract implements the logic for Collateralized Debt Positions (CDPs),
    through which users can mint new mAsset tokens against their deposited collateral (UST or mAssets).
    Current prices of collateral and minted mAssets are read from the Oracle Contract determine the C-ratio of each CDP.
    The Mint Contract also contains the logic for liquidating CDPs with C-ratios below the minimum for their minted mAsset through auction.
*/
contract Mint is OwnableUpgradeable, IMint {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    uint constant PRICE_EXPIRE_TIME = 60;

    Config config;

    mapping(address => AssetConfig) assetConfigMap;

    //for looping assetConfigMap;
    address [] assetTokenArray;

    mapping(uint => Position) idxPositionMap;

    //for looping idxPositionMap
    uint[] postionIdxArray;

    uint currentpositionIndex;


    modifier onlyFactoryOrOwner() {
        require(config.factory == _msgSender() || owner() == _msgSender(), "Unauthorized, only factory/owner can perform");
        _;
    }


    function initialize(address factory, address oracle, address collector, address baseToken, uint protocolFeeRate) external virtual initializer {
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
        emit UpdateConfig(factory, oracle, collector, baseToken, protocolFeeRate);
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
        emit UpdateAsset(assetToken, auctionDiscount, minCollateralRatio);

    }

    function registerAsset(address assetToken, uint auctionDiscount, uint minCollateralRatio) override external onlyFactoryOrOwner {
        require(assetConfigMap[assetToken].token == address(0), "Asset was already registered");
        _saveAsset(assetToken, auctionDiscount, minCollateralRatio);
        emit RegisterAsset(assetToken, auctionDiscount, minCollateralRatio);
    }

    function _saveAsset(address assetToken, uint auctionDiscount, uint minCollateralRatio) internal virtual {
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
    }

    /**
      *  OpenPosition
      *  Used for creating a new CDP with USD collateral. For creating a CDP using mAsset collateral, you need to use the Receive Hook variant.
      *  Opens a new CDP with an initial deposit of collateral.
      *  The user specifies the target minted mAsset for the CDP, and sets the desired initial collateralization ratio,
      *  which must be greater or equal than the minimum for the mAsset.
      *  sender is the end user
      *
    */
    function openPosition(address collateralToken, uint collateralAmount, address assetToken, uint collateralRatio) override external returns (uint){
        address sender = _msgSender();
        require(collateralToken != address(0), "Invalid collateralToken address");
        require(assetToken != address(0), "Invalid assetContract address");
        require(collateralAmount > 0, "Wrong collateral");

        //User should invoke IERC20.approve
        require(IERC20(collateralToken).transferFrom(sender, address(this), collateralAmount),"Unable to execute transferFrom, recipient may have reverted");

        AssetConfig memory assetConfig = assetConfigMap[assetToken];

        require(assetConfig.token == assetToken, "Asset not registed");
        require(assetConfig.endPrice == 0, "Operation is not allowed for the deprecated asset");
        require(collateralRatio >= assetConfig.minCollateralRatio, "Can not open a position with low collateral ratio than minimum");

        uint relativeCollateralPrice = queryPrice(collateralToken, assetToken, block.timestamp);

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

        idxPositionMap[position.idx] = position;

        currentpositionIndex += 1;
        IBEP20Token(assetToken).mint(sender, mintAmount);
        emit OpenPosition(sender, collateralToken, collateralAmount, assetToken, collateralRatio, position.idx, mintAmount);

        ownerPositionIndex[sender][collateralToken][assetToken] = position.idx;
        return position.idx;
    }




    //Deposits additional collateral to an existing CDP to raise its C-ratio.
    //After method IERC20.approve()
    function deposit(uint positionIndex, address collateralToken, uint collateralAmount) override external {
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

        require(IERC20(collateralToken).transferFrom(sender, address(this), collateralAmount),"Unable to execute transferFrom, recipient may have reverted");


        position.collateralAmount = position.collateralAmount.add(collateralAmount);
        savePostiion(positionIndex, position);

        emit Deposit(positionIndex, collateralToken, collateralAmount);
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


        uint relativeCollateralPrice = queryPrice(position.collateralToken, position.assetToken, block.timestamp);

        // Compute new collateral amount
        uint newCollateralAmount = position.collateralAmount.sub(withdrawAmount);

        // Convert asset to collateral unit
        uint assetValueInCollateralAsset = position.assetAmount.multiplyDecimal(relativeCollateralPrice);

        require(assetValueInCollateralAsset.multiplyDecimal(assetConfig.minCollateralRatio) <= newCollateralAmount, "Cannot withdraw collateral over than minimum collateral ratio");

        position.collateralAmount = newCollateralAmount;
        if (position.collateralAmount == 0 && position.assetAmount == 0) {
            removePostiion(positionIndex);
        } else {
            savePostiion(positionIndex, position);
        }

        uint protocolFee = withdrawAmount.multiplyDecimal(config.protocolFeeRate);

        //to sender
        IERC20(collateralToken).transfer(_msgSender(), withdrawAmount .sub(protocolFee));

        //to collector
        IERC20(collateralToken).transfer(config.collector, protocolFee);

        emit Withdraw(positionIndex, collateralToken, withdrawAmount, protocolFee);
    }

    //In case the collateralRatio is too large, user can mint more mAssets to reduce the collateralRatio;
    function mint(uint positionIndex, address assetToken, uint assetAmount) override external {
        require(assetToken != address(0), "invalid address");

        Position memory position = idxPositionMap[positionIndex];
        require(position.owner == _msgSender(), "mint unauthorized");
        assertAsset(position.assetToken, assetToken, assetAmount);

        AssetConfig memory assetConfig = assetConfigMap[position.assetToken];
        assertMigratedAsset(assetConfig.endPrice);

        uint relativeCollateralPrice = queryPrice(position.collateralToken, position.assetToken, block.timestamp);

        // Compute new asset amount
        uint newAssetAmount = assetAmount.add(position.assetAmount);

        // Convert asset to collateral unit
        uint assetValueInCollateralAsset = newAssetAmount.multiplyDecimal(relativeCollateralPrice);

        require(assetValueInCollateralAsset.multiplyDecimal(assetConfig.minCollateralRatio) <= position.collateralAmount, "Cannot mint asset over than min collateral ratio");

        position.assetAmount = position.assetAmount.add(assetAmount);
        savePostiion(positionIndex, position);

        IBEP20Token(assetConfig.token).mint(_msgSender(), assetAmount);
        emit MintEvent(positionIndex, assetToken, assetAmount);
    }


    /**
        1. User approve assetAmounts to Mint contract.
        2. Mint Contract burn the contract and refund to user.
        Burns the sent tokens against a CDP and reduces the C-ratio.
        If all outstanding minted mAsset tokens are burned, the position is closed and the collateral is returned.
    */
    function burn(uint positionIndex, address assetToken, uint assetAmount) override external {
        address positionOwner = _msgSender();

        require(assetToken != address(0) && positionOwner != address(0), "burn: invalid address");


        Position memory position = idxPositionMap[positionIndex];

        require(position.owner == positionOwner, "burn: unauthorized");

        assertAsset(position.assetToken, assetToken, assetAmount);

        AssetConfig memory assetConfig = assetConfigMap[assetToken];
        require(position.assetAmount >= assetAmount, "Cannot burn asset more than you mint");


        require(assetConfig.endPrice > 0, "Asset is not in deprecated state");

        require(IERC20(assetToken).transferFrom(positionOwner, address(this), assetAmount),"Unable to execute transferFrom, recipient may have reverted");

        Asset memory refundCollateral = Asset({token : position.collateralToken, amount : assetAmount.divideDecimal(assetConfig.endPrice)});

        position.assetAmount = position.assetAmount.sub(assetAmount);
        position.collateralAmount = position.collateralAmount.sub(refundCollateral.amount);

        if (position.collateralAmount == 0 && position.assetAmount == 0) {
            removePostiion(positionIndex);
        } else {
            savePostiion(positionIndex, position);
        }


        burnAsset(assetConfig.token, address(this), assetAmount);

        emit Burn(positionIndex, assetToken, assetAmount);

        IERC20(refundCollateral.token).transfer(positionOwner, refundCollateral.amount);
        emit RefundCollateralAmount(refundCollateral.token, refundCollateral.amount);

    }


    function loadDiscountedPrice(uint positionIndex, address assetToken) internal virtual returns (uint discountedPrice){
        Position memory position = idxPositionMap[positionIndex];
        AssetConfig memory assetConfig = assetConfigMap[assetToken];

        uint price = queryPrice(position.assetToken, position.collateralToken, block.timestamp);

        // Check the position is in auction state
        // asset_amount * price_to_collateral * auction_threshold > collateral_amount

        require(position.assetAmount.multiplyDecimal(price) .multiplyDecimal(assetConfig.minCollateralRatio) >= position.collateralAmount, "Cannot liquidate a safely collateralized position");

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
            removePostiion(positionIndex);
        } else if (leftAssetAmount == 0) {
            // all assets are paid
            removePostiion(positionIndex);
            // refunds left collaterals to position owner
            messages[messages.length] = AssetTransfer(position.collateralToken, address(this), position.owner, leftCollateralAmount);
        } else {
            position.collateralAmount = leftCollateralAmount;
            position.assetAmount = leftAssetAmount;
            savePostiion(positionIndex, position);
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

        emit Auction(positionIndex, position.owner, returnCollateralAmount, liquidatedAssetAmount, protocolFee);

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


    ///// internal methods///////
    function assertMigratedAsset(uint endPrice) pure internal virtual {
        require(endPrice == 0, "Operation is not allowed for the deprecated asset");
    }

    function assertCollateral(address positionCollateralToken, address collateralToken, uint collateralAmount) pure internal virtual {
        require(positionCollateralToken == collateralToken && collateralAmount != 0, " Wrong collateral");
    }

    // Check zero balance & same asset with position
    function assertAsset(address postionAssetToken, address assetToken, uint assetAmount) internal virtual {
        require(assetToken == postionAssetToken && assetAmount > 0, "Wrong asset");
    }
    //positionOwner=>collateralToken=>assetToken=>positionIndex
    mapping(address => mapping(address => mapping(address => uint))) ownerPositionIndex;

    //Since openPostion function cannot  return value(because it's a transaction,only returns transaction receipt), use this method to get the positionIndex
    function queryPositionIndex(address postionOwner, address collateralToken, address assetToken) override external view returns (uint positionIndex){
        positionIndex = ownerPositionIndex[postionOwner][collateralToken][assetToken];
    }

    function queryPrice(address targetAssetToken, address denominateAssetToken, uint blockTime) internal virtual view returns (uint){
        (uint relativePrice, uint targetLastUpdatedTime, uint denominateLastUpdatedTime) = IOracle(config.oracle).queryPrice(targetAssetToken, denominateAssetToken);
        if (blockTime > 0) {
            uint requiredTime = blockTime.sub(PRICE_EXPIRE_TIME);
            require(targetLastUpdatedTime >= requiredTime && denominateLastUpdatedTime >= requiredTime, "Price is too old");
        }
        return relativePrice;

    }

    function calculateProtocolFee(uint returnCollateralAmount) internal virtual returns (uint protocolFee){
        protocolFee = returnCollateralAmount.multiplyDecimal(config.protocolFeeRate).divideDecimal(SafeDecimalMath.unit());
    }

    function transferAsset(address assetToken, address sender, address recipient, uint amount) internal virtual {
        require(IERC20(assetToken).transferFrom(sender, recipient, amount),"Unable to execute transferFrom, recipient may have reverted");
    }

    function burnAsset(address assetToken, address tokenOwner, uint amount) internal virtual {
        IBEP20Token(assetToken).burn(tokenOwner, amount);
    }

    function assertAuctionDiscount(uint auctionDiscount) internal virtual {
        require(auctionDiscount <= SafeDecimalMath.unit(), "auctionDiscount must be less than 100%.");
    }

    function assertMinCollateralRatio(uint minCollateralRatio) internal virtual pure {
        require(minCollateralRatio >= SafeDecimalMath.unit(), "minCollateralRatio must be bigger than 100%");
    }

    function saveAssetConfig(address assetToken, AssetConfig memory assetConfig) internal virtual {
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

    function savePostiion(uint positionIndex, Position memory position) internal virtual {
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

    function removePostiion(uint positionIndex) internal virtual {
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