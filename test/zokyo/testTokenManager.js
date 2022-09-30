const chai = require("chai");
const { solidity } = require("ethereum-waffle");
const { smock } = require("@defi-wonderland/smock");
const { ethers, upgrades } = require("hardhat");

const { expect } = chai;

chai.use(solidity);
chai.use(smock.matchers);

describe("TokenManager", () => {
  let owner, user1, user2, user3, user4;
  let tokenManager, weth, CHAINLINK_ETH_USD, ERC20ContractFactory, iChainLink;

  const CHAINLINK_DEC = 8;
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  before(async () => {
    /* before tests */
    [owner, user1, user2, user3, user4] = await ethers.getSigners();

    weth = await smock.fake("ERC20");
    await weth.symbol.returns("weth");
    await weth.decimals.returns(CHAINLINK_DEC);

    iChainLink = await smock.fake("IChainlink");
    iChainLink.decimals.returns(8);
    CHAINLINK_ETH_USD = iChainLink.address;

    ERC20ContractFactory = await hre.ethers.getContractFactory("ERC20");
  });

  beforeEach(async () => {
    /* before each context */
    const tokenManagerContractFactory = await ethers.getContractFactory(
      "TokenManager"
    );

    tokenManager = await tokenManagerContractFactory.deploy(
      weth.address,
      CHAINLINK_ETH_USD
    );
  });

  it("success -> get token info", async () => {
    const callDataResult = await tokenManager.callStatic.get("weth");
    expect(callDataResult[0]).to.be.equal(weth.address);
    expect(callDataResult[1]).to.be.equal(8);
    expect(callDataResult[2]).to.be.equal(CHAINLINK_ETH_USD);
    expect(callDataResult[3]).to.be.equal(CHAINLINK_DEC);

    expect(await tokenManager.getTokenAddressFor("weth")).to.equal(
      weth.address
    );
    expect(await tokenManager.getTokenDecimalFor("weth")).to.equal(8);
    expect(await tokenManager.getChainlinkAddressFor("weth")).to.equal(
      CHAINLINK_ETH_USD
    );
    expect(await tokenManager.getChainlinkDecimalFor("weth")).to.equal(8);
  });

  it("fail -> get token info", async () => {
    await expect(
      tokenManager.callStatic.get("weth-non-existent")
    ).to.be.revertedWith("err-tok-not-found");
  });

  it("success -> get accepted token symbols", async () => {
    const callDataResult = await tokenManager.callStatic.getAcceptedTokens();
    expect(callDataResult[0]).to.be.equal("weth");
  });

  it("success -> add new token and delete", async () => {
    const dai = await smock.fake("ERC20");
    await dai.symbol.returns("dai");
    await dai.decimals.returns(8);

    expect(
      await tokenManager.addAcceptedToken(dai.address, iChainLink.address)
    );

    const callDataResult = await tokenManager.callStatic.getAcceptedTokens();
    expect(callDataResult[1]).to.be.equal("dai");

    expect(await tokenManager.removeAcceptedToken("dai"));

    expect(
      await tokenManager.addAcceptedToken(dai.address, iChainLink.address)
    );

    const dai2 = await smock.fake("ERC20");
    await dai2.symbol.returns("dai2");
    await dai2.decimals.returns(8);
    expect(
      await tokenManager.addAcceptedToken(dai2.address, iChainLink.address)
    );
    expect(await tokenManager.removeAcceptedToken("dai"));
  });

  it("fail -> add new token", async () => {
    const dai = await smock.fake("ERC20");
    await dai.symbol.returns("");
    await dai.decimals.returns(8);

    await expect(
      tokenManager.addAcceptedToken(dai.address, iChainLink.address)
    ).to.be.revertedWith("err-empty-symbol");

    const dai2 = await smock.fake("ERC20");
    await dai2.symbol.returns("dai2");
    await dai2.decimals.returns(0);

    await expect(
      tokenManager.addAcceptedToken(dai2.address, iChainLink.address)
    ).to.be.revertedWith("err-zero-decimals");
  });

  it("fail -> call getters for non added symbol", async () => {
    let result = await tokenManager.callStatic.getChainlinkAddressFor(
      "non-added symbol"
    );
    expect(result).to.be.equal(ZERO_ADDRESS);

    result = await tokenManager.callStatic.getTokenAddressFor(
      "non-added symbol"
    );
    expect(result).to.be.equal(ZERO_ADDRESS);

    result = await tokenManager.callStatic.getChainlinkDecimalFor(
      "non-added symbol"
    );
    expect(result).to.be.equal(0);
  });

  it("Add same token multiple times", async () => {
    const usdt = await smock.fake("ERC20");
    await usdt.symbol.returns("usdt");
    await usdt.decimals.returns(8);

    expect(
      await tokenManager.addAcceptedToken(usdt.address, iChainLink.address)
    );

    const callDataResult = await tokenManager.callStatic.getAcceptedTokens();
    expect(callDataResult).to.eql(["weth", "usdt"]);

    await expect(
      tokenManager.addAcceptedToken(usdt.address, iChainLink.address)
    ).to.be.revertedWith("err-token-exists");

    let allAcceptedTokens = await tokenManager.callStatic.getAcceptedTokens();
    expect(allAcceptedTokens).to.eql(["weth", "usdt"]);

    expect(await tokenManager.removeAcceptedToken("usdt"));

    allAcceptedTokens = await tokenManager.callStatic.getAcceptedTokens();
    expect(allAcceptedTokens).to.eql(["weth"]);
  });
});
