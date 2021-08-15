pragma solidity >=0.6.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "./interfaces/IOracle.sol";
import "./libraries/String.sol";
import "./libraries/SafeDecimalMath.sol";
import "./interfaces/IPriceConsumer.sol";

contract Oracle is OwnableUpgradeable, IOracle {
    using EnumerableSet for EnumerableSet.AddressSet;

    EnumerableSet.AddressSet private _priceConsumers;
    EnumerableSet.AddressSet private _assets;

    function initialize(address[] memory consumers) external initializer {
        __Ownable_init();
        _registerPriceConsumers(consumers);
    }

    function registerPriceConsumers(address[] memory consumers) public onlyOwner {
        _registerPriceConsumers(consumers);
    }

    function _registerPriceConsumers(address[] memory consumers) private   {
        for (uint i = 0; i < consumers.length; i++) {
            _priceConsumers.add(consumers[i]);
        }
    }

    function registerAssets(address[] memory assets) public onlyOwner {
        for (uint i = 0; i < assets.length; i++) {
            _assets.add(assets[i]);
        }
    }

}
