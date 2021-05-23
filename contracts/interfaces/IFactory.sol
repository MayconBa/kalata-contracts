// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

//The Factory contract is Kalata Protocol's central directory and
///organizes information related to mAssets and the Kalata Token (KALA).
///It is also responsible for minting new KALA tokens each block and
///distributing them to the Staking Contract for rewarding LP Token stakers.

///After the initial bootstrapping of Kalata Protocol contracts,
///the Factory is assigned to be the owner for the Mint, Oracle, Staking,
///and Collector contracts. The Factory is owned by the Governance Contract.
interface IFactory {

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

    struct Config {
        //Governance Contract
        address governance;

        //Contract address of Kalata Mint
        address mint;

        //Contract address of Kalata Oracle
        address oracle;

        //Contract address of Kalata Staking
        address staking;

        //Contract address of Uniswap Factory
        address uniswapFactory;


        address baseToken;

        //Contract address of Kalata Token (KALA)
        address govToken;
    }


    struct Params {
        uint auctionDiscount;
        // Minium collateral ratio applied to asset mint
        uint minCollateralRatio;
        // Distribution weight (default is 30, which is 1/10 of KALA distribution weight)
        uint weight;
    }


    function updateConfig(
        address governance, address mint, address oracle, address staking,
        address uniswapFactory,
        address baseToken, address govToken
    ) external;


    function updateDistributionSchedules(uint[] calldata startTimes, uint[] calldata endTimes, uint[] calldata amounts) external;

    function updateWeight(address assetToken, uint weight) external;


    /// Whitelisting process
    /// 1. Create asset token contract with `config.token_code_id` with `minter` argument
    /// 2. Call `TokenCreationHook`
    ///    2-1. Initialize distribution info
    ///    2-2. Register asset to mint contract
    ///    2-3. Register asset and oracle feeder to oracle contract
    ///    2-4. Create uniswap pair through uniswap factory
    /// 3. Call `UniswapCreationHook`
    ///    3-1. Register asset to staking contract
    function whitelist(bytes32 name, bytes32 symbol, address oracleFeeder,
        uint auctionDiscount, uint minCollateralRatio, uint weight) external;



    /// Distribute
    /// Anyone can execute distribute operation to distribute
    /// kalata inflation rewards on the staking pool
    /// Mints the appropriate amount of new KALA tokens as reward for LP stakers
    /// by sends the newly minted tokens to the Kalata Staking contract to be distributed to its stakers.
    /// Can be called by anyone at any time to trigger block reward distribution for LP stakers.
    /// The contract keeps track of the last height at which Distribute was called for a specific asset,
    /// and uses it to calculate the amount of new assets to mint for the blocks occurred in the interval between.
    function distribute() external;

    //uint public interestRate = (5 * SafeDecimalMath.unit()) / 100;
    function revokeAsset(address assetToken, uint endPrice) external;

    ///Can be issued by the oracle feeder of an mAsset to trigger the mAsset migration procedure.
    function migrateAsset(bytes32 name, bytes32 symbol, address assetToken, uint endPrice) external;

    function queryConfig() external view returns (
        address governance,
        address mint,
        address oracle,
        address staking,
        address uniswapFactory,
        address baseToken,
        address govToken
    );

    //Add this method beside queryConfig, because too many variables are not allowed in solidity
    function queryDistributionSchedules() external view returns (
    //    //seconds
        uint[] memory startTimes,
    //    //seconds
        uint[] memory endTimes,
    //    //distribution amount for the interval
        uint[] memory amounts);

    function queryWeight(address token) external view returns (uint);

    function queryAllAssetWeights() external view returns (address[] memory assets, uint[] memory weights);

    function queryTotalWeight() external view returns (uint);

    function queryToken(bytes32 symbol) external view returns (address token);

    function queryAssets() external view returns (
        bytes32[] memory names,
        bytes32[] memory symbols,
        address[] memory addresses,
        address[] memory busdPairAddresses
    );

    event RevokeAsset(address assetToken, uint endPrice);
    event Distribute(uint distributedAmount);
    event UpdateConfig(address governance, uint[] scheduleStartTime, uint[] scheduleEndTime, uint[] scheduleAmounts);
    event UpdateWeight(address assetToken, uint weight);
    event TokenCreated(bytes32 name, bytes32 symbol, uint initialSupply, address token);
    event MigrateAsset(uint endPrice, address assetToken);
}


