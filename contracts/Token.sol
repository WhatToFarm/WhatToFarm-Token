// SPDX-License-Identifier: GPL-3.0-or-later

/// @title WhatToFarm BEP20 token
/// @author FormalCrypto

pragma solidity ^0.8.4;
import "./libs/Address.sol";
import "./libs/Context.sol";
import "./libs/Ownable.sol";
import "./libs/ERC20.sol";
import "./interfaces/IPancakeRouter.sol";

/// @notice BEP20 token with adding liquidity to the pancake pool
/// @dev Designed to work with Pancake Router
contract Token is Context, ERC20, Ownable {
    using Address for address;


    /*///////////////////////////////////////////////////////////////
                    Global STATE
    //////////////////////////////////////////////////////////////*/
    
    uint256 public _taxFee = 5;
    uint256 private _previousTaxFee = _taxFee;

    uint256 public _liquidityFee = 5;
    uint256 private _previousLiquidityFee = _liquidityFee;

    IPancakeRouter02 public immutable pancakeV2Router;
    address public poolPancake;
    address public immutable feePool;

    bool public inSwapAndLiquify;
    bool public swapAndLiquifyEnabled = true;

    uint256 public beginning;

    event MinTokensBeforeSwapUpdated(uint256 minTokensBeforeSwap);
    event SwapAndLiquifyEnabledUpdated(bool enabled);
    event SwapAndLiquify(
        uint256 tokensSwapped,
        uint256 ethReceived,
        uint256 tokensIntoLiqudity
    );


    /*///////////////////////////////////////////////////////////////
                    DATA STRUCTURES 
    //////////////////////////////////////////////////////////////*/
    
    struct TeamToken {
        bool isTeam;
        uint256 spent; // how many tokens spent
    }
    
    mapping (address => TeamToken) public teamUsers;

    struct WalletLockup {
        uint256 period0;
        uint256 rate0;
        uint256 period1;
        uint256 rate1;
        uint256 period2;
        uint256 rate2;
    }
    
    mapping (address => WalletLockup) public walletLockups;

    mapping (address => bool) private _isExcludedFromFee;
    

    /*///////////////////////////////////////////////////////////////
                    MODIFIERS 
    //////////////////////////////////////////////////////////////*/
    
    modifier lockTheSwap {
        inSwapAndLiquify = true;
        _;
        inSwapAndLiquify = false;
    }


    /*///////////////////////////////////////////////////////////////
                    CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor (address[] memory _users, uint256[] memory _teamAmounts) ERC20("WhatToFarm", "WTF") {
        require(_users.length == _teamAmounts.length, "Different size of arrays");
        for (uint256 i = 0; i < _users.length; i++) {
            teamUsers[_users[i]].isTeam = true;
            _mint(_users[i], _teamAmounts[i]);
        }

        beginning = block.timestamp;

        IPancakeRouter02 _pancakeV2Router = IPancakeRouter02(0xD99D1c33F9fC3444f8101754aBC46c52416550D1);

        // set the rest of the contract variables
        pancakeV2Router = _pancakeV2Router;

        feePool = 0x05fF2B0DB69458A0750badebc4f9e13aDd608C7F;

        //exclude owner and this contract from fee
        _isExcludedFromFee[owner()] = true;
        _isExcludedFromFee[address(this)] = true;

        emit Transfer(address(0), _msgSender(), totalSupply());
    }


    /*///////////////////////////////////////////////////////////////
                    OWNER'S FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    function mint(address account, uint256 amount) external onlyOwner {
        _mint(account, amount);
    }
    
    function setPool(address _poolPancake) external onlyOwner {
        require(_poolPancake != address(0), "Pool doesn't exist");
        poolPancake = _poolPancake;
    }

    function setWalletLockup(address _user, uint256[3] calldata _periods, uint256[3] calldata _rates) external onlyOwner {
        require(teamUsers[_user].isTeam, "Not teamUsers");
        require(_rates[0] + _rates[1] + _rates[2] == 100, "Wrong rates");
        walletLockups[_user].period0 = _periods[0];
        walletLockups[_user].rate0 = _rates[0];
        walletLockups[_user].period1 = _periods[1];
        walletLockups[_user].rate1 = _rates[1];
        walletLockups[_user].period2 = _periods[2];
        walletLockups[_user].rate2 = _rates[2];
    }

    function excludeFromFee(address account) public onlyOwner {
        _isExcludedFromFee[account] = true;
    }

    function includeInFee(address account) public onlyOwner {
        _isExcludedFromFee[account] = false;
    }

    function setTaxFeePercent(uint256 taxFee) external onlyOwner() {
        _taxFee = taxFee;
    }

    function setLiquidityFeePercent(uint256 liquidityFee) external onlyOwner() {
        _liquidityFee = liquidityFee;
    }

    function setSwapAndLiquifyEnabled(bool _enabled) public onlyOwner {
        swapAndLiquifyEnabled = _enabled;
        emit SwapAndLiquifyEnabledUpdated(_enabled);
    }


    /*///////////////////////////////////////////////////////////////
                    PUBLIC FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function transfer(address to, uint256 amount) public override returns (bool) {
        require(amount <= balanceOf(msg.sender), "Insufficient balance");
        require(to != address(0), "Wrong address");
        if(teamUsers[msg.sender].isTeam) {
            require(_getAvailable(msg.sender) >= amount, "Exceeded balance");
            teamUsers[msg.sender].spent += amount;
            _transfer(_msgSender(), to, amount);
        } else
            _transfer(_msgSender(), to, amount);
        return true;
    }

    function transferFrom(address sender, address to, uint256 amount) public override returns (bool) {
        require(amount <= balanceOf(sender), "Insufficient balance");
        if(teamUsers[sender].isTeam) {
            require(_getAvailable(sender) >= amount, "Exceeded balance");
            teamUsers[sender].spent += amount;
            require(amount <= allowance(sender, _msgSender()), "ERC20: transfer amount exceeds allowance");
            _approve(sender, _msgSender(), allowance(sender, _msgSender()) - amount);

            _transfer(sender, to, amount);
        } else {
            require(amount <= allowance(sender, _msgSender()), "ERC20: transfer amount exceeds allowance");
            _approve(sender, _msgSender(), allowance(sender, _msgSender()) - amount);

            _transfer(sender, to, amount);
        }
        return true;
    }
    
    function burn(uint256 amount) external {
        _burn(_msgSender(), amount);
    }

    //to recieve ETH from pancakeRouter when swaping
    receive() external payable {}


    /*///////////////////////////////////////////////////////////////
                    VIEWERS
    //////////////////////////////////////////////////////////////*/

    function totalFees() public view returns (uint256) {
        return _balances[feePool];
    }

    function isExcludedFromFee(address account) public view returns (bool) {
        return _isExcludedFromFee[account];
    }


    /*///////////////////////////////////////////////////////////////
                    INTERNAL  HELPERS
    //////////////////////////////////////////////////////////////*/

    function _getAvailable(address user) private view returns (uint256) {
        uint256 total;
        uint256 sum;

        if (block.timestamp > beginning + walletLockups[user].period2) {
            total = teamUsers[user].spent + balanceOf(user);
            sum = total - teamUsers[user].spent;
            return sum;
        } else if (block.timestamp > beginning + walletLockups[user].period1) {
            total = teamUsers[user].spent + balanceOf(user);
            sum = (total * (walletLockups[user].rate1 + walletLockups[user].rate0)) / 100 - teamUsers[user].spent;
            return sum;
        } else if (block.timestamp > beginning + walletLockups[user].period0) {
            total = teamUsers[user].spent + balanceOf(user);
            sum = (total * walletLockups[user].rate0) / 100 - teamUsers[user].spent;
            return sum;
        } else
            return 0;
    }

    function _takeLiquidity(uint256 liquidity) private {
        _balances[address(this)] += liquidity;
    }

    function _takeFee(uint256 fee) private {
        _balances[feePool] += fee;
    }

    function _getValues(uint256 amount) private view returns (uint256, uint256, uint256) {
        uint256 fee = calculateTaxFee(amount);
        uint256 liquidity = calculateLiquidityFee(amount);
        uint256 transferAmount = amount - fee - liquidity;
        return (transferAmount, fee, liquidity);
    }

    function calculateTaxFee(uint256 _amount) private view returns (uint256) {
        return _amount * _taxFee / 10**2;
    }

    function calculateLiquidityFee(uint256 _amount) private view returns (uint256) {
        return _amount * _liquidityFee / 10**2;
    }

    function removeAllFee() private {
        if(_taxFee == 0 && _liquidityFee == 0) return;

        _previousTaxFee = _taxFee;
        _previousLiquidityFee = _liquidityFee;

        _taxFee = 0;
        _liquidityFee = 0;
    }

    function restoreAllFee() private {
        _taxFee = _previousTaxFee;
        _liquidityFee = _previousLiquidityFee;
    }

    function _transfer(
        address from,
        address to,
        uint256 amount
    ) override internal {
        require(from != address(0), "ERC20: transfer from the zero address");
        require(to != address(0), "ERC20: transfer to the zero address");
        require(amount > 0, "Transfer amount must be greater than zero");

        //indicates if fee should be deducted from transfer
        bool takeFee = true;

        //if any account belongs to _isExcludedFromFee account then remove the fee
        if(_isExcludedFromFee[from] || _isExcludedFromFee[to]){
            takeFee = false;
        }

        //transfer amount, it will take tax, burn, liquidity fee
        if(!takeFee)
            removeAllFee();

        (uint256 transferAmount, uint256 fee, uint256 liquidity) = _getValues(amount);
        _balances[from] -= amount;
        _balances[to] += transferAmount;
        _takeLiquidity(liquidity);
        _takeFee(fee);

        if(!takeFee)
            restoreAllFee();

        // is the token balance of this contract address over the min number of
        // tokens that we need to initiate a swap + liquidity lock?
        // also, don't get caught in a circular liquidity event.
        // also, don't swap & liquify if sender is pancake pair.
        uint256 contractTokenBalance = balanceOf(address(this));

        if (
            //overMinTokenBalance &&
            !inSwapAndLiquify &&
            from != poolPancake &&
            swapAndLiquifyEnabled &&
            contractTokenBalance != 0
        ) {
            //add liquidity
            swapAndLiquify(contractTokenBalance);
        }

        emit Transfer(from, to, amount);
    }

    function swapAndLiquify(uint256 contractTokenBalance) private lockTheSwap {
        // split the contract balance into halves
        uint256 half = contractTokenBalance / 2;
        uint256 otherHalf = contractTokenBalance - half;

        // capture the contract's current ETH balance.
        // this is so that we can capture exactly the amount of ETH that the
        // swap creates, and not make the liquidity event include any ETH that
        // has been manually sent to the contract
        uint256 initialBalance = address(this).balance;

        // swap tokens for ETH
        swapTokensForEth(half); // <- this breaks the ETH -> HATE swap when swap+liquify is triggered

        // how much ETH did we just swap into?
        uint256 newBalance = address(this).balance - initialBalance;

        // add liquidity to pancake
        addLiquidity(otherHalf, newBalance);

        emit SwapAndLiquify(half, newBalance, otherHalf);
    }

    function swapTokensForEth(uint256 tokenAmount) private {
        // generate the pancake pair path of token -> weth
        address[] memory path = new address[](2);
        path[0] = address(this);
        path[1] = pancakeV2Router.WETH();

        _approve(address(this), address(pancakeV2Router), tokenAmount);

        // make the swap
        pancakeV2Router.swapExactTokensForETHSupportingFeeOnTransferTokens(
            tokenAmount,
            0, // accept any amount of ETH
            path,
            address(this),
            block.timestamp
        );
    }

    function addLiquidity(uint256 tokenAmount, uint256 ethAmount) private {
        // approve token transfer to cover all possible scenarios
        _approve(address(this), address(pancakeV2Router), tokenAmount);

        // add the liquidity
        pancakeV2Router.addLiquidityETH{value: ethAmount}(
            address(this),
            tokenAmount,
            0, // slippage is unavoidable
            0, // slippage is unavoidable
            owner(),
            block.timestamp
        );
    }
}
