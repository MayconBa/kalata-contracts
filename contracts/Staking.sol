// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "./interfaces/IStaking.sol";
import "./libraries/SafeDecimalMath.sol";
import "./interfaces/IBEP20Token.sol";
import "./interfaces/ICollateral.sol";

contract Staking is OwnableUpgradeable, IStaking {
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using EnumerableSet for EnumerableSet.AddressSet;

    event UpdateConfig(address indexed sender, address factory, address govToken, address collateralContract);
    event RegisterAsset(address indexed sender, address indexed asset, address indexed stakingToken);
    event Stake(address indexed sender, address indexed asset, uint stakingTokenAmount);
    event DepositReward(address indexed sender, address indexed asset, uint amounts);
    event DepositRewards(address indexed sender, address[] assets, uint[] amounts);
    event Withdraw(address indexed sender, address indexed asset, uint amount);
    event UnStake(address indexed sender, address indexed asset, uint amount);
    event UpdateClaimIntervals(address indexed sender, address[] assets, uint[] intervals);
    event SetLockable(address indexed sender, address asset, bool lockable);
    event UpdateCollateralAssetMapping(address indexed sender, address[] assets, address[] collateralAssets);

    struct StakingItem {
        // stakingToken can be:
        //  1. zero address, meaning single asset minting
        //  2. pair address, meaning lp minting
        address stakingToken;
        uint pendingReward;
        uint stakingAmount;
        uint rewardIndex;
        uint registerTimestamp;
    }

    struct UserStakingItem {
        uint index;
        uint stakingAmount;
        uint pendingReward;
    }

    address private _factory;
    address private _govToken;
    address private _collateralContract;
    address[] private _assets;

    mapping(address => StakingItem) private _stakingItems;
    mapping(address => mapping(address => UserStakingItem)) private _userStakingItems;
    mapping(address => EnumerableSet.AddressSet) private _userStakingAssets;

    // asset => interval (seconds)
    mapping(address => uint) private _claimIntervals;

    // user => ( asset=> lastClaimTimestamp)
    mapping(address => mapping(address => uint)) private _userLastClaimTimestamps;


    //asset => Collateral asset mapping
    mapping(address => address) private _collateralAssetMapping;
    address[] private _lockableAssets;


    modifier onlyFactoryOrOwner() {
        require(_factory == msg.sender || msg.sender == owner(), "Staking: UNAUTHORIZED");
        _;
    }


    function updateCollateralAssetMapping(address[] memory assets, address[] memory collateralAssets) override external onlyOwner {
        require(assets.length == collateralAssets.length, "Staking: UPDATE_COLLATERAL_ASSET_MAPPING_INVALID_PARAMS");
        _lockableAssets = assets;
        for (uint i = 0; i < assets.length; i++) {
            _collateralAssetMapping[assets[i]] = collateralAssets[i];
        }
        emit UpdateCollateralAssetMapping(msg.sender, assets, collateralAssets);
    }

    function queryCollateralAssetMapping() override external view returns (address[] memory assets, address[] memory collateralAssets) {
        assets = _lockableAssets;
        collateralAssets = new address[](assets.length);
        for (uint i = 0; i < assets.length; i++) {
            collateralAssets[i] = _collateralAssetMapping[assets[i]];
        }
    }


    function updateClaimIntervals(address[] memory assets, uint[] memory intervals) override external onlyOwner {
        require(assets.length == intervals.length, "Staking: UPDATE_CLAIM_INTERVAL_INVALID_PARAMS");
        for (uint i = 0; i < assets.length; i++) {
            _claimIntervals[assets[i]] = intervals[i];
        }
        emit UpdateClaimIntervals(msg.sender, assets, intervals);
    }

    function queryClaimIntervals() override external view returns (address[] memory assets, uint[] memory intervals) {
        assets = _assets;
        intervals = new uint[](assets.length);
        for (uint i = 0; i < assets.length; i++) {
            intervals[i] = _claimIntervals[assets[i]];
        }
    }

    function getRemaingClaimTime(address staker, address asset) private view returns (uint) {
        uint claimInterval = _claimIntervals[asset];
        uint lastClaimTimestamps = _userLastClaimTimestamps[staker][asset];
        uint passedTime = block.timestamp.sub(lastClaimTimestamps);
        return claimInterval <= passedTime ? 0 : claimInterval.sub(passedTime);
    }

    function queryRemaingClaimTimes(address staker) override external view returns (address[] memory assets, uint[] memory remaingClaimTimes) {
        assets = _assets;
        remaingClaimTimes = new uint[](assets.length);
        for (uint i = 0; i < assets.length; i++) {
            remaingClaimTimes[i] = getRemaingClaimTime(staker, assets[i]);
        }
    }

    function initialize(address factory, address govToken, address collateralContract) external initializer {
        __Ownable_init();
        _updateConfig(factory, govToken, collateralContract);
    }

    function _updateConfig(address factory, address govToken, address collateralContract) private {
        _factory = factory;
        _govToken = govToken;
        _collateralContract = collateralContract;
        emit UpdateConfig(msg.sender, factory, govToken, collateralContract);
    }

    function setFactory(address factory) override external onlyOwner {
        require(factory != address(0), "Invalid parameter");
        _factory = factory;
    }

    function updateConfig(address factory, address govToken, address collateralContract) override external onlyOwner {
        _updateConfig(factory, govToken, collateralContract);
    }

    // Registers a new staking pool for an asset token and associates the LP token(Pair) with the staking pool.
    // assetToken: Contract address of mAsset/Kala token (staking pool identifier)
    // stakingToken: pair token or address(0)
    function registerAsset(address asset, address pair) override external onlyFactoryOrOwner {
        require(_stakingItems[asset].registerTimestamp == 0, "Asset was already registered");
        _stakingItems[asset] = StakingItem({stakingToken : pair, pendingReward : 0, stakingAmount : 0, rewardIndex : 0, registerTimestamp : block.timestamp});
        _assets.push(asset);
        emit RegisterAsset(msg.sender, asset, pair);
    }

    // Can be issued when the user sends LP Tokens to the Staking contract.
    // The LP token must be recognized by the staking pool of the specified asset token.
    function stake(address asset, uint stakingAmount) override external {
        require(asset != address(0), "Staking: invalid asset token");
        require(stakingAmount > 0, "invalid amount");

        address staker = msg.sender;
        StakingItem memory item = _stakingItems[asset];
        require(item.registerTimestamp != 0, "unauthorized");

        UserStakingItem memory userStakingItem = _userStakingItems[staker][asset];

        userStakingItem.pendingReward = userStakingItem.pendingReward.add(userStakingItem.stakingAmount.multiplyDecimal(item.rewardIndex.sub(userStakingItem.index)));
        userStakingItem.index = item.rewardIndex;

        address tokenAddress = item.stakingToken == address(0) ? asset : item.stakingToken;
        require(IBEP20Token(tokenAddress).transferFrom(staker, address(this), stakingAmount), "transferFrom fail");

        item.stakingAmount = item.stakingAmount.add(stakingAmount);
        userStakingItem.stakingAmount = userStakingItem.stakingAmount.add(stakingAmount);

        _stakingItems[asset] = item;
        _userStakingAssets[staker].add(asset);
        _userStakingItems[staker][asset] = userStakingItem;
        _userLastClaimTimestamps[staker][asset] = block.timestamp;
        emit Stake(msg.sender, asset, stakingAmount);
    }


    function unStake(address asset, uint amount) override external {
        require(amount > 0, "invalid amount");
        address staker = msg.sender;
        StakingItem memory item = _stakingItems[asset];

        UserStakingItem memory userStakingItem = _userStakingItems[staker][asset];
        require(item.registerTimestamp != 0, "Staking: UNSTAKE_UNAUTHORIZED");
        require(userStakingItem.stakingAmount >= amount, "Cannot unbond more than bond amount");

        userStakingItem.pendingReward = userStakingItem.pendingReward.add(userStakingItem.stakingAmount.multiplyDecimal(item.rewardIndex.sub(userStakingItem.index)));
        userStakingItem.index = item.rewardIndex;

        item.stakingAmount = item.stakingAmount.sub(amount);
        userStakingItem.stakingAmount = userStakingItem.stakingAmount.sub(amount);

        updateUserStakingItem(staker, asset, userStakingItem);
        _stakingItems[asset] = item;

        address tokenAddress = item.stakingToken == address(0) ? asset : item.stakingToken;
        require(IBEP20Token(tokenAddress).transfer(msg.sender, amount), "transfer failed");

        emit UnStake(msg.sender, asset, amount);
    }

    function updateUserStakingItem(address staker, address asset, UserStakingItem memory userStakingItem) private {
        if (userStakingItem.pendingReward == 0 && userStakingItem.stakingAmount == 0) {
            _userStakingAssets[staker].remove(asset);
            delete _userStakingItems[staker][asset];
        } else {
            _userStakingItems[staker][asset] = userStakingItem;
        }
    }


    //Used by Factory Contract to deposit newly minted KALA tokens.
    function depositReward(address asset, uint amount) override external onlyFactoryOrOwner {
        _depositReward(asset, amount);
        emit DepositReward(msg.sender, asset, amount);
    }

    function _depositReward(address asset, uint amount) private {
        require(asset != address(0) && amount > 0, "Staking: DEPOSIT_REWARD_INVALID_PARAMETERS");
        StakingItem memory item = _stakingItems[asset];
        require(item.registerTimestamp > 0, "Staking: DEPOSIT_REWARD_ASSET_NOT_REGISTERED");
        if (item.stakingAmount == 0) {
            item.pendingReward = amount.add(item.pendingReward);
        } else {
            uint rewardPerBond = amount.add(item.pendingReward).divideDecimal(item.stakingAmount);
            item.rewardIndex = rewardPerBond.add(item.rewardIndex);
            item.pendingReward = 0;
        }
        _stakingItems[asset] = item;
    }


    function depositRewards(address[] memory assets, uint[] memory amounts) override external onlyFactoryOrOwner {
        require(assets.length == amounts.length, "Staking: DEPOSIT_REWARDS_INVALID_PARAMETERS");
        for (uint i = 0; i < assets.length; i++) {
            _depositReward(assets[i], amounts[i]);
        }
        emit DepositRewards(msg.sender, assets, amounts);
    }


    function claim(address asset) override public {
        require(asset != address(0), "Staking: CLAIM_INVALID_ASSET_TOKEN");
        address staker = msg.sender;
        require(getRemaingClaimTime(staker, asset) == 0, "Staking: CLAIM_INVALID_REMAING_CLAIM_TIME");
        UserStakingItem memory userStakingItem = _userStakingItems[staker][asset];
        StakingItem memory stakingItem = _stakingItems[asset];

        uint pendingRewardAmount = userStakingItem.pendingReward.add(userStakingItem.stakingAmount.multiplyDecimal(stakingItem.rewardIndex.sub(userStakingItem.index)));

        address collateralAsset = _collateralAssetMapping[asset];
        bool lockable = collateralAsset != address(0);
        uint unlockedAmount = lockable ? ICollateral(_collateralContract).queryUnlockedAmount(staker, collateralAsset) : type(uint).max;
        uint amount = pendingRewardAmount < unlockedAmount ? pendingRewardAmount : unlockedAmount;

        require(amount > 0, "Staking: CLAIM_NOTHING_TO_CLAIM");

        require(IBEP20Token(_govToken).transfer(staker, amount), "Staking: CLAIM_TRANSFER_FAILED");
        if (lockable) {
            ICollateral(_collateralContract).reduceUnlockedAmount(staker, collateralAsset, amount);
        }

        userStakingItem.pendingReward = pendingRewardAmount > amount ? pendingRewardAmount.sub(amount) : 0;
        updateUserStakingItem(staker, asset, userStakingItem);

        _userLastClaimTimestamps[staker][asset] = block.timestamp;
        emit Withdraw(msg.sender, asset, amount);
    }


    function queryStakes() override external view returns (
        address[] memory assets,
        uint[] memory pendingRewards,
        uint[] memory stakingAmounts
    ) {
        assets = _assets;
        pendingRewards = new uint[](assets.length);
        stakingAmounts = new uint[](assets.length);
        for (uint i = 0; i < assets.length; i++) {
            StakingItem memory item = _stakingItems[assets[i]];
            pendingRewards[i] = item.pendingReward;
            stakingAmounts[i] = item.stakingAmount;
        }
    }


    function queryStake(address assetToken) override external view returns (
        address stakingToken, uint pendingReward, uint stakingAmount, uint rewardIndex, uint registerTimestamp
    ) {
        require(assetToken != address(0), "Invalid assetToken address");
        StakingItem memory item = _stakingItems[assetToken];
        stakingToken = item.stakingToken;
        pendingReward = item.pendingReward;
        stakingAmount = item.stakingAmount;
        rewardIndex = item.rewardIndex;
        registerTimestamp = item.registerTimestamp;
    }

    function queryConfig() override external view returns (address factory, address govToken, address collateralContract){
        factory = _factory;
        govToken = _govToken;
        collateralContract = _collateralContract;
    }


    function queryUserStakingItem(address staker, address asset) external override view returns (
        uint index,
        uint stakingAmount,
        uint pendingReward,
        uint indexReward,
        uint claimableReward
    ){
        StakingItem memory item = _stakingItems[asset];
        UserStakingItem memory userStakingItem = _userStakingItems[staker][asset];
        index = userStakingItem.index;
        stakingAmount = userStakingItem.stakingAmount;
        pendingReward = userStakingItem.pendingReward;
        indexReward = stakingAmount.multiplyDecimal(item.rewardIndex.sub(userStakingItem.index));
        claimableReward = pendingReward.add(indexReward);
        if (_collateralAssetMapping[asset] != address(0)) {
            uint unlockedAmount = ICollateral(_collateralContract).queryUnlockedAmount(staker, _collateralAssetMapping[asset]);
            if (claimableReward > unlockedAmount) {
                claimableReward = unlockedAmount;
            }
        }
    }

    function queryRewards(address staker) external override view returns (
        address[] memory assets,
        uint[] memory stakingAmounts,
        uint[] memory pendingRewards,
        uint[] memory claimableRewards
    ){
        require(staker != address(0), "Invalid staker address");
        assets = new address[](_userStakingAssets[staker].length());
        stakingAmounts = new uint[](assets.length);
        pendingRewards = new uint[](assets.length);
        claimableRewards = new uint[](assets.length);
        for (uint i = 0; i < assets.length; i++) {
            address asset = _userStakingAssets[staker].at(i);
            assets[i] = asset;
            StakingItem memory item = _stakingItems[asset];
            UserStakingItem memory userStakingItem = _userStakingItems[staker][asset];
            stakingAmounts[i] = userStakingItem.stakingAmount;
            uint pendingReward = userStakingItem.pendingReward.add(userStakingItem.stakingAmount.multiplyDecimal(item.rewardIndex.sub(userStakingItem.index)));
            pendingRewards[i] = pendingReward;
            if (_collateralAssetMapping[asset] != address(0)) {
                uint unlockedAmount = ICollateral(_collateralContract).queryUnlockedAmount(staker, _collateralAssetMapping[asset]);
                claimableRewards[i] = pendingReward < unlockedAmount ? pendingReward : unlockedAmount;
            } else {
                claimableRewards[i] = pendingReward;
            }
        }
    }


    function queryAllAssets() override external view returns (
        address[] memory assets,
        address[] memory stakingTokens,
        uint[] memory pendingRewards,
        uint[] memory stakingAmounts,
        uint[] memory rewardIndexs)
    {
        assets = _assets;
        stakingTokens = new address[](assets.length);
        pendingRewards = new uint[](assets.length);
        stakingAmounts = new uint[](assets.length);
        rewardIndexs = new uint[](assets.length);
        for (uint i = 0; i < assets.length; i++) {
            StakingItem memory item = _stakingItems[assets[i]];
            stakingTokens[i] = item.stakingToken;
            pendingRewards[i] = item.pendingReward;
            stakingAmounts[i] = item.stakingAmount;
            rewardIndexs[i] = item.rewardIndex;
        }
    }

}
