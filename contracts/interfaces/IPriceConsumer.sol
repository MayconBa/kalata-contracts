pragma solidity >=0.6.0;

interface IPriceConsumer {
    function queryPrice(address asset) external view returns (
        uint price,
        uint lastUpdatedTime
    );
}


