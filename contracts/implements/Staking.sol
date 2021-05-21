// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;


import "hardhat/console.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../interfaces/IStaking.sol";
import "../libraries/SafeDecimalMath.sol";
import "../interfaces/IBEP20Token.sol";


// The Staking Contract contains the logic for LP Token staking and reward distribution.
// Staking rewards for LP stakers come from the new Kala tokens generated at each block by the Factory Contract and are split between all combined staking pools.
// The new Kala tokens are distributed in proportion to size of staked LP tokens multiplied by the weight of that asset's staking pool.
contract Staking is OwnableUpgradeable, IStaking {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    Config _config;

    //asset => Stake
    mapping(address => AssetStake) _stakes;

    //used for loop _stakes
    address[] _assets;

    //staker=>assetToken=>Reward
    mapping(address => mapping(address => Reward)) _rewards;

    //staker=>assetToken[], used for loop _rewards easily
    mapping(address => address[]) _stakedAssets;




    modifier onlyFactoryOrOwner() {
        require(_config.factory == msg.sender || msg.sender == owner(), "Unauthorized,only Staking's owner/factory can perform");
        _;
    }

    function initialize(address factory, address govToken) override external virtual initializer {
        __Ownable_init();
        _config.factory = factory;
        _config.govToken = govToken;
    }


    function setFactory(address factory) override external onlyOwner {
        require(factory != address(0), "Invalid parameter");
        _config.factory = factory;
    }

    // Registers a new staking pool for an asset token and associates the LP token(Pair) with the staking pool.
    // assetToken: Contract address of mAsset/Kala token (staking pool identifier)
    // stakingToken: Contract address of asset's corresponding LP Token
    function registerAsset(address asset, address pair) override external onlyFactoryOrOwner {
        require(_stakes[asset].stakingToken == address(0), "Asset was already registered");
        _stakes[asset] = AssetStake({stakingToken : pair, pendingReward : 0, stakingAmount : 0, rewardIndex : 0});
        _assets.push(asset);
        emit RegisterAsset(asset, pair);
    }

    // Can be issued when the user sends LP Tokens to the Staking contract.
    // The LP token must be recognized by the staking pool of the specified asset token.
    function stake(address asset, uint amount) override external {
        require(asset != address(0), "invalid asset token");
        require(amount > 0, "invalid amount");

        AssetStake memory pool = _stakes[asset];
        require(pool.stakingToken != address(0), "unauthorized");

        Reward memory reward = _rewards[msg.sender][asset];

        reward.index = pool.rewardIndex;
        reward.pendingReward = reward.pendingReward.add(reward.stakingAmount.multiplyDecimal(pool.rewardIndex.sub(reward.index)));

        require(IBEP20Token(pool.stakingToken).transferFrom(msg.sender, address(this), amount), "transferFrom fail");

        //Increase bond_amount
        pool.stakingAmount = pool.stakingAmount.add(amount);
        reward.stakingAmount = reward.stakingAmount.add(amount);

        //save
        _stakes[asset] = pool;

        saveReward(msg.sender, asset, reward.index, reward.stakingAmount, reward.pendingReward);

        emit Bond(asset, amount);
    }



    /**
        Users can issue the unbond message at any time to remove their staked LP tokens from a staking position.
        assetToken: Contract address of mAsset/KALA token (staking pool identifier)
        amount: Amount of LP tokens to unbond
    */
    function unStake(address asset, uint amount) override external {
        require(amount > 0, "invalid amount");

        address sender = msg.sender;

        AssetStake memory stakingPool = _stakes[asset];
        Reward memory rewardInfo = _rewards[sender][asset];
        require(stakingPool.stakingToken != address(0), "unauthorized");
        require(rewardInfo.stakingAmount >= amount, "Cannot unbond more than bond amount");

        rewardInfo.index = stakingPool.rewardIndex;
        rewardInfo.pendingReward = rewardInfo.pendingReward.add(rewardInfo.stakingAmount.multiplyDecimal(stakingPool.rewardIndex.sub(rewardInfo.index)));

        stakingPool.stakingAmount = stakingPool.stakingAmount.sub(amount);
        rewardInfo.stakingAmount = rewardInfo.stakingAmount.sub(amount);

        if (rewardInfo.pendingReward == 0 && rewardInfo.stakingAmount == 0) {
            removeReward(sender, asset);
        } else {
            saveReward(sender, asset, rewardInfo.index, rewardInfo.stakingAmount, rewardInfo.pendingReward);
        }

        _stakes[asset] = stakingPool;
        IBEP20Token(stakingPool.stakingToken).transfer(msg.sender, amount);

        emit UnBond(asset, amount);
    }


    /**
        Can be issued when the user sends KALA tokens to the Staking contract,
        which will be used as rewards for the specified asset's staking pool.
        Used by Factory Contract to deposit newly minted KALA tokens.
    **/
    function depositReward(address assetToken, uint amount) override external {
        //require(config.govToken == msg.sender, "unauthorized");
        AssetStake memory stakingPool = _stakes[assetToken];
        if (stakingPool.stakingAmount == 0) {
            stakingPool.pendingReward = stakingPool.pendingReward.add(amount);
        } else {
            uint rewardPerBond = (amount.add(stakingPool.pendingReward)).divideDecimal(stakingPool.stakingAmount);
            stakingPool.rewardIndex = stakingPool.rewardIndex.add(rewardPerBond);
            stakingPool.pendingReward = 0;
        }
        _stakes[assetToken] = stakingPool;
    }


    /*
         Page Stake  -> Claim all rewards
         withdraw all rewards or single reward depending on asset_token
         Withdraws a user's rewards for a specific staking position.
    */
    function claim(address _assetToken) override public {
        require(_assetToken != address(0), "Invalid assetToken address");
        address staker = msg.sender;
        Reward memory reward = _rewards[staker][_assetToken];
        uint amount = withdrawReward(staker, _assetToken, reward.index, reward.stakingAmount, reward.pendingReward);
        if (amount > 0) {
            IBEP20Token(_config.govToken).transfer(staker, amount);
        }
        emit Withdraw(_assetToken, staker, amount);
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
        AssetStake memory stakingPool = _stakes[assetToken];
        stakingToken = stakingPool.stakingToken;
        pendingReward = stakingPool.pendingReward;
        stakingAmount = stakingPool.stakingAmount;
        rewardIndex = stakingPool.rewardIndex;
    }

    function queryConfig() override external view returns (address factory, address govToken){
        Config memory m = _config;
        factory = m.factory;
        govToken = m.govToken;
    }


    function queryReward(address staker, address asset) external override view returns (
        uint stakingAmount,
        uint pendingReward){
        require(staker != address(0), "Invalid staker address");
        require(asset != address(0), "Invalid asset address");
        stakingAmount = _rewards[staker][asset].stakingAmount;
        pendingReward = _rewards[staker][asset].pendingReward;
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
            stakingAmounts[i] = _rewards[staker][assets[i]].stakingAmount;
            pendingRewards[i] = _rewards[staker][assets[i]].pendingReward;
        }
    }



    ///// private methods ///

    function withdrawReward(address sender, address assetToken, uint rewardIndex, uint rewardBondAmount, uint rewardPendingReward) private returns (uint){
        AssetStake memory stakingPool = _stakes[assetToken];
        if (rewardBondAmount == 0) {
            removeReward(sender, assetToken);
        } else {
            saveReward(sender, assetToken, stakingPool.rewardIndex, rewardBondAmount, 0);
        }
        return rewardPendingReward.add(rewardBondAmount.multiplyDecimal(stakingPool.rewardIndex.sub(rewardIndex)));
    }

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
