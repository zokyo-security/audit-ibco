module.exports = {
  skipFiles: [
    "interfaces/API.sol",
    "interfaces/IChainlink.sol",
    "interfaces/ISeuro.sol",
    "interfaces/WETH.sol",
    "Stage1/BondingCurve.sol",
    "Stage1/SEuroCalculator.sol",
    "Stage1/SEuroOffering.sol",
    "Stage2/BondingEvent.sol",
    "Stage2/BondStorage.sol",
    "Stage2/Operator.sol",
    "Stage2/RatioCalculator.sol",
    "Stage2/StandardTokenGateway.sol",
    "Stage3/Directory.sol",
    "Stage3/Staking.sol",
    "test_utils/Chainlink.sol",
    "test_utils/DrainableTest.sol",
    "test_utils/ERC20.sol",
    "test_utils/PriceConverter.sol",
    "test_utils/RateLibraryTester.sol",
    "test_utils/SwapManager.sol",
    "test_utils/TestBondingCurveBuckets.sol",
    "uniswap/INonfungiblePositionManager.sol",
    "uniswap/PoolAddress.sol",
    "Drainable.sol",
    "Pausable.sol",
    "Rates.sol",
    "Stage1/TestEchidna.sol",
    "Stage1/TokenManager2.sol",
  ],
};