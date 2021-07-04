// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/IStaking.sol";
import "./libraries/SafeDecimalMath.sol";
import "./interfaces/IBEP20Token.sol";


// The Staking Contract contains the logic for LP Token staking and reward distribution.
// Staking rewards for LP stakers come from the new Kala tokens generated at each block by the Factory Contract and are split between all combined staking pools.
// The new Kala tokens are distributed in proportion to size of staked LP tokens multiplied by the weight of that asset's staking pool.
contract Staking is OwnableUpgradeable, IStaking {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    Config private _config;

    //asset => Stake
    mapping(address => AssetStake) private _stakes;

    //used for loop _stakes
    address[] private _assets;

    //staker=>assetToken=>Reward
    mapping(address => mapping(address => Reward)) private _rewards;

    //staker=>assetToken[], used for loop _rewards easily
    mapping(address => address[]) private _stakedAssets;

    modifier onlyFactoryOrOwner() {
        require(_config.factory == msg.sender || msg.sender == owner(), "Unauthorized,only Staking's owner/factory can perform");
        _;
    }

    function initialize(address factory, address govToken) override external initializer {
        __Ownable_init();
        _config.factory = factory;
        _config.govToken = govToken;
    }

    function setFactory(address factory) override external onlyOwner {
        require(factory != address(0), "Invalid parameter");
        _config.factory = factory;
        emit SetFactory(msg.sender, factory);
    }

    // Registers a new staking pool for an asset token and associates the LP token(Pair) with the staking pool.
    // assetToken: Contract address of mAsset/Kala token (staking pool identifier)
    // stakingToken: Contract address of asset's corresponding LP Token
    function registerAsset(address asset, address pair) override external onlyFactoryOrOwner {
        require(_stakes[asset].stakingToken == address(0), "Asset was already registered");
        _stakes[asset] = AssetStake({stakingToken : pair, pendingReward : 0, stakingAmount : 0, rewardIndex : 0});
        _assets.push(asset);
        emit RegisterAsset(msg.sender, asset, pair);
    }

    // Can be issued when the user sends LP Tokens to the Staking contract.
    // The LP token must be recognized by the staking pool of the specified asset token.
    function stake(address asset, uint stakingTokenAmount) override external {
        require(asset != address(0), "invalid asset token");
        require(stakingTokenAmount > 0, "invalid amount");

        AssetStake memory pool = _stakes[asset];
        require(pool.stakingToken != address(0), "unauthorized");

        Reward memory reward = _rewards[msg.sender][asset];

        reward.pendingReward = reward.pendingReward.add(reward.stakingAmount.multiplyDecimal(pool.rewardIndex.sub(reward.index)));
        reward.index = pool.rewardIndex;


        require(IBEP20Token(pool.stakingToken).transferFrom(msg.sender, address(this), stakingTokenAmount), "transferFrom fail");

        //Increase bond_amount
        pool.stakingAmount = pool.stakingAmount.add(stakingTokenAmount);
        reward.stakingAmount = reward.stakingAmount.add(stakingTokenAmount);

        //save
        _stakes[asset] = pool;

        saveReward(msg.sender, asset, reward.index, reward.stakingAmount, reward.pendingReward);

        emit Stake(msg.sender, asset, stakingTokenAmount);
    }


    /**
        Users can issue the unbond message at any time to remove their staked LP tokens from a staking position.
        assetToken: Contract address of mAsset/KALA token (staking pool identifier)
        amount: Amount of LP tokens to unbond
    */
    function unStake(address asset, uint amount) override external {
        require(amount > 0, "invalid amount");

        address sender = msg.sender;

        AssetStake memory assetStake = _stakes[asset];
        Reward memory rewardInfo = _rewards[sender][asset];
        require(assetStake.stakingToken != address(0), "unauthorized");
        require(rewardInfo.stakingAmount >= amount, "Cannot unbond more than bond amount");

        rewardInfo.pendingReward = rewardInfo.pendingReward.add(rewardInfo.stakingAmount.multiplyDecimal(assetStake.rewardIndex.sub(rewardInfo.index)));
        rewardInfo.index = assetStake.rewardIndex;

        assetStake.stakingAmount = assetStake.stakingAmount.sub(amount);
        rewardInfo.stakingAmount = rewardInfo.stakingAmount.sub(amount);

        if (rewardInfo.pendingReward == 0 && rewardInfo.stakingAmount == 0) {
            removeReward(sender, asset);
        } else {
            saveReward(sender, asset, rewardInfo.index, rewardInfo.stakingAmount, rewardInfo.pendingReward);
        }

        _stakes[asset] = assetStake;
        require(IBEP20Token(assetStake.stakingToken).transfer(msg.sender, amount), "transfer failed");

        emit UnStake(msg.sender, asset, amount);
    }


    /**
        Used by Factory Contract to deposit newly minted KALA tokens.
    **/
    function depositReward(address assetToken, uint amount) override external {
        require(_config.factory == msg.sender, "unauthorized");
        AssetStake memory assetStake = _stakes[assetToken];
        if (assetStake.stakingAmount == 0) {
            assetStake.pendingReward = assetStake.pendingReward.add(amount);
        } else {
            uint rewardPerBond = (amount.add(assetStake.pendingReward)).divideDecimal(assetStake.stakingAmount);
            assetStake.rewardIndex = assetStake.rewardIndex.add(rewardPerBond);
            assetStake.pendingReward = 0;
        }
        _stakes[assetToken] = assetStake;
        emit DepositReward(msg.sender, assetToken, amount);
    }


    /*
         Page Stake  -> Claim all rewards
         withdraw all rewards or single reward depending on asset_token
         Withdraws a user's rewards for a specific staking position.
    */
    function claim(address _assetToken) override public {
        require(_assetToken != address(0), "Invalid assetToken address");
        address staker = msg.sender;
        uint amount = withdrawReward(staker, _assetToken);
        if (amount > 0) {
            require(IBEP20Token(_config.govToken).transfer(staker, amount), "transfer failed");
        }
        emit Withdraw(msg.sender, _assetToken, amount);
    }

    function withdrawReward(address staker, address assetToken) private returns (uint){
        Reward memory reward = _rewards[staker][assetToken];
        AssetStake memory assetStake = _stakes[assetToken];
        if (reward.stakingAmount == 0) {
            removeReward(staker, assetToken);
        } else {
            saveReward(staker, assetToken, assetStake.rewardIndex, reward.stakingAmount, 0);
        }
        return reward.pendingReward.add(reward.stakingAmount.multiplyDecimal(assetStake.rewardIndex.sub(reward.index)));
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
            AssetStake memory assetStake = _stakes[assets[i]];
            pendingRewards[i] = assetStake.pendingReward;
            stakingAmounts[i] = assetStake.stakingAmount;
        }
    }


    function queryStake(address assetToken) override external view returns (address stakingToken, uint pendingReward, uint stakingAmount, uint rewardIndex) {
        require(assetToken != address(0), "Invalid assetToken address");
        AssetStake memory assetStake = _stakes[assetToken];
        stakingToken = assetStake.stakingToken;
        pendingReward = assetStake.pendingReward;
        stakingAmount = assetStake.stakingAmount;
        rewardIndex = assetStake.rewardIndex;
    }

    function queryConfig() override external view returns (address factory, address govToken){
        Config memory m = _config;
        factory = m.factory;
        govToken = m.govToken;
    }


    function queryReward(address staker, address asset) external override view returns (
        uint index,
        uint stakingAmount,
        uint pendingReward
    ){
        require(staker != address(0), "Invalid staker address");
        require(asset != address(0), "Invalid asset address");
        stakingAmount = _rewards[staker][asset].stakingAmount;
        pendingReward = _rewards[staker][asset].pendingReward;
        index = _rewards[staker][asset].index;
    }

    function queryRewards(address staker) external override view returns (
        address[] memory assets,
        uint[] memory stakingAmounts,
        uint[] memory pendingRewards
    ){
        require(staker != address(0), "Invalid staker address");
        assets = _stakedAssets[staker];
        stakingAmounts = new uint[](assets.length);
        pendingRewards = new uint[](assets.length);
        for (uint i = 0; i < assets.length; i++) {
            address asset = assets[i];
            AssetStake memory assetStake = _stakes[asset];
            Reward memory reward = _rewards[staker][asset];
            stakingAmounts[i] = reward.stakingAmount;
            pendingRewards[i] = reward.pendingReward.add(reward.stakingAmount.multiplyDecimal(assetStake.rewardIndex.sub(reward.index)));
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
            AssetStake memory assetStake = _stakes[assets[i]];
            stakingTokens[i] = assetStake.stakingToken;
            pendingRewards[i] = assetStake.pendingReward;
            stakingAmounts[i] = assetStake.stakingAmount;
            rewardIndexs[i] = assetStake.rewardIndex;
        }
    }


    ///// private methods ///


    function saveReward(address sender, address assetToken, uint _index, uint _stakingAmount, uint _pendingReward) private {
        uint exists = 0;
        for (uint i = 0; i < _stakedAssets[sender].length; i++) {
            if (_stakedAssets[sender][i] == assetToken) {
                exists = 1;
                break;
            }
        }
        if (exists == 0) {
            _stakedAssets[sender].push(assetToken);
        }

        _rewards[sender][assetToken] = Reward({index : _index, stakingAmount : _stakingAmount, pendingReward : _pendingReward});
    }

    function removeReward(address sender, address assetToken) private {
        for (uint i = 0; i < _stakedAssets[sender].length; i++) {
            if (_stakedAssets[sender][i] == assetToken) {
                for (uint j = i + 1; j < _stakedAssets[sender].length; j++) {
                    if (j == _stakedAssets[sender].length - 1) {
                        //delete last elements
                        delete _stakedAssets[sender][j];
                    } else {
                        //move forward
                        _stakedAssets[sender][j - 1] = _stakedAssets[sender][j];
                    }
                }
                break;
            }
        }
        delete _rewards[sender][assetToken];
    }

}
