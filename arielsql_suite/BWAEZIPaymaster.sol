// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IEntryPoint {
    function depositTo(address account) external payable;
    function balanceOf(address account) external view returns (uint256);
}

interface IQuoterV2 {
    function quoteExactOutputSingle(
        address tokenIn,
        address tokenOut,
        uint256 amountOut,
        uint24 fee,
        uint160 sqrtPriceLimitX96
    ) external returns (uint256 amountIn, uint160, uint32, uint256);
}

interface ISwapRouterV3 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

interface IWETH {
    function deposit() external payable;
    function withdraw(uint256) external;
    function balanceOf(address) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IERC20 {
    function allowance(address owner, address spender) external view returns (uint256);
    function balanceOf(address) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

library SafeERC20 {
    function safeTransfer(IERC20 t, address to, uint256 v) internal {
        require(t.transfer(to, v), "transfer fail");
    }
    function safeTransferFrom(IERC20 t, address f, address to, uint256 v) internal {
        require(t.transferFrom(f, to, v), "transferFrom fail");
    }
    function safeApprove(IERC20 t, address s, uint256 v) internal {
        require(t.approve(s, v), "approve fail");
    }
}

contract BWAEZIPaymaster {
    using SafeERC20 for IERC20;

    // Core wiring
    address public immutable entryPoint;
    address public immutable bwaezi;
    address public immutable weth;
    address public immutable uniswapRouter;
    address public immutable quoter;

    // SCW that this paymaster is designed to sponsor directly
    address public scw;

    // Owner-only config
    address public owner;
    uint256 public marginBps;          // e.g., 300 = +3%
    uint256 public maxSlippageBps;     // e.g., 100 = 1%
    uint24  public bwWethFee;          // e.g., 3000
    uint256 public targetDepositWei;   // e.g., 0.3 ETH
    bool    public paused;

    // Context replay protection
    mapping(bytes32 => bool) public validContexts;

    // Events
    event Sponsored(address indexed sender, uint256 maxCost);
    event Charged(address indexed sender, uint256 bwCharged);
    event Converted(uint256 bwSpent, uint256 wethReceived);
    event DepositTopped(uint256 ethAdded, uint256 newBalance);
    event OwnerChanged(address indexed newOwner);
    event SCWSet(address indexed scw);
    event Paused(bool status);
    event ConfigUpdated();
    event ContextBound(bytes32 ctx, address sender);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyEntryPoint() {
        require(msg.sender == entryPoint, "only EntryPoint");
        _;
    }

    constructor(
        address _entryPoint,
        address _bwaezi,
        address _weth,
        address _uniswapRouter,
        address _quoter,
        address _scw
    ) {
        require(_entryPoint != address(0) && _bwaezi != address(0) && _weth != address(0), "bad addr");
        require(_uniswapRouter != address(0) && _quoter != address(0), "bad addr");

        entryPoint     = _entryPoint;
        bwaezi         = _bwaezi;
        weth           = _weth;
        uniswapRouter  = _uniswapRouter;
        quoter         = _quoter;
        owner          = msg.sender;
        scw            = _scw;

        marginBps       = 300;   // +3%
        maxSlippageBps  = 100;   // 1%
        bwWethFee       = 3000;  // 0.3%
        targetDepositWei= 3e17;  // 0.3 ETH
        paused          = false;
    }

    // --- Admin ---
    function setOwner(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero");
        owner = newOwner;
        emit OwnerChanged(newOwner);
    }

    function setSCW(address _scw) external onlyOwner {
        require(_scw != address(0), "zero");
        scw = _scw;
        emit SCWSet(_scw);
    }

    function setConfig(
        uint256 _marginBps,
        uint256 _maxSlippageBps,
        uint24  _bwWethFee,
        uint256 _targetDepositWei
    ) external onlyOwner {
        marginBps       = _marginBps;
        maxSlippageBps  = _maxSlippageBps;
        bwWethFee       = _bwWethFee;
        targetDepositWei= _targetDepositWei;
        emit ConfigUpdated();
    }

    function setPaused(bool p) external onlyOwner {
        paused = p;
        emit Paused(p);
    }

    // --- EntryPoint deposit management ---
    receive() external payable {}

    function depositToEntryPoint(uint256 amountWei) external onlyOwner {
        require(address(this).balance >= amountWei, "insufficient ETH");
        IEntryPoint(entryPoint).depositTo{value: amountWei}(address(this));
        emit DepositTopped(amountWei, IEntryPoint(entryPoint).balanceOf(address(this)));
    }

    // --- Internal quoting ---
    function _quoteBWForWETH(uint256 wethOut) internal returns (uint256 bwInWithMargin) {
        // Try quoter; fallback to conservative 20% buffer
        (bool ok, bytes memory data) = quoter.call(
            abi.encodeWithSelector(
                IQuoterV2.quoteExactOutputSingle.selector,
                bwaezi, weth, wethOut, bwWethFee, 0
            )
        );
        uint256 bwIn = 0;
        if (ok && data.length >= 32) {
            (bwIn,,,) = abi.decode(data, (uint256, uint160, uint32, uint256));
        } else {
            // Fallback: assume 1:1 and add 20%
            bwIn = wethOut * 120 / 100;
        }
        bwInWithMargin = bwIn * (10000 + marginBps) / 10000;
    }

    // --- Sponsorship (validation) ---
    // EntryPoint-only, SCW-only, context binding to allowance snapshot
    function validatePaymasterUserOp(
        address sender,
        uint256 requiredPreFund,
        uint256 maxFeePerGas,
        uint256 maxPriorityFeePerGas
    ) external onlyEntryPoint returns (bytes memory context, uint256 validationData) {
        require(!paused, "paused");
        require(sender == scw, "only SCW");

        // Require BWAEZI allowance from SCW to paymaster
        uint256 allowance = IERC20(bwaezi).allowance(sender, address(this));
        require(allowance > 0, "no allowance");

        // Compute a conservative maxCost (preFund + fees)
        uint256 maxCost = requiredPreFund + (maxFeePerGas + maxPriorityFeePerGas);
        emit Sponsored(sender, maxCost);

        // Bind context to sender + allowance snapshot + block number
        bytes32 ctx = keccak256(abi.encode(sender, allowance, block.number));
        validContexts[ctx] = true;
        emit ContextBound(ctx, sender);

        return (abi.encode(ctx, sender), 0);
    }

    // --- Settlement (postOp) ---
    // EntryPoint-only, SCW-only, context verification, charge BWAEZI, convert and top-up deposit
    function postOp(
        bytes calldata context,
        uint256 actualGasCostWei
    ) external onlyEntryPoint {
        require(!paused, "paused");

        (bytes32 ctx, address sender) = abi.decode(context, (bytes32, address));
        require(sender == scw, "only SCW");
        require(validContexts[ctx], "invalid context");
        validContexts[ctx] = false; // consume once

        // Charge BWAEZI from SCW
        uint256 bwCharge = _quoteBWForWETH(actualGasCostWei);
        IERC20(bwaezi).safeTransferFrom(sender, address(this), bwCharge);
        emit Charged(sender, bwCharge);

        // Convert a portion of BWAEZI -> WETH if pool is usable
        uint256 bwBal = IERC20(bwaezi).balanceOf(address(this));
        if (bwBal > 0) {
            // Approve router
            IERC20(bwaezi).safeApprove(uniswapRouter, bwBal);

            // Use quoter to estimate WETH out; set minOut with slippage guard
            uint256 targetWethOut = actualGasCostWei; // aim to cover gas in WETH terms
            uint256 bwNeeded = _quoteBWForWETH(targetWethOut);
            if (bwNeeded > bwBal) bwNeeded = bwBal;

            ISwapRouterV3.ExactInputSingleParams memory p = ISwapRouterV3.ExactInputSingleParams({
                tokenIn: bwaezi,
                tokenOut: weth,
                fee: bwWethFee,
                recipient: address(this),
                deadline: block.timestamp + 600,
                amountIn: bwNeeded,
                amountOutMinimum: targetWethOut * (10000 - maxSlippageBps) / 10000,
                sqrtPriceLimitX96: 0
            });

            (bool ok, bytes memory data) = uniswapRouter.call(
                abi.encodeWithSelector(ISwapRouterV3.exactInputSingle.selector, p)
            );
            if (ok && data.length >= 32) {
                uint256 wethOut = abi.decode(data, (uint256));
                emit Converted(bwNeeded, wethOut);

                // Top-up EntryPoint deposit if below target
                uint256 dep = IEntryPoint(entryPoint).balanceOf(address(this));
                if (dep < targetDepositWei) {
                    // unwrap WETH -> ETH
                    IWETH(weth).withdraw(wethOut);
                    IEntryPoint(entryPoint).depositTo{value: wethOut}(address(this));
                    emit DepositTopped(wethOut, IEntryPoint(entryPoint).balanceOf(address(this)));
                }
            }
        }
    }

    // --- Treasury ---
    function withdrawBWAEZI(uint256 amount) external onlyOwner {
        IERC20(bwaezi).safeTransfer(owner, amount);
    }

    function withdrawWETH(uint256 amount) external onlyOwner {
        IWETH(weth).transfer(owner, amount);
    }

    function emergencyPause() external onlyOwner {
        paused = true;
        emit Paused(true);
    }
}
