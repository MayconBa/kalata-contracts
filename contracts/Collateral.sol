// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "./interfaces/ICollateral.sol";
import "./libraries/SafeDecimalMath.sol";
import "./interfaces/IBEP20Token.sol";
import "./SafeAccess.sol";

contract Collateral is OwnableUpgradeable, ReentrancyGuardUpgradeable, ICollateral, SafeAccess {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    struct DepositItem {
        uint amount;
        uint blockNumber;
    }

    // user => asset=> DepositItem
    mapping(address => mapping(address => DepositItem)) private _depositItems;

    // user => asset => unlocked amount
    mapping(address => mapping(address => uint)) private _unlockedAmounts;

    // asset => unlock speed
    mapping(address => uint) private _unlockSpeeds;

    address[] private _assets;

    address private _stakingContract;


    function initialize() external initializer {
        __Ownable_init();
    }


    function updateConfig(address stakingContract, address[] memory assets, uint[] memory unlockSpeeds) override external onlyOwner {
        _updateConfig(stakingContract, assets, unlockSpeeds);
    }


    function queryConfig() override external view returns (address stakingContract, address[] memory assets, uint[] memory unlockSpeeds) {
        stakingContract = _stakingContract;
        assets = _assets;
        unlockSpeeds = new uint[](assets.length);
        for (uint i = 0; i < assets.length; i++) {
            unlockSpeeds[i] = _unlockSpeeds[assets[i]];
        }
    }


    function _updateConfig(address stakingContract, address[] memory assets, uint[] memory unlockSpeeds) private {
        require(assets.length == unlockSpeeds.length && stakingContract != address(0), "Collateral: UPDATE_CONFIG_INVALID_PARAMS");
        _assets = assets;
        _stakingContract = stakingContract;
        for (uint i = 0; i < assets.length; i++) {
            _unlockSpeeds[assets[i]] = unlockSpeeds[i];
        }
        emit UpdateConfig(msg.sender, stakingContract, assets, unlockSpeeds);
    }

    // asset.approve(Collateral.address,amount)
    function deposit(address asset, uint amount) override external nonReentrant nonContractAccess {
        require(amount > 0 && asset != address(0) && _unlockSpeeds[asset] > 0, "Collateral: DEPOSIT_INVALID_PARAMS");
        address depositor = msg.sender;
        require(IBEP20Token(asset).transferFrom(depositor, address(this), amount), "Collateral: TRANSFER_FROM_FAIL");
        collect(depositor, asset, _depositItems[depositor][asset], int(amount));

        emit Deposit(depositor, asset, amount);
    }

    function withdraw(address asset, uint amount) override external nonReentrant nonContractAccess {
        require(amount > 0 && asset != address(0) && _unlockSpeeds[asset] > 0, "Collateral: WITHDRAW_INVALID_PARAMS");
        address depositor = msg.sender;
        DepositItem memory item = _depositItems[depositor][asset];
        require(item.amount >= amount, "Collateral: INVALD_WITHDRAW_AMOUNT");
        require(IBEP20Token(asset).transfer(depositor, amount), "Collateral: TRANSFER_FAIL");
        collect(depositor, asset, item, - int(amount));
        emit Withdraw(depositor, asset, amount);
    }

    function queryDeposit(address depositor, address asset) override external view returns (uint amount, uint blockNumber){
        DepositItem memory item = _depositItems[depositor][asset];
        amount = item.amount;
        blockNumber = item.blockNumber;

    }

    function queryUnlockedAmount(address depositor, address asset) override external view returns (uint){
        DepositItem memory item = _depositItems[depositor][asset];
        return _unlockedAmounts[depositor][asset].add(calculatePendingUnlockedAmount(asset, item));
    }


    function reduceUnlockedAmount(address depositor, address asset, uint unlockedAmount) override external {
        require(msg.sender == _stakingContract || msg.sender == owner(), "Collateral: REDUCE_UNLOCKED_AMOUNT_INSUFFICIENT_ONLY_STAKING_OR_OWNER");
        collect(depositor, asset, _depositItems[depositor][asset], 0);

        uint userUnlockedAmount = _unlockedAmounts[depositor][asset];
        require(userUnlockedAmount >= unlockedAmount, "Collateral: REDUCE_UNLOCKED_AMOUNT_INVALID_REDUCE_UNLOCKED_AMOUNT");
        userUnlockedAmount = userUnlockedAmount.sub(unlockedAmount);

        if (userUnlockedAmount > 0) {
            _unlockedAmounts[depositor][asset] = userUnlockedAmount;
        } else {
            delete _unlockedAmounts[depositor][asset];
        }
        emit ReduceUnlockedAmount(depositor, asset, unlockedAmount);
    }


    function collect(address depositor, address asset, DepositItem memory item, int amount) private {
        if (item.amount > 0) {
            _unlockedAmounts[depositor][asset] = _unlockedAmounts[depositor][asset].add(calculatePendingUnlockedAmount(asset, item));
        }
        if (amount != 0) {
            item.amount = amount > 0 ? item.amount.add(uint(amount)) : item.amount.sub(uint(- amount));
        }
        if (item.amount == 0) {
            delete _depositItems[depositor][asset];
        } else {
            item.blockNumber = block.number;
            _depositItems[depositor][asset] = item;
        }

    }

    function calculatePendingUnlockedAmount(address asset, DepositItem memory item) view private returns (uint) {
        return _unlockSpeeds[asset].multiplyDecimal(item.amount).mul(block.number.sub(item.blockNumber));
    }

}
