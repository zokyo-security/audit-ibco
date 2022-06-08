//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "contracts/uniswap/INonfungiblePositionManager.sol";
import "contracts/BondStorage.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract BondingEvent is AccessControl, BondStorage {
	// sEUR: the main leg of the currency pair
	address public immutable sEuroToken;
	// other: the other ERC-20 token
	address public immutable otherToken;

	struct TokenMetaData {
		bool initialised;
		address pool; //TODO: clarify relation between pool address and tokenId (NFT)
		string shortName;
	}

	// allow quick lookup to see liquidity provided by users
	mapping(address => TokenMetaData) private userData;
	// liquidity pool for a currency pair (sEURO : someToken)
	address[] public liquidityPools;
	// minimum currency amount
	uint256 public immutable MIN_VAL = 0;

	// uniswap: creates bond
	INonfungiblePositionManager private immutable manager;

	// https://docs.uniswap.org/protocol/reference/core/libraries/Tick
	int24 public tickSpacing;
	int24 private constant TICK_LOWER = -887270;
	int24 private constant TICK_UPPER = 887270;
	uint24 private fee; // should the fee really be private?

	// only contract owner can add the other currency leg
	bytes32 public constant WHITELIST_BONDING_EVENT = keccak256("WHITELIST_BONDING_EVENT");

	constructor(address _sEuro, address _otherToken, address _manager) {
		_setupRole(WHITELIST_BONDING_EVENT, msg.sender);
		sEuroToken = _sEuro;
		otherToken = _otherToken;
		manager = INonfungiblePositionManager(_manager);
	}

	// Adds a new ERC20-token to the list of allowed currency legs
	function newAllowedErc20(address _token, string memory _name, address _poolAddress) private {
		require(hasRole(WHITELIST_BONDING_EVENT, msg.sender), 'invalid-whitelist-guard');
		require(userData[_token].initialised == false, 'token-already-added');

		userData[_token].initialised = true;
		userData[_token].shortName = _name;
		userData[_token].pool = _poolAddress;
	}


	// Compares the Standard Euro token to another token and returns them in ascending order
	function getAscendingPair(address _otherToken) private view returns (address token0, address token1) {
		(token0, token1) = sEuroToken < _otherToken
			? (sEuroToken, _otherToken)
			: (_otherToken, sEuroToken);
	}

	// Returns the amount of pools created
	function getPoolAmount() external view returns (uint256) {
		return liquidityPools.length;
	}

	// Initialises a pool with another token (address) and stores it in the array of pools.
	// Note that the price is in sqrtPriceX96 format.
	function initialisePool(string memory _otherName, address _otherAddress, uint160 _price, uint24 _fee) external {
		(address token0, address token1) = getAscendingPair(_otherAddress);
		fee = _fee;
		address pool = manager.createAndInitializePoolIfNecessary(
			token0,
			token1,
			_fee,
			_price
		);
		tickSpacing = IUniswapV3Pool(pool).tickSpacing();
		liquidityPools.push(pool);
		newAllowedErc20(_otherAddress, _otherName, pool);
	}

	function validTicks() private view returns (bool) {
		return TICK_LOWER % tickSpacing == 0 && TICK_UPPER % tickSpacing == 0;
	}


	function addLiquidity(int128 _amountSeuro, int128 _amountOther, address _otherToken) private returns (PositionMetaData memory) {
		uint256 amountSeuro;
		uint256 amountOther;
		uint256 dummyS;
		uint256 dummyO;
		amountSeuro = dummyS + uint128(_amountSeuro);
		amountOther = dummyO + uint128(_amountOther);


		// send sEURO tokens from the sender's account to the contract account
		TransferHelper.safeTransferFrom(sEuroToken, msg.sender, address(this), amountSeuro);
		// send other erc20 tokens from the sender's account to the contract account
		TransferHelper.safeTransferFrom(_otherToken, msg.sender, address(this), amountOther);
		// approve the contract to send sEURO tokens to manager
		TransferHelper.safeApprove(sEuroToken, address(manager), amountSeuro);
		// approve the contract to send other erc20 tokens to manager
		TransferHelper.safeApprove(_otherToken, address(manager), amountOther);

		(address token0, address token1) = getAscendingPair(_otherToken);

		// not sure why the full amount of seuro can't be added
		// possible explanation: the price moves so we need some margin, see link below:
		// https://github.com/Uniswap/v3-periphery/blob/main/contracts/NonfungiblePositionManager.sol#L273-L275=
		uint256 minSeuro = amountSeuro - 0.05 ether;
		(uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min) =
			token0 == sEuroToken ?
			(amountSeuro, amountOther, minSeuro, MIN_VAL) :
			(amountOther, amountSeuro, MIN_VAL, minSeuro);

		INonfungiblePositionManager.MintParams memory params =
			INonfungiblePositionManager.MintParams({
			token0: token0,
			token1: token1,
			fee: fee,
			tickLower: TICK_LOWER,
			tickUpper: TICK_UPPER,
			amount0Desired: amount0Desired,
			amount1Desired: amount1Desired,
			amount0Min: amount0Min,
			amount1Min: amount1Min,
			recipient: address(this),
			deadline: block.timestamp
		});

		// provide liquidity to the pool
		(uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1) = manager.mint(params);
		
		// How can we know which one of the the two tokens is the sEURO?
		// We know that the other amount does not change.
		// So we check if the other amount matches some of the two amounts. If it does, the other is sEURO.
		// We simply do a swap if amount0 contains the foreign token to keep sEURO first.
		if (amount0 == amountOther) (amount0, amount1) = (amount1, amount0);
		PositionMetaData memory pos = PositionMetaData(tokenId, liquidity, /*sEURO field */ amount0, /* other field */ amount1);
		return pos;

		//TODO: look into the refund mechanism again if needed, create tests to make sure nothing is "lost"
	}

	// We assume that there is a higher layer solution which helps to fetch the latest price as a quote.
	// This quote is being used to supply the two amounts to the function.
	// The reason for this is because of the explicit discouragement of doing this on-chain
	// due to the high gas costs (see https://docs.uniswap.org/protocol/reference/periphery/lens/Quoter).
	/// @param _amountSeuro The amount of sEURO token to bond
	/// @param _amountOther The amount of the other token to bond
	/// @param _otherToken The address of the other token
	/// @param _maturityInWeeks The amount of months a bond is active.
	///                          At the end of maturity, the principal + accrued interest is paid out all at once in TST.
	/// @param _rate The rate is represented as a 10,000-factor of each basis point so the most stable fee is 500 (= 0.05 pc)
	function bond(
		int128 _amountSeuro,
		int128 _amountOther,
		address _otherToken,
		uint8 _maturityInWeeks,
		int128 _rate
	) public {
		require(userData[_otherToken].initialised == true, 'invalid-token-bond');
		require(validTicks(), 'err-inv-tick');

		// information about the liquidity position after it has been successfully added
		PositionMetaData memory position = addLiquidity(_amountSeuro, _amountOther, _otherToken);
		// begin bonding event
		startBond(msg.sender, _amountSeuro, _rate, _maturityInWeeks, position);
	}
}
