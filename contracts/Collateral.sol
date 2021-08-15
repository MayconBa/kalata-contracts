pragma solidity >=0.6.0;


import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "./interfaces/ICollateral.sol";
import "./libraries/SafeDecimalMath.sol";
import "./interfaces/IBEP20Token.sol";
import "./SafeAccess.sol";

contract Collateral is ReentrancyGuardUpgradeable, ICollateral {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    struct DepositItem {
        uint amount;
        uint blockNumber;
    }

    mapping(address => mapping(address => DepositItem)) private _depositItems;
    mapping(address => mapping(address => uint)) private _unlockedAmounts;
    mapping(address => uint) private _unlockSpeeds;
    address[] private _assets;
    address private _stakingContract;

    function initialize() external initializer {
        __Ownable_init();
    }

    function deposit(address asset, uint amount) override external nonReentrant  {
        require(amount > 0 && asset != address(0) && _unlockSpeeds[asset] > 0, "Collateral: DEPOSIT_INVALID_PARAMS");
        address depositor = msg.sender;
        require(IBEP20Token(asset).transferFrom(depositor, address(this), amount), "Collateral: TRANSFER_FROM_FAIL");
        collect(depositor, asset, _depositItems[depositor][asset], int(amount));

        emit Deposit(depositor, asset, amount);
    }

    function withdraw(address asset, uint amount) override external nonReentrant  {
        require(amount > 0 && asset != address(0) && _unlockSpeeds[asset] > 0, "Collateral: WITHDRAW_INVALID_PARAMS");
        address depositor = msg.sender;
        DepositItem memory item = _depositItems[depositor][asset];
        require(item.amount >= amount, "Collateral: INVALD_WITHDRAW_AMOUNT");
        require(IBEP20Token(asset).transfer(depositor, amount), "Collateral: TRANSFER_FAIL");
        collect(depositor, asset, item, - int(amount));
        emit Withdraw(depositor, asset, amount);
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
