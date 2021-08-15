pragma solidity >=0.6.0;


interface IRouter {

    event AddExtraAsset(address indexed sender, address indexed asset);
    event RemoveExtraAsset(address indexed sender, address indexed asset);

    function addExtraAsset(address asset) external;

    function removeExtraAsset(address asset) external;

}


