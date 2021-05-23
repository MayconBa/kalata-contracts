// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "../interfaces/IFactory.sol";
import "../interfaces/IMint.sol";
import "../interfaces/IOracle.sol";
import "../interfaces/IStaking.sol";
import "../libraries/SafeDecimalMath.sol";
import "../libraries/ContractFactory.sol";
import "../libraries/Bytes32.sol";
import "./BEP20Token.sol";


//The Factory contract is Kalata Protocol's central directory and organizes information related to mAssets and the Kalata Token (KALA).
//It is also responsible for minting new KALA tokens each block and distributing them to the Staking Contract for rewarding LP Token stakers.
//After the initial bootstrapping of Kalata Protocol contracts, the Factory is assigned to be the owner for the Mint, Oracle, Staking, and Collector contracts.
//The Factory is owned by the Governance Contract.
contract Factory is OwnableUpgradeable, IFactory {
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using Bytes32 for bytes32;
    using ContractFactory for bytes;

    uint constant KALATA_TOKEN_WEIGHT = 300;

    uint constant NORMAL_TOKEN_WEIGHT = 30;

    uint constant DISTRIBUTION_INTERVAL = 60;

    Config _config;
    uint _genesisTime;

    //Distribution schedule for the minting of new KALA tokens.
    //Determines the total amount of new KALA tokens minted as rewards for LP stakers over the interval [start time, end time].
    DistributionSchedule[] _distributionSchedules;

    uint _lastDistributeIndex;
    uint _lastDistributed;
    uint _totalWeight;

    mapping(address => uint)  _assetWeights;
    address[] _addresses;

    mapping(bytes32 => address) _symbolTokenMap;
    Token[] _tokens;

    modifier onlyOwnerOrGovernance() {
        require(_config.governance == _msgSender() || _msgSender() == owner(), "Unauthorized,need governace/owner to perform.");
        _;
    }

    function initialize(
        address governance, address mint, address oracle, address staking,
        address uniswapFactory,
        address baseToken, address govToken
    ) external virtual initializer {
        __Ownable_init();
        _updateConfig(governance, mint, oracle, staking, uniswapFactory, baseToken, govToken);
        _totalWeight = 32;
        _genesisTime = block.timestamp;
    }

    function updateConfig(
        address governance, address mint, address oracle, address staking,
        address uniswapFactory,
        address baseToken, address govToken
    ) override external onlyOwner {
        _updateConfig(governance, mint, oracle, staking, uniswapFactory, baseToken, govToken);
    }

    //time schedule should be ordered by time
    //times are not allowed to overlap
    function updateDistributionSchedules(uint[] calldata startTimes, uint[] calldata endTimes, uint[] calldata amounts) override external onlyOwner {
        require(
            startTimes.length > 0 && startTimes.length == endTimes.length && startTimes.length == amounts.length,
            "Invalid arguments"
        );

        delete _distributionSchedules;
        _lastDistributeIndex = 0;
        for (uint i; i < startTimes.length; i++) {
            require(endTimes[i] > startTimes[i], "End time should be greater than start time");
            if (i > 0) {
                require(startTimes[i] >= endTimes[i - 1], "Time overlap");
            }
            _distributionSchedules.push(DistributionSchedule(startTimes[i], endTimes[i], amounts[i]));
        }
    }


    function updateWeight(address assetToken, uint weight) override external onlyOwnerOrGovernance {
        uint originWeight = _assetWeights[assetToken];

        saveWeight(assetToken, weight);

        _totalWeight = _totalWeight.add(weight).sub(originWeight);

        emit UpdateWeight(assetToken, weight);
    }

    //Introduces a new mAsset to the protocol and creates markets on Uniswap. This process will:
    //    1.Instantiate the mAsset contract as a new Uniswap CW20 token
    //    2.Register the mAsset with Kalata Oracle and Kalata Mint
    //    3.Create a new Uniswap Pair for the new mAsset against USD
    //    4.Instantiate the LP Token contract associated with the pool as a new Uniswap token
    //    5.Register the LP token with the Kalata Staking contract
    function whitelist(bytes32 name, bytes32 symbol, address oracleFeeder, uint auctionDiscount, uint minCollateralRatio, uint weight) override external onlyOwnerOrGovernance {
        addToken(owner(), oracleFeeder, name, symbol, 0, auctionDiscount, minCollateralRatio, weight);
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
    function distribute() override external {
        require(block.timestamp.sub(_lastDistributed) >= DISTRIBUTION_INTERVAL, "Cannot distribute Kalata Token before interval");

        uint timeElapsed = block.timestamp.sub(_genesisTime);

        uint distributedAmount = 0;

        for (uint i = _lastDistributeIndex; i < _distributionSchedules.length; i++) {
            DistributionSchedule memory schedule = _distributionSchedules[i];
            if (timeElapsed >= schedule.startTime) {
                uint timeSlot = schedule.endTime.sub(schedule.startTime);
                uint timeDuration = Math.min(timeElapsed, schedule.endTime).sub(Math.max(schedule.startTime, _lastDistributed));
                uint amount = timeDuration.multiplyDecimal(schedule.amount.divideDecimal(timeSlot));
                distributedAmount = amount;
                if (_lastDistributeIndex != i) {
                    _lastDistributeIndex = i;
                }
                break;
            }
        }
        if (distributedAmount > 0) {
            for (uint i = 0; i < _addresses.length; i++) {
                address token = _addresses[i];
                uint amount = distributedAmount.multiplyDecimal(_assetWeights[token]).divideDecimal(_totalWeight);
                if (amount > 0) {
                    IBEP20Token(_config.govToken).mint(_config.staking, amount);
                    IStaking(_config.staking).depositReward(_config.govToken, amount);
                }
            }
        }
        _lastDistributed = block.timestamp;
        emit Distribute(distributedAmount);
    }

    //uint public interestRate = (5 * SafeDecimalMath.unit()) / 100;
    function revokeAsset(address assetToken, uint endPrice) override external {
        _revokeAsset(assetToken, endPrice);
        emit RevokeAsset(assetToken, endPrice);
    }




    // Can be issued by the oracle feeder of an mAsset to trigger the mAsset migration procedure.
    // In situations where the tracked asset undergoes a corporate event such as a stock split, merger, bankruptcy, etc. and becomes difficult to reflect properly due to inconsistencies, an mAsset can be deprecated, or discontinued, with the following migration procedure initiated by the oracle feeder:
    // New replacement mAsset token, Uniswap pair, and LP tokens contracts are created, and the present values of properties of mAsset will be transferred over
    // The oracle feeder sets the "end price" for the mAsset to the latest valid price
    // The mAsset's min. collateral ratio is set to 100%
    // At this stage:
    //    CDPs may no longer mint new tokens of the mAsset
    //    Liquidation auctions are disabled for the mAsset
    //    Burns will take effect at the fixed "end price" for withdrawing collateral deposits
    //    LP tokens for the mAsset will stop counting for staking rewards
    //    Deprecation will not directly affect the functionality of the mAsset's Uniswap pool and users will still be able to make trades against it, although price is likely to be very unstable. Users are urged to burn the mAsset to recover their collateral if they have an open position, and are free to open a new CDP / engage in liquidity provision for the new, replacement mAsset. The old mAsset will be retired and marked as "deprecated" on front-end interfaces.
    // Oracle Feeder of the assetToken execute this method
    function migrateAsset(bytes32 name, bytes32 symbol, address assetToken, uint endPrice) override external {
        (uint auctionDiscount, uint minCollateralRatio,) = IMint(_config.mint).queryAssetConfig(assetToken);
        (uint weight,address feeder) = _revokeAsset(assetToken, endPrice);
        addToken(owner(), feeder, name, symbol, 0, auctionDiscount, minCollateralRatio, weight);
        emit MigrateAsset(endPrice, assetToken);
    }

    function queryConfig() override external view returns (
        address governance,
        address mint,
        address oracle,
        address staking,
        address uniswapFactory,
        address baseToken,
        address govToken
    ){
        Config memory m = _config;
        governance = m.governance;
        govToken = m.govToken;
        mint = m.mint;
        oracle = m.oracle;
        uniswapFactory = m.uniswapFactory;
        staking = m.staking;
        baseToken = m.baseToken;
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

    function queryWeight(address token) override external view returns (uint){
        return _assetWeights[token];
    }

    //TODO, add testcase
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

    //////////////////////internal methods//////////////////

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


    function addToken(address tokenOwner, address oracleFeeder, bytes32 name, bytes32 symbol, uint initialSupply,
        uint auctionDiscount, uint minCollateralRatio, uint weight) private {

        address tokenAddress = createToken(tokenOwner, name, symbol, initialSupply);
        require(tokenAddress != address(0), "createToken failed");

        weight = weight == 0 ? NORMAL_TOKEN_WEIGHT : weight;

        saveWeight(tokenAddress, weight);
        _totalWeight = _totalWeight.add(weight);

        IMint(_config.mint).registerAsset(tokenAddress, auctionDiscount, minCollateralRatio);
        IOracle(_config.oracle).registerAsset(tokenAddress, oracleFeeder);

        address pairAddress = IUniswapV2Factory(_config.uniswapFactory).createPair(_config.baseToken, tokenAddress);

        _tokens.push(Token(name, symbol, tokenAddress, pairAddress));

        //address lpToken = IUniswapV2Factory(_config.uniswapFactory).getPair(assetToken, _config.baseToken);
        IStaking(_config.staking).registerAsset(tokenAddress, pairAddress);
    }


    function createToken(address tokenOwner, bytes32 name, bytes32 symbol, uint initialSupply) private returns (address addr) {
        require(_symbolTokenMap[symbol] == address(0), "symbol already exists");

        bytes memory code = type(BEP20Token).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(name, symbol, block.timestamp));
        addr = code.deploy(salt);
        BEP20Token(addr).initialize(name.convertToString(), symbol.convertToString(), initialSupply);
        address[] memory minters = new address[](2);
        minters[0] = address(this);
        minters[1] = _config.mint;
        BEP20Token(addr).registerMinters(minters);
        BEP20Token(addr).transferOwnership(tokenOwner);
        _symbolTokenMap[symbol] = addr;

        emit TokenCreated(name, symbol, initialSupply, addr);
    }

    function _updateConfig(
        address governance, address mint, address oracle, address staking, address uniswapFactory,
        address baseToken, address govToken
    ) private {
        require(governance != address(0), "Invalid governance address");
        require(mint != address(0), "Invalid mint address");
        require(oracle != address(0), "Invalid oracle address");
        require(staking != address(0), "Invalid staking address");
        require(uniswapFactory != address(0), "Invalid uniswapFactory address");
        require(baseToken != address(0), "Invalid baseToken address");
        require(govToken != address(0), "Invalid govToken address");
        _config = Config(governance, mint, oracle, staking, uniswapFactory, baseToken, govToken);
    }

    function _revokeAsset(address assetToken, uint endPrice) private returns (uint weight, address feeder){
        require(assetToken != address(0), "Invalid assetToken");
        require(endPrice != 0, "Invalid endPrice");
        feeder = IOracle(_config.oracle).queryFeeder(assetToken);
        require(feeder == _msgSender(), "unauthorized");
        weight = _assetWeights[assetToken];
        removeWeight(assetToken);
        _totalWeight = _totalWeight.sub(weight);
        IMint(_config.mint).registerMigration(assetToken, endPrice);
    }

}
