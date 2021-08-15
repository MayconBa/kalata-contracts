// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "./interfaces/IFactory.sol";
import "./interfaces/IMint.sol";
import "./interfaces/IStaking.sol";
import "./libraries/SafeDecimalMath.sol";
import "./libraries/ContractFactory.sol";
import "./libraries/Bytes32.sol";
import "./BEP20Token.sol";
import "./SafeAccess.sol";


contract Factory is OwnableUpgradeable, IFactory, SafeAccess {
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using Bytes32 for bytes32;
    using ContractFactory for bytes;

    struct Token {
        bytes32 tokenName;
        bytes32 tokenSymbol;
        address tokenAddress;
        address busdPairAddress;
    }

    struct DistributionSchedule {
        uint startTime;
        uint endTime;
        uint amount;
    }


    struct Params {
        uint auctionDiscount;
        // Minium collateral ratio applied to asset mint
        uint minCollateralRatio;
        // Distribution weight (default is 30, which is 1/10 of KALA distribution weight)
        uint weight;
    }

    uint private constant DISTRIBUTION_INTERVAL = 60;

    //Distribution schedule for the minting of new KALA tokens.
    //Determines the total amount of new KALA tokens minted as rewards for LP stakers over the interval [start time, end time].
    DistributionSchedule[] private _distributionSchedules;

    uint private _lastDistributeIndex;
    uint private _lastDistributed;
    uint private _totalWeight;

    mapping(address => uint)  private _assetWeights;
    address[] private _addresses;

    mapping(bytes32 => address) private _symbolTokenMap;
    Token[] private _tokens;

    //Contract address of Kalata Mint
    address private _mint;
    //Contract address of Kalata Staking
    address private _staking;

    //Contract address of Uniswap Factory
    address private _uniswapFactory;
    address private _baseToken;

    address private _govToken;

    uint private _distributeStartTime;

    function initialize(address mint, address staking, address uniswapFactory, address baseToken, address govToken) external initializer {
        __Ownable_init();
        _updateConfig(mint, staking, uniswapFactory, baseToken, govToken);
        _totalWeight = 32;
        _distributeStartTime = 0;
    }

    function updateDistributeStartTime(uint distributeStartTime) public {
        _distributeStartTime = distributeStartTime;
    }

    function updateConfig(
        address mint, address staking,
        address uniswapFactory,
        address baseToken, address govToken
    ) override external onlyOwner {
        _updateConfig(mint, staking, uniswapFactory, baseToken, govToken);
    }

    //time schedule should be ordered by time
    //times are not allowed to overlap
    function updateDistributionSchedules(uint[] calldata startTimes, uint[] calldata endTimes, uint[] calldata amounts) override external onlyOwner {
        require(
            startTimes.length > 0 && startTimes.length == endTimes.length && startTimes.length == amounts.length,
            "Invalid arguments"
        );

        delete _distributionSchedules;

        for (uint i; i < startTimes.length; i++) {
            require(endTimes[i] > startTimes[i], "End time should be greater than start time");
            if (i > 0) {
                require(startTimes[i] >= endTimes[i - 1], "Time overlap");
            }
            _distributionSchedules.push(DistributionSchedule(startTimes[i], endTimes[i], amounts[i]));
        }
    }


    function updateWeight(address assetToken, uint weight) override external onlyOwner {
        uint originWeight = _assetWeights[assetToken];
        saveWeight(assetToken, weight);
        _totalWeight = _totalWeight.add(weight).sub(originWeight);
        emit UpdateWeight(msg.sender, assetToken, weight);
    }

    //Introduces a new mAsset to the protocol and creates markets on Uniswap. This process will:
    //    1.Instantiate the mAsset contract as a new Uniswap CW20 token
    //    2.Register the mAsset with  Kalata Mint
    //    3.Create a new Uniswap Pair for the new mAsset against USD
    //    4.Instantiate the LP Token contract associated with the pool as a new Uniswap token
    //    5.Register the LP token with the Kalata Staking contract
    function whitelist(bytes32 name, bytes32 symbol, uint auctionDiscount, uint minCollateralRatio, uint weight) override external onlyOwner {
        addToken(owner(), name, symbol, auctionDiscount, minCollateralRatio, weight);
    }

    //register exists assets
    function registerAsset(address tokenAddress, address pairAddress, bytes32 name, bytes32 symbol,
        uint auctionDiscount, uint minCollateralRatio, uint weight) override external onlyOwner {
        if (_symbolTokenMap[symbol] == address(0)) {
            _registerAsset(tokenAddress, pairAddress, name, symbol, auctionDiscount, minCollateralRatio, weight);
        }
    }


    //kalata inflation rewards on the staking pool
    //Mints the appropriate amount of new KALA tokens as reward for LP stakers by sends the newly minted tokens
    //    to the Kalata Staking contract to be distributed to its stakers.
    //The contract keeps track of the last height at which Distribute was called for a specific asset,
    //    and uses it to calculate the amount of new assets to mint for the blocks occurred in the interval between.
    //Anyone can execute distribute operation at any time to trigger block reward distribution for LP stakers.
    //
    //let startTimes = [21600, 31557600, 63093600, 94629600]
    //let endTimes = [31557600, 63093600, 94629600, 126165600]
    //let amounts = [toUnitString(549000), toUnitString(274500), toUnitString(137250), toUnitString(68625)]
    //
    //1st year: genesisTime+(21600 to 31557600),      distribute 549000 kala tokens
    //2nd year: genesisTime+(31557600 to 63093600),   distribute 274500 kala tokens
    //3rd year: genesisTime+(63093600 to 94629600),   distribute 137250 kala tokens
    //4th year: genesisTime+(94629600 to 126165600),  distribute 68625 kala tokens
    function distribute() override external nonContractAccess {
        require(_distributeStartTime > 0 && block.timestamp.sub(_lastDistributed) >= DISTRIBUTION_INTERVAL, "Factory: DISTRIBUTE_NOT_TIME");
        uint timeElapsed = block.timestamp.sub(_distributeStartTime);
        uint distributedAmount = 0;
        for (uint i = 0; i < _distributionSchedules.length; i++) {
            DistributionSchedule memory schedule = _distributionSchedules[i];
            if (schedule.startTime <= timeElapsed && timeElapsed < schedule.endTime) {
                uint timeSlot = schedule.endTime.sub(schedule.startTime);
                uint timeDuration = Math.min(timeElapsed, schedule.endTime).sub(
                    Math.max(schedule.startTime, _lastDistributed > _distributeStartTime ? _lastDistributed.sub(_distributeStartTime) : 0)
                );
                uint amount = timeDuration.multiplyDecimal(schedule.amount.divideDecimal(timeSlot));
                distributedAmount = amount;
                break;
            }
        }
        _lastDistributed = block.timestamp;
        if (distributedAmount > 0) {
            IBEP20Token(_govToken).mint(_staking, distributedAmount);
            address[] memory assets = _addresses;
            uint[] memory amounts = new uint[](assets.length);
            for (uint i = 0; i < assets.length; i++) {
                amounts[i] = distributedAmount.multiplyDecimal(_assetWeights[assets[i]].divideDecimal(_totalWeight));
            }
            IStaking(_staking).depositRewards(assets, amounts);
        }
    }

    function distributeAsset(address asset, uint amount) private {
        if (asset != address(0) && amount > 0) {
            IStaking(_staking).depositReward(asset, amount);
            emit Distribute(msg.sender, asset, amount);
        }
    }

    //uint public interestRate = (5 * SafeDecimalMath.unit()) / 100;
    function revokeAsset(address assetToken, uint endPrice) override external onlyOwner {
        _revokeAsset(assetToken, endPrice);
        emit RevokeAsset(msg.sender, assetToken, endPrice);
    }

    function migrateAsset(bytes32 name, bytes32 symbol, address assetToken, uint endPrice) override external onlyOwner {
        (uint auctionDiscount, uint minCollateralRatio,) = IMint(_mint).queryAssetConfig(assetToken);
        uint weight = _revokeAsset(assetToken, endPrice);
        addToken(owner(), name, symbol, auctionDiscount, minCollateralRatio, weight);
        emit MigrateAsset(msg.sender, endPrice, assetToken);
    }

    function queryConfig() override external view returns (
        address mint,

        address staking,
        address uniswapFactory,
        address baseToken,
        address govToken
    ){

        govToken = _govToken;
        mint = _mint;
        uniswapFactory = _uniswapFactory;
        staking = _staking;
        baseToken = _baseToken;
    }

    //Add this method beside queryConfig, because too many variables are not allowed in solidity
    function queryDistributionSchedules() override external view returns (
        uint[] memory startTimes, //seconds
        uint[] memory endTimes, //seconds
        uint[] memory amounts//distribution amount for the interval
    ){

        startTimes = new uint[](_distributionSchedules.length);
        endTimes = new uint[](_distributionSchedules.length);
        amounts = new uint[](_distributionSchedules.length);

        for (uint i = 0; i < _distributionSchedules.length; i++) {
            startTimes[i] = _distributionSchedules[i].startTime;
            endTimes[i] = _distributionSchedules[i].endTime;
            amounts[i] = _distributionSchedules[i].amount;
        }
    }

    function queryDistributeAmount() override external view returns (uint){
        uint timeElapsed = block.timestamp.sub(_distributeStartTime);
        for (uint i = 0; i < _distributionSchedules.length; i++) {
            DistributionSchedule memory schedule = _distributionSchedules[i];
            if (timeElapsed >= schedule.startTime && timeElapsed <= schedule.endTime) {
                return schedule.amount;
            }
        }
        return 0;
    }

    function queryWeight(address token) override external view returns (uint){
        return _assetWeights[token];
    }

    function queryAllAssetWeights() override external view returns (address[] memory assets, uint[] memory weights){
        assets = _addresses;
        weights = new uint[](assets.length);
        for (uint i = 0; i < assets.length; i++) {
            weights[i] = _assetWeights[assets[i]];
        }
    }

    function queryTotalWeight() override external view returns (uint){
        return _totalWeight;
    }

    function queryToken(bytes32 symbol) override external view returns (address token){
        token = _symbolTokenMap[symbol];
    }

    function queryAssets() override external view returns (
        bytes32[] memory names,
        bytes32[] memory symbols,
        address[] memory addresses,
        address[] memory busdPairAddresses
    ){
        names = new bytes32[](_tokens.length);
        symbols = new bytes32[](_tokens.length);
        addresses = new address[](_tokens.length);
        busdPairAddresses = new address[](_tokens.length);
        for (uint i = 0; i < _tokens.length; i++) {
            Token memory token = _tokens[i];
            names[i] = token.tokenName;
            symbols[i] = token.tokenSymbol;
            addresses[i] = token.tokenAddress;
            busdPairAddresses[i] = token.busdPairAddress;
        }
    }


    function saveWeight(address assetToken, uint weight) private {
        bool exists = false;
        for (uint i = 0; i < _addresses.length; i++) {
            if (_addresses[i] == assetToken) {
                exists = true;
                break;
            }
        }
        if (!exists) {
            _addresses.push(assetToken);
        }
        _assetWeights[assetToken] = weight;
    }

    function removeWeight(address assetToken) private {
        delete _assetWeights[assetToken];
        uint length = _addresses.length;
        for (uint i = 0; i < length; i++) {
            if (_addresses[i] == assetToken) {
                if (i != length - 1) {
                    _addresses[i] = _addresses[length - 1];
                }
                delete _addresses[length - 1];
            }
        }
    }


    function addToken(address tokenOwner, bytes32 name, bytes32 symbol,
        uint auctionDiscount, uint minCollateralRatio, uint weight) private {
        require(_symbolTokenMap[symbol] == address(0), "symbol already exists");

        address tokenAddress = createToken(tokenOwner, name, symbol);
        address pairAddress = IUniswapV2Factory(_uniswapFactory).createPair(_baseToken, tokenAddress);

        _registerAsset(tokenAddress, pairAddress, name, symbol, auctionDiscount, minCollateralRatio, weight);
    }


    function _registerAsset(address tokenAddress, address pairAddress, bytes32 name, bytes32 symbol,
        uint auctionDiscount, uint minCollateralRatio, uint weight) private {

        _symbolTokenMap[symbol] = tokenAddress;
        _tokens.push(Token(name, symbol, tokenAddress, pairAddress));
        saveWeight(tokenAddress, weight);
        _totalWeight = _totalWeight.add(weight);
        IMint(_mint).registerAsset(tokenAddress, auctionDiscount, minCollateralRatio);
        IStaking(_staking).registerAsset(tokenAddress, pairAddress);
    }


    function createToken(address tokenOwner, bytes32 name, bytes32 symbol) private returns (address addr) {
        bytes memory code = type(BEP20Token).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(name, symbol, block.timestamp));
        addr = code.deploy(salt);
        require(addr != address(0), "createToken failed");
        BEP20Token(addr).initialize(name.convertToString(), symbol.convertToString(), 0);
        address[] memory minters = new address[](2);
        minters[0] = address(this);
        minters[1] = _mint;
        BEP20Token(addr).registerMinters(minters);
        BEP20Token(addr).transferOwnership(tokenOwner);
        emit TokenCreated(msg.sender, name, symbol, 0, addr);
    }

    function _updateConfig(address mint, address staking, address uniswapFactory, address baseToken, address govToken) private {
        require(
            mint != address(0) && staking != address(0) && uniswapFactory != address(0) && baseToken != address(0) && govToken != address(0),
            "Invalid address"
        );
        _mint = mint;
        _staking = staking;
        _uniswapFactory = uniswapFactory;
        _baseToken = baseToken;
        _govToken = govToken;
    }

    function _revokeAsset(address assetToken, uint endPrice) private returns (uint weight){
        require(assetToken != address(0), "Invalid assetToken");
        require(endPrice != 0, "Invalid endPrice");
        weight = _assetWeights[assetToken];
        removeWeight(assetToken);
        _totalWeight = _totalWeight.sub(weight);
        IMint(_mint).registerMigration(assetToken, endPrice);
    }

}
