pragma solidity >=0.6.0;

interface ICollateral {

    event Deposit(address indexed sender, address indexed asset, uint amount);
    event Withdraw(address indexed sender, address indexed asset, uint amount);

    event ReduceUnlockedAmount(address indexed depositor, address indexed asset, uint unlockedAmount);

    function deposit(address asset, uint amount) external;

    function withdraw(address asset, uint amount) external;

    function reduceUnlockedAmount(address depositor, address asset, uint unlockedAmount) external;

}


