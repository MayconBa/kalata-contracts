pragma solidity >=0.6.0;
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "./interfaces/IBEP20Token.sol";

contract BEP20Token is Initializable, IBEP20Token {
    using SafeMathUpgradeable for uint256;
    mapping(address => uint256) private _balances;

    mapping(address => mapping(address => uint256)) private _allowances;

    uint256 private _totalSupply;
    uint8 private _decimals;
    string private _symbol;
    string private _name;


    function initialize(string memory tokenName, string memory tokenSymbol, uint tokenInitSupply) public initializer {
        __ERC20_init(tokenName, tokenSymbol);
        _mint(_msgSender(), tokenInitSupply);
        __Ownable_init();
    }


    function __ERC20_init(string memory name_, string memory symbol_) internal initializer {
        __Context_init_unchained();
        __ERC20_init_unchained(name_, symbol_);
    }

    function __ERC20_init_unchained(string memory name_, string memory symbol_) internal initializer {
        _name = name_;
        _symbol = symbol_;
        _decimals = 18;
    }


    function getOwner() override external view returns (address) {
        return owner();
    }


    function decimals() override external view returns (uint8) {
        return _decimals;
    }

    function symbol() override external view returns (string memory) {
        return _symbol;
    }


    function name() override external view returns (string memory) {
        return _name;
    }


    function totalSupply() override external view returns (uint256) {
        return _totalSupply;
    }


    function balanceOf(address account) override external view returns (uint256) {
        return _balances[account];
    }


    function transfer(address recipient, uint256 amount) override external returns (bool) {
        _transfer(_msgSender(), recipient, amount);
        return true;
    }


    function allowance(address owner, address spender) override external view returns (uint256) {
        return _allowances[owner][spender];
    }


    function approve(address spender, uint256 amount) override external returns (bool) {
        _approve(_msgSender(), spender, amount);
        return true;
    }


    function transferFrom(address sender, address recipient, uint256 amount) override external returns (bool) {
        _transfer(sender, recipient, amount);
        _approve(sender, _msgSender(), _allowances[sender][_msgSender()].sub(amount, "BEP20: transfer amount exceeds allowance"));
        return true;
    }


    function increaseAllowance(address spender, uint256 addedValue) public returns (bool) {
        _approve(_msgSender(), spender, _allowances[_msgSender()][spender].add(addedValue));
        return true;
    }


    function decreaseAllowance(address spender, uint256 subtractedValue) public returns (bool) {
        _approve(_msgSender(), spender, _allowances[_msgSender()][spender].sub(subtractedValue, "BEP20: decreased allowance below zero"));
        return true;
    }


    function _transfer(address sender, address recipient, uint256 amount) internal {
        require(sender != address(0), "BEP20: transfer from the zero address");
        require(recipient != address(0), "BEP20: transfer to the zero address");
        _balances[sender] = _balances[sender].sub(amount, "BEP20: transfer amount exceeds balance");
        _balances[recipient] = _balances[recipient].add(amount);
        emit Transfer(sender, recipient, amount);
    }


    function _approve(address owner, address spender, uint256 amount) internal {
        require(owner != address(0), "BEP20: approve from the zero address");
        require(spender != address(0), "BEP20: approve to the zero address");

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    function burn(address account, uint256 amount) override external onlyMinterOrOwner {
        _burn(account, amount);
    }

    function _burn(address account, uint256 amount) internal   {
        require(account != address(0), "ERC20: burn from the zero address");

        _balances[account] = _balances[account].sub(amount, "ERC20: burn amount exceeds balance");
        _totalSupply = _totalSupply.sub(amount);
        emit Transfer(account, address(0), amount);
    }


    function mint(address account, uint256 amount) override external onlyMinterOrOwner {
        _mint(account, amount);
    }


    function _mint(address account, uint256 amount) internal   {
        require(account != address(0), "ERC20: mint to the zero address");
        _totalSupply = _totalSupply.add(amount);
        _balances[account] = _balances[account].add(amount);
        emit Transfer(address(0), account, amount);
    }


    address[] minters;

    modifier onlyMinterOrOwner() {
        bool allowed = owner() == _msgSender();
        if (!allowed) {
            for (uint i = 0; i < minters.length; i++) {
                if (minters[i] == _msgSender()) {
                    allowed = true;
                    break;
                }
            }
        }
        require(allowed, "Ownable: caller is not a minter");
        _;
    }

    function registerMinters(address[] memory addresses) override external onlyOwner {
        for (uint i = 0; i < addresses.length; i++) {
            if (addresses[i] != address(0)) {
                bool exists = false;
                for (uint j = 0; j < minters.length; j++) {
                    if (minters[j] == addresses[i]) {
                        exists = true;
                        break;
                    }
                }
                if (!exists) {
                    minters.push(addresses[i]);
                }
            }
        }
    }

    function clearMinters() override external onlyOwner {
        delete minters;
    }


}
