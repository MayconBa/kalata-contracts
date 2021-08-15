pragma solidity >=0.6.0;

import "@openzeppelin/contracts/math/Math.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "./interfaces/IFactory.sol";
import "./interfaces/IMint.sol";
import "./interfaces/IStaking.sol";
import "./libraries/SafeDecimalMath.sol";
import "./libraries/ContractFactory.sol";
import "./libraries/Bytes32.sol";
import "./BEP20Token.sol";
import "./SafeAccess.sol";

contract Factory is IFactory {
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using Bytes32 for bytes32;
    using ContractFactory for bytes;

    struct Token {
        bytes32 tokenName;
        bytes32 tokenSymbol;
        address tokenAddress;
        address busdPairAddress;
    }

    struct DistributionSchedule {
        uint startTime;
        uint endTime;
        uint amount;
    }

    struct Params {
        uint auctionDiscount;
        uint minCollateralRatio;
        uint weight;
    }

    uint private constant DISTRIBUTION_INTERVAL = 60;


    DistributionSchedule[] private _distributionSchedules;

    uint private _lastDistributeIndex;
    uint private _lastDistributed;
    uint private _totalWeight;

    mapping(address => uint)  private _assetWeights;
    address[] private _addresses;

    mapping(bytes32 => address) private _symbolTokenMap;
    Token[] private _tokens;

    address private _mint;

    address private _staking;
    address private _uniswapFactory;
    address private _baseToken;

    address private _govToken;

    uint private _distributeStartTime;

    function initialize(address mint, address staking, address uniswapFactory, address baseToken, address govToken) external initializer {
        __Ownable_init();
        _updateConfig(mint, staking, uniswapFactory, baseToken, govToken);
        _totalWeight = 32;
        _distributeStartTime = 0;
    }

    function updateDistributeStartTime(uint distributeStartTime) public {
        _distributeStartTime = distributeStartTime;
    }



    function updateWeight(address assetToken, uint weight) override external onlyOwner {
        uint originWeight = _assetWeights[assetToken];
        saveWeight(assetToken, weight);
        _totalWeight = _totalWeight.add(weight).sub(originWeight);
        emit UpdateWeight(msg.sender, assetToken, weight);
    }


    function registerAsset(address tokenAddress, address pairAddress, bytes32 name, bytes32 symbol,
        uint auctionDiscount, uint minCollateralRatio, uint weight) override external onlyOwner {
        if (_symbolTokenMap[symbol] == address(0)) {
            _registerAsset(tokenAddress, pairAddress, name, symbol, auctionDiscount, minCollateralRatio, weight);
        }
    }


    function distribute() override external  {
        require(_distributeStartTime > 0 && block.timestamp.sub(_lastDistributed) >= DISTRIBUTION_INTERVAL, "Factory: DISTRIBUTE_NOT_TIME");
        uint timeElapsed = block.timestamp.sub(_distributeStartTime);
        uint distributedAmount = 0;
        for (uint i = 0; i < _distributionSchedules.length; i++) {
            DistributionSchedule memory schedule = _distributionSchedules[i];
            if (schedule.startTime <= timeElapsed && timeElapsed < schedule.endTime) {
                uint timeSlot = schedule.endTime.sub(schedule.startTime);
                uint timeDuration = Math.min(timeElapsed, schedule.endTime).sub(
                    Math.max(schedule.startTime, _lastDistributed > _distributeStartTime ? _lastDistributed.sub(_distributeStartTime) : 0)
                );
                uint amount = timeDuration.multiplyDecimal(schedule.amount.divideDecimal(timeSlot));
                distributedAmount = amount;
                break;
            }
        }
        _lastDistributed = block.timestamp;
        if (distributedAmount > 0) {
            IBEP20Token(_govToken).mint(_staking, distributedAmount);
            address[] memory assets = _addresses;
            uint[] memory amounts = new uint[](assets.length);
            for (uint i = 0; i < assets.length; i++) {
                amounts[i] = distributedAmount.multiplyDecimal(_assetWeights[assets[i]].divideDecimal(_totalWeight));
            }
            IStaking(_staking).depositRewards(assets, amounts);
        }
    }

    function distributeAsset(address asset, uint amount) private {
        if (asset != address(0) && amount > 0) {
            IStaking(_staking).depositReward(asset, amount);
            emit Distribute(msg.sender, asset, amount);
        }
    }

    function revokeAsset(address assetToken, uint endPrice) override external onlyOwner {
        _revokeAsset(assetToken, endPrice);
        emit RevokeAsset(msg.sender, assetToken, endPrice);
    }

    function migrateAsset(bytes32 name, bytes32 symbol, address assetToken, uint endPrice) override external onlyOwner {
        (uint auctionDiscount, uint minCollateralRatio,) = IMint(_mint).queryAssetConfig(assetToken);
        uint weight = _revokeAsset(assetToken, endPrice);
        addToken(owner(), name, symbol, auctionDiscount, minCollateralRatio, weight);
        emit MigrateAsset(msg.sender, endPrice, assetToken);
    }


    function saveWeight(address assetToken, uint weight) private {
        bool exists = false;
        for (uint i = 0; i < _addresses.length; i++) {
            if (_addresses[i] == assetToken) {
                exists = true;
                break;
            }
        }
        if (!exists) {
            _addresses.push(assetToken);
        }
        _assetWeights[assetToken] = weight;
    }

    function removeWeight(address assetToken) private {
        delete _assetWeights[assetToken];
        uint length = _addresses.length;
        for (uint i = 0; i < length; i++) {
            if (_addresses[i] == assetToken) {
                if (i != length - 1) {
                    _addresses[i] = _addresses[length - 1];
                }
                delete _addresses[length - 1];
            }
        }
    }


    function addToken(address tokenOwner, bytes32 name, bytes32 symbol,
        uint auctionDiscount, uint minCollateralRatio, uint weight) private {
        require(_symbolTokenMap[symbol] == address(0), "symbol already exists");

        address tokenAddress = createToken(tokenOwner, name, symbol);
        address pairAddress = IUniswapV2Factory(_uniswapFactory).createPair(_baseToken, tokenAddress);

        _registerAsset(tokenAddress, pairAddress, name, symbol, auctionDiscount, minCollateralRatio, weight);
    }


    function _registerAsset(address tokenAddress, address pairAddress, bytes32 name, bytes32 symbol,
        uint auctionDiscount, uint minCollateralRatio, uint weight) private {

        _symbolTokenMap[symbol] = tokenAddress;
        _tokens.push(Token(name, symbol, tokenAddress, pairAddress));
        saveWeight(tokenAddress, weight);
        _totalWeight = _totalWeight.add(weight);
        IMint(_mint).registerAsset(tokenAddress, auctionDiscount, minCollateralRatio);
        IStaking(_staking).registerAsset(tokenAddress, pairAddress);
    }


    function createToken(address tokenOwner, bytes32 name, bytes32 symbol) private returns (address addr) {
        bytes memory code = type(BEP20Token).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(name, symbol, block.timestamp));
        addr = code.deploy(salt);
        require(addr != address(0), "createToken failed");
        BEP20Token(addr).initialize(name.convertToString(), symbol.convertToString(), 0);
        address[] memory minters = new address[](2);
        minters[0] = address(this);
        minters[1] = _mint;
        BEP20Token(addr).registerMinters(minters);
        BEP20Token(addr).transferOwnership(tokenOwner);
        emit TokenCreated(msg.sender, name, symbol, 0, addr);
    }

    function _updateConfig(address mint, address staking, address uniswapFactory, address baseToken, address govToken) private {
        require(
            mint != address(0) && staking != address(0) && uniswapFactory != address(0) && baseToken != address(0) && govToken != address(0),
            "Invalid address"
        );
        _mint = mint;
        _staking = staking;
        _uniswapFactory = uniswapFactory;
        _baseToken = baseToken;
        _govToken = govToken;
    }

    function _revokeAsset(address assetToken, uint endPrice) private returns (uint weight){
        require(assetToken != address(0), "Invalid assetToken");
        require(endPrice != 0, "Invalid endPrice");
        weight = _assetWeights[assetToken];
        removeWeight(assetToken);
        _totalWeight = _totalWeight.sub(weight);
        IMint(_mint).registerMigration(assetToken, endPrice);
    }

}
