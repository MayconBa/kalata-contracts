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

    Config config;
    uint genesisTime;
    //Distribution schedule for the minting of new KALA tokens.
    //Determines the total amount of new KALA tokens minted as rewards for LP stakers over the interval [start time, end time].
    DistributionSchedule[] distributionSchedules;

    uint lastDistributeIndex;
    uint lastDistributed;
    uint totalWeight;

    mapping(address => uint)  assetWeights;
    address[] assetTokens;

    mapping(bytes32 => address) symbolTokenMap;

    modifier onlyOwnerOrGovernance() {
        require(config.governance == _msgSender() || _msgSender() == owner(), "Unauthorized,need governace/owner to perform.");
        _;
    }

    function initialize(
        address governance, address mint, address oracle, address staking,
        address uniswapFactory,
        address baseToken, address govToken
    ) external virtual initializer {
        __Ownable_init();
        _updateConfig(governance, mint, oracle, staking, uniswapFactory, baseToken, govToken);
        totalWeight = 32;
        genesisTime = block.timestamp;
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
        require(startTimes.length > 0, "Invalid arguments");
        require(startTimes.length == endTimes.length, "Invalid arguments");
        require(startTimes.length == amounts.length, "Invalid arguments");

        delete distributionSchedules;
        lastDistributeIndex = 0;
        for (uint i; i < startTimes.length; i++) {
            require(endTimes[i] > startTimes[i], "End time should be greater than start time");
            if (i > 0) {
                require(startTimes[i] >= endTimes[i - 1], "Time overlap");
            }
            distributionSchedules.push(DistributionSchedule(startTimes[i], endTimes[i], amounts[i]));
        }
    }


    function updateWeight(address assetToken, uint weight) override external onlyOwnerOrGovernance {
        uint originWeight = assetWeights[assetToken];

        saveWeight(assetToken, weight);

        totalWeight = totalWeight.add(weight).sub(originWeight);

        emit UpdateWeight(assetToken, weight);
    }

    //Introduces a new mAsset to the protocol and creates markets on Uniswap. This process will:
    //    1.Instantiate the mAsset contract as a new Uniswap CW20 token
    //    2.Register the mAsset with Kalata Oracle and Kalata Mint
    //    3.Create a new Uniswap Pair for the new mAsset against USD
    //    4.Instantiate the LP Token contract associated with the pool as a new Uniswap CW20 token
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
        require(block.timestamp.sub(lastDistributed) >= DISTRIBUTION_INTERVAL, "Cannot distribute Kalata Token before interval");

        uint timeElapsed = block.timestamp.sub(genesisTime);

        uint distributedAmount = 0;

        for (uint i = lastDistributeIndex; i < distributionSchedules.length; i++) {
            DistributionSchedule memory schedule = distributionSchedules[i];
            if (timeElapsed >= schedule.startTime) {
                uint timeSlot = schedule.endTime.sub(schedule.startTime);
                uint timeDuration = Math.min(timeElapsed, schedule.endTime).sub(Math.max(schedule.startTime, lastDistributed));
                uint amount = timeDuration.multiplyDecimal(schedule.amount.divideDecimal(timeSlot));
                distributedAmount = amount;
                if (lastDistributeIndex != i) {
                    lastDistributeIndex = i;
                }
                break;
            }
        }
        if (distributedAmount > 0) {
            for (uint i = 0; i < assetTokens.length; i++) {
                address token = assetTokens[i];
                uint amount = distributedAmount.multiplyDecimal(assetWeights[token]).divideDecimal(totalWeight);
                if (amount > 0) {
                    IBEP20Token(config.govToken).mint(config.staking, amount);
                    IStaking(config.staking).depositReward(config.govToken, amount);
                }
            }
        }
        lastDistributed = block.timestamp;
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
        (uint auctionDiscount, uint minCollateralRatio,) = IMint(config.mint).queryAssetConfig(assetToken);
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
        Config memory m = config;
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

        startTimes = new uint[](distributionSchedules.length);
        endTimes = new uint[](distributionSchedules.length);
        amounts = new uint[](distributionSchedules.length);

        for (uint i = 0; i < distributionSchedules.length; i++) {
            startTimes[i] = distributionSchedules[i].startTime;
            endTimes[i] = distributionSchedules[i].endTime;
            amounts[i] = distributionSchedules[i].amount;
        }
    }

    function queryWeight(address token) override external view returns (uint){
        return assetWeights[token];
    }

    function queryTotalWeight() override external view returns (uint){
        return totalWeight;
    }

    function queryToken(bytes32 symbol) override external view returns (address token){
        token = symbolTokenMap[symbol];
    }


    //////////////////////internal methods//////////////////

    function saveWeight(address assetToken, uint weight) private {
        bool exists = false;
        for (uint i = 0; i < assetTokens.length; i++) {
            if (assetTokens[i] == assetToken) {
                exists = true;
                break;
            }
        }
        if (!exists) {
            assetTokens.push(assetToken);
        }
        assetWeights[assetToken] = weight;
    }

    function removeWeight(address assetToken) private {
        delete assetWeights[assetToken];
        uint length = assetTokens.length;
        for (uint i = 0; i < length; i++) {
            if (assetTokens[i] == assetToken) {
                if (i != length - 1) {
                    assetTokens[i] = assetTokens[length - 1];
                }
                delete assetTokens[length - 1];
            }
        }
    }


    function addToken(address tokenOwner, address oracleFeeder, bytes32 name, bytes32 symbol, uint initialSupply,
        uint auctionDiscount, uint minCollateralRatio, uint weight) private {

        address assetToken = createToken(tokenOwner, name, symbol, initialSupply);
        require(assetToken != address(0), "createToken failed");

        weight = weight == 0 ? NORMAL_TOKEN_WEIGHT : weight;

        saveWeight(assetToken, weight);
        totalWeight = totalWeight.add(weight);

        IMint(config.mint).registerAsset(assetToken, auctionDiscount, minCollateralRatio);
        IOracle(config.oracle).registerAsset(assetToken, oracleFeeder);

        IUniswapV2Factory(config.uniswapFactory).createPair(config.baseToken, assetToken);

        address lpToken = IUniswapV2Factory(config.uniswapFactory).getPair(assetToken, config.baseToken);
        IStaking(config.staking).registerAsset(assetToken, lpToken);
    }


    function createToken(address tokenOwner, bytes32 name, bytes32 symbol, uint initialSupply) private returns (address addr) {
        require(symbolTokenMap[symbol] == address(0), "symbol already exists");

        bytes memory code = type(BEP20Token).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(name, symbol, block.timestamp));
        addr = code.deploy(salt);
        BEP20Token(addr).initialize(name.convertToString(), symbol.convertToString(), initialSupply);
        address[] memory minters = new address[](2);
        minters[0] = address(this);
        minters[1] = config.mint;
        BEP20Token(addr).registerMinters(minters);
        BEP20Token(addr).transferOwnership(tokenOwner);
        symbolTokenMap[symbol] = addr;
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
        config = Config(governance, mint, oracle, staking, uniswapFactory, baseToken, govToken);
    }

    function _revokeAsset(address assetToken, uint endPrice) private returns (uint weight, address feeder){
        require(assetToken != address(0), "Invalid assetToken");
        require(endPrice != 0, "Invalid endPrice");
        feeder = IOracle(config.oracle).queryFeeder(assetToken);
        require(feeder == _msgSender(), "unauthorized");
        weight = assetWeights[assetToken];
        removeWeight(assetToken);
        totalWeight = totalWeight.sub(weight);
        IMint(config.mint).registerMigration(assetToken, endPrice);
    }

}