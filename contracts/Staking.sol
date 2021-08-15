pragma solidity >=0.6.0;

import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "./interfaces/IStaking.sol";
import "./libraries/SafeDecimalMath.sol";
import "./interfaces/IBEP20Token.sol";
import "./interfaces/ICollateral.sol";
import "./SafeAccess.sol";

contract Staking is IStaking, SafeAccess {
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using EnumerableSet for EnumerableSet.AddressSet;

    struct StakingItem {
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
        uint lastClaimTimestamp;
    }

    address private _factory;
    address private _govToken;
    address private _collateralContract;
    address[] private _assets;

    mapping(address => StakingItem) private _stakingItems;
    mapping(address => mapping(address => UserStakingItem)) private _userStakingItems;
    mapping(address => EnumerableSet.AddressSet) private _userStakingAssets;

    mapping(address => uint) private _claimIntervals;

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



    function updateClaimIntervals(address[] memory assets, uint[] memory intervals) override external onlyOwner {
        require(assets.length == intervals.length, "Staking: UPDATE_CLAIM_INTERVAL_INVALID_PARAMS");
        for (uint i = 0; i < assets.length; i++) {
            _claimIntervals[assets[i]] = intervals[i];
        }
        emit UpdateClaimIntervals(msg.sender, assets, intervals);
    }


    function getRemaingClaimTime(address staker, address asset) private view returns (uint) {
        uint claimInterval = _claimIntervals[asset];
        uint lastClaimTimestamps = _userStakingItems[staker][asset].lastClaimTimestamp;
        uint passedTime = block.timestamp.sub(lastClaimTimestamps);
        return claimInterval <= passedTime ? 0 : claimInterval.sub(passedTime);
    }


    function initialize(address factory, address govToken, address collateralContract) external initializer {
        __Ownable_init();
        _updateConfig(factory, govToken, collateralContract);
    }

    function _updateConfig(address factory, address govToken, address collateralContract) private {
        require(
            factory != address(0) &&
            govToken != address(0) &&
            collateralContract != address(0),
            "Staking: _UPDATE_CONFIG_INVALD_PARAMETERS"
        );
        _factory = factory;
        _govToken = govToken;
        _collateralContract = collateralContract;

    }


    function registerAsset(address asset, address pair) override external onlyFactoryOrOwner {
        require(_stakingItems[asset].registerTimestamp == 0, "Asset was already registered");
        _stakingItems[asset] = StakingItem({stakingToken : pair, pendingReward : 0, stakingAmount : 0, rewardIndex : 0, registerTimestamp : block.timestamp});
        _assets.push(asset);
        emit RegisterAsset(msg.sender, asset, pair);
    }


    function stake(address asset, uint stakingAmount) override external  {
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
        userStakingItem.lastClaimTimestamp = block.timestamp;

        _stakingItems[asset] = item;
        _userStakingAssets[staker].add(asset);
        _userStakingItems[staker][asset] = userStakingItem;

        emit Stake(msg.sender, asset, stakingAmount);
    }


    function unStake(address asset, uint amount) override external  {
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


    function claim(address asset) override public  {
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
        userStakingItem.index = stakingItem.rewardIndex;
        userStakingItem.lastClaimTimestamp = block.timestamp;
        updateUserStakingItem(staker, asset, userStakingItem);
        emit Withdraw(msg.sender, asset, amount);
    }
}
