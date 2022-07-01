const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('SEuroOffering', async () => {
  const WETH_BYTES = ethers.utils.formatBytes32String('WETH');
  const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  const CL_ETH_USD = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419';
  const CL_ETH_USD_DEC = 8;
  const DAI_USD_CL = '0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9';
  const DAI_CL_DEC = 8;
  const BUCKET_SIZE = ethers.utils.parseEther('100000');
  const INITIAL_PRICE = ethers.utils.parseEther('0.8');
  const MAX_SUPPLY = ethers.utils.parseEther('200000000');
  let SEuroOffering, SEuro, BondingCurve, SEuroCalculator, TokenManager, WETH, owner, user;

  async function buyWETH(signer, amount) {
    await WETH.connect(signer).deposit({ value: amount });
  }

  async function buyToken(signer, token, amount) {
    const SwapManagerContract = await ethers.getContractFactory('SwapManager');
    const SwapManager = await SwapManagerContract.deploy();
    await SwapManager.connect(signer).swapEthForToken(token, {value: amount});
  }

  async function getEthToSEuro(amount) {
    return await SEuroCalculator.callStatic.calculate(amount, CL_ETH_USD, CL_ETH_USD_DEC);
  }

  async function getDaiToSEuro(amount) {
    return await SEuroCalculator.callStatic.calculate(amount, DAI_USD_CL, DAI_CL_DEC);
  }

  async function getBucketPrice(index) {
    const TestBondingCurve = await (await ethers.getContractFactory('TestBondingCurve')).deploy(
      SEuro.address, INITIAL_PRICE, MAX_SUPPLY, BUCKET_SIZE
    );
    return await TestBondingCurve.callStatic.getPriceOfBucket(index);
  }

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();

    const SEuroContract = await ethers.getContractFactory('SEuro');
    const SEuroOfferingContract = await ethers.getContractFactory('SEuroOffering');
    const BondingCurveContract = await ethers.getContractFactory('BondingCurve');
    const SEuroCalculatorContract = await ethers.getContractFactory('SEuroCalculator');
    const TokenManagerContract = await ethers.getContractFactory('TokenManager');

    WETH = await ethers.getContractAt('WETH', WETH_ADDRESS);
    SEuro = await SEuroContract.deploy('SEuro', 'SEUR', [owner.address]);
    BondingCurve = await BondingCurveContract.deploy(SEuro.address, INITIAL_PRICE, MAX_SUPPLY, BUCKET_SIZE);
    SEuroCalculator = await SEuroCalculatorContract.deploy(BondingCurve.address);
    TokenManager = await TokenManagerContract.deploy();
    SEuroOffering = await SEuroOfferingContract.deploy(SEuro.address, SEuroCalculator.address, TokenManager.address, BondingCurve.address);

    await SEuro.connect(owner).grantRole(ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MINTER_ROLE')), SEuroOffering.address)
  });

  describe('swap', async () => {
    let PriceConverter;
    
    before(async () => {
      PriceConverter = await (await ethers.getContractFactory('PriceConverter')).deploy();
    });

    it('will not swap for eth if ibco not active', async () => {
      const toSwap = await ethers.utils.parseEther('1');

      const swap = SEuroOffering.connect(user).swapETH({ value: toSwap });

      await expect(swap).to.be.revertedWith('err-ibco-inactive')
      const userSEuroBalance = await SEuro.balanceOf(user.address);
      expect(userSEuroBalance).to.eq(0);
    });

    it('will not swap for token if ibco not active', async () => {
      const toSwap = await ethers.utils.parseEther('1');
      await buyWETH(user, toSwap);
      await WETH.connect(user).approve(SEuroOffering.address, toSwap);

      const swap = SEuroOffering.connect(user).swap(WETH_BYTES, toSwap);

      await expect(swap).to.be.revertedWith('err-ibco-inactive')
      const userSEuroBalance = await SEuro.balanceOf(user.address);
      expect(userSEuroBalance).to.eq(0);
    });

    describe('activated', async () => {
      beforeEach(async () => {
        await SEuroOffering.connect(owner).activate();
      });

      it('swaps for given token', async () => {
        const toSwap = await ethers.utils.parseEther('1');
        await buyWETH(user, toSwap);
        await WETH.connect(user).approve(SEuroOffering.address, toSwap);


        const expectedEuros = await getEthToSEuro(toSwap);
        const swap = SEuroOffering.connect(user).swap(WETH_BYTES, toSwap);
        await expect(swap).to.emit(SEuroOffering, 'Swap').withArgs(WETH_BYTES, toSwap, expectedEuros);
        const userSEuroBalance = await SEuro.balanceOf(user.address);
        expect(userSEuroBalance.toString()).to.equal(expectedEuros.toString());
      });

      it('will not swap without preapproval', async () => {
        const toSwap = await ethers.utils.parseEther('1');
        await buyWETH(user, toSwap);

        const swap = SEuroOffering.connect(user).swap(WETH_BYTES, toSwap);

        await expect(swap).to.be.revertedWith('err-tok-allow')
        const userSEuroBalance = await SEuro.balanceOf(user.address);
        expect(userSEuroBalance.toString()).to.equal('0');
      });

      it('will not swap without balance of token', async () => {
        const toSwap = await ethers.utils.parseEther('1');
        await WETH.connect(user).withdraw(await WETH.balanceOf(user.address));
        await WETH.connect(user).approve(SEuroOffering.address, toSwap);

        const swap = SEuroOffering.connect(user).swap(WETH_BYTES, toSwap);

        await expect(swap).to.be.revertedWith('err-tok-bal')
        const userSEuroBalance = await SEuro.balanceOf(user.address);
        expect(userSEuroBalance.toString()).to.equal('0');
      });

      it('will swap for any accepted token', async () => {
        const toSwap = ethers.utils.parseEther('1');
        const daiBytes = ethers.utils.formatBytes32String('DAI');
        const DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
        await TokenManager.connect(owner).addAcceptedToken(daiBytes, DAI_ADDRESS, DAI_USD_CL, DAI_CL_DEC);

        await buyToken(user, DAI_ADDRESS, toSwap);
        const Dai = await ethers.getContractAt('IERC20', DAI_ADDRESS);
        const userTokens = await Dai.balanceOf(user.address);
        await Dai.connect(user).approve(SEuroOffering.address, userTokens);

        const expectedEuros = await getDaiToSEuro(userTokens);
        const swap = SEuroOffering.connect(user).swap(daiBytes, userTokens);
        await expect(swap).to.emit(SEuroOffering, 'Swap').withArgs(daiBytes, userTokens, expectedEuros);
        const userSEuroBalance = await SEuro.balanceOf(user.address);
        expect(userSEuroBalance.toString()).to.equal(expectedEuros.toString());
      });

      it('updates the price in bonding curve when bucket is crossed', async () => {
        const amount = await PriceConverter.eurosToEth(BUCKET_SIZE);
        await buyWETH(user, amount);
        await WETH.connect(user).approve(SEuroOffering.address, amount);

        await SEuroOffering.connect(user).swap(WETH_BYTES, amount);

        const bucket = await BondingCurve.currentBucket();
        expect(bucket.index).to.equal(1);
        expect(bucket.price).to.equal(await getBucketPrice(1));
      });

      describe('swapETH', async () => {
        it('swaps for eth', async () => {
          const toSwap = await ethers.utils.parseEther('1');
          const ethBytes = ethers.utils.formatBytes32String('ETH');

          const expectedEuros = await getEthToSEuro(toSwap);
          const swap = SEuroOffering.connect(user).swapETH({ value: toSwap });
          await expect(swap).to.emit(SEuroOffering, 'Swap').withArgs(ethBytes, toSwap, expectedEuros);
          const userSEuroBalance = await SEuro.balanceOf(user.address);
          expect(userSEuroBalance.toString()).to.equal(expectedEuros.toString());
        });

        it('updates the price in bonding curve when bucket is crossed', async () => {
          const amount = await PriceConverter.eurosToEth(BUCKET_SIZE);
          await SEuroOffering.connect(user).swapETH({ value: amount });

          const bucket = await BondingCurve.currentBucket();
          expect(bucket.index).to.equal(1);
          expect(bucket.price).to.equal(await getBucketPrice(1));
        });
      });
    });
  });

  describe('activate', async () => {
    it('is inactive by default', async () => {
      const status = await SEuroOffering.getStatus();
      expect(status._active).to.equal(false);
      expect(status._start).to.equal(0);
      expect(status._stop).to.equal(0);
    });

    it('can be activated by owner', async () => {
      await SEuroOffering.connect(owner).activate();

      const status = await SEuroOffering.getStatus();
      expect(status._active).to.equal(true);
      expect(status._start).to.be.gt(0);
      expect(status._stop).to.equal(0);
    });

    it('cannot be activated by non-owner', async () => {
      const activate = SEuroOffering.connect(user).activate();

      await expect(activate).to.be.revertedWith('Ownable: caller is not the owner');
      const status = await SEuroOffering.getStatus();
      expect(status._active).to.equal(false);
      expect(status._start).to.equal(0);
      expect(status._stop).to.equal(0);
    });
  });

  describe('complete', async () => {
    it('can be completed by owner', async () => {
      await SEuroOffering.connect(owner).activate();
      await SEuroOffering.connect(owner).complete();

      const status = await SEuroOffering.getStatus();
      expect(status._active).to.equal(false);
      expect(status._start).to.be.gt(0);
      expect(status._stop).to.be.gt(0);
      expect(status._stop).to.be.gt(status._start);
    });

    it('cannot be completed by non-owner', async () => {
      await SEuroOffering.connect(owner).activate();
      const complete = SEuroOffering.connect(user).complete();

      await expect(complete).to.be.revertedWith('Ownable: caller is not the owner');
      const status = await SEuroOffering.getStatus();
      expect(status._active).to.equal(true);
      expect(status._start).to.be.gt(0);
      expect(status._stop).to.equal(0);
    });
  });
});