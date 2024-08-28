import {
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import hre, { ethers } from "hardhat";
import { BigNumberish } from "ethers";
import { IUniswapV3Pool } from "../typechain-types";

// constants
const UNI_V3_FACTORY_ADDRESS = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
const UNI_V3_ROUTER_ADDRESS = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
const UNI_V3_NONFUNGIBLE_POSITION_MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";

const tickToPrice = (tick: number) => {
  return 1.0001 ** parseFloat(tick.toString());
}

const priceToTick = (price: number) => {
  return Math.round(Math.log(price) / Math.log(1.0001));
}

const getCurrentPrice = async (pool: IUniswapV3Pool) => {
  const slot0 = await pool.slot0();
  return tickToPrice(parseFloat(slot0.tick.toString()));
}

describe("Uniswap v3 Pool Price", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployTokensAndSetupUniswapV3Pool() {
    // Contracts are deployed using the first signer/account by default
    const [deployer, bot] = await hre.ethers.getSigners();

    // deploy UniswapV3Liquidity
    const UniswapV3Liquidity = await hre.ethers.getContractFactory("UniswapV3Liquidity");
    const uniswapV3Liquidity = await UniswapV3Liquidity.deploy();

    // deploy tokens
    const MockToken = await hre.ethers.getContractFactory("MockToken");
    let token0 = await MockToken.deploy("Token0", "T0");
    let token1 = await MockToken.deploy("Token1", "T1");

    // mint tokens
    await token0.mint(deployer.address, ethers.parseEther("10000"));
    await token1.mint(deployer.address, ethers.parseEther("10000"));
    await token0.mint(bot.address, ethers.parseEther("10000"));
    await token1.mint(bot.address, ethers.parseEther("10000"));

    let token0Addr = await token0.getAddress();
    let token1Addr = await token1.getAddress();
    if (token0Addr > token1Addr) {
      [token0, token1] = [token1, token0];
      [token0Addr, token1Addr] = [token1Addr, token0Addr];
    }

    // create pool
    const factory = await hre.ethers.getContractAt("IUniswapV3Factory", UNI_V3_FACTORY_ADDRESS);

    await factory.createPool(token0Addr, token1Addr, 10000);

    const poolAddress = await factory.getPool(token0Addr, token1Addr, 10000);
    const pool = await hre.ethers.getContractAt("IUniswapV3Pool", poolAddress);
    await pool.initialize(79228162514264337593543950336n); // sqrtPriceX96 for price 1

    // add liquidity
    const positionManager = await hre.ethers.getContractAt("INonfungiblePositionManager", UNI_V3_NONFUNGIBLE_POSITION_MANAGER);
    await token0.approve(await positionManager.getAddress(), ethers.MaxUint256);
    await token1.approve(await positionManager.getAddress(), ethers.MaxUint256);

    const addLiquidity = async (tickLower: number, tickUpper: number, amount0Desired: BigNumberish, amount1Desired: BigNumberish) => {
      await positionManager.mint({
        token0: token0Addr,
        token1: token1Addr,
        fee: 10000,
        tickLower,
        tickUpper,
        amount0Desired,
        amount1Desired,
        amount0Min: 0,
        amount1Min: 0,
        recipient: deployer.address,
        deadline: Math.floor(Date.now() / 1000) + 1000,
      });
    }

    await addLiquidity(-1000, 1000, ethers.parseEther("1000"), ethers.parseEther("1000"));
    await addLiquidity(-1000, 200, ethers.parseEther("1000"), ethers.parseEther("1000"));
    await addLiquidity(-200, 1000, ethers.parseEther("1000"), ethers.parseEther("1000"));
    await addLiquidity(600, 6000, ethers.parseEther("5000"), ethers.parseEther("5000"));
    await addLiquidity(-6000, -600, ethers.parseEther("5000"), ethers.parseEther("5000"));

    return { uniswapV3Liquidity, token0, token1, pool, deployer, bot };
  }

  describe("Price Manipulation", function () {
    it("Should move the price upward", async function () {
      const { uniswapV3Liquidity, token0, token1, pool, bot } = await loadFixture(deployTokensAndSetupUniswapV3Pool);

      const token0Addr = await token0.getAddress();
      const token1Addr = await token1.getAddress();

      const slot0 = await pool.slot0();
      const tickSpacing = parseFloat((await pool.tickSpacing()).toString());
      const currentTick = parseFloat(slot0.tick.toString());
      const targetPrice = 1.5;
      const targetTick = priceToTick(targetPrice);

      let amount = 0n;
      let tickNext = Math.ceil(currentTick / tickSpacing) * tickSpacing;
      let activeLiquidity = await pool.liquidity();
      while (tickNext < targetTick) {
        const tickInfo = await pool.ticks(tickNext);
        activeLiquidity += tickInfo.liquidityNet;
        if (activeLiquidity > 0) {
          const amounts = await uniswapV3Liquidity.getAmountsForLiquidity(currentTick, tickNext, Math.min(tickNext + tickSpacing, targetTick), activeLiquidity);
          amount += amounts[0];
        }
        tickNext += tickSpacing;
      }

      console.log('Price before swap', await getCurrentPrice(pool));
      console.log(`Swapping ${ethers.formatEther(amount)} ${await token1.name()} for ${await token0.name()}`);

      await token1.connect(bot).approve(UNI_V3_ROUTER_ADDRESS, ethers.parseEther("10000"));

      const router = await hre.ethers.getContractAt("ISwapRouter", UNI_V3_ROUTER_ADDRESS);
      await router.connect(bot).exactOutputSingle({
        tokenIn: token1Addr,
        tokenOut: token0Addr,
        fee: 10000,
        recipient: bot.address,
        deadline: Math.floor(Date.now() / 1000) + 1000,
        amountOut: amount,
        amountInMaximum: ethers.parseEther("10000"),
        sqrtPriceLimitX96: 0,
      });

      console.log('Price after swap', await getCurrentPrice(pool));
    });

    it("Should move the price downward", async function () {
      const { uniswapV3Liquidity, token0, token1, pool, bot } = await loadFixture(deployTokensAndSetupUniswapV3Pool);

      const token0Addr = await token0.getAddress();
      const token1Addr = await token1.getAddress();

      const slot0 = await pool.slot0();
      const tickSpacing = parseFloat((await pool.tickSpacing()).toString());
      const currentTick = parseFloat(slot0.tick.toString());
      const targetPrice = 0.66;
      const targetTick = priceToTick(targetPrice);

      let amount = 0n;
      let tickNext = Math.floor(currentTick / tickSpacing) * tickSpacing;
      let activeLiquidity = await pool.liquidity();
      while (tickNext > targetTick) {
        const tickInfo = await pool.ticks(tickNext);
        activeLiquidity -= tickInfo.liquidityNet;
        if (activeLiquidity > 0) {
          const amounts = await uniswapV3Liquidity.getAmountsForLiquidity(currentTick, Math.max(tickNext - tickSpacing, targetTick), tickNext, activeLiquidity);
          amount += amounts[1];
        }
        tickNext -= tickSpacing;
      }

      console.log('Price before swap', await getCurrentPrice(pool));
      console.log(`Swapping ${ethers.formatEther(amount)} ${await token0.name()} for ${await token1.name()}`);

      await token0.connect(bot).approve(UNI_V3_ROUTER_ADDRESS, ethers.parseEther("10000"));

      const router = await hre.ethers.getContractAt("ISwapRouter", UNI_V3_ROUTER_ADDRESS);
      await router.connect(bot).exactOutputSingle({
        tokenIn: token0Addr,
        tokenOut: token1Addr,
        fee: 10000,
        recipient: bot.address,
        deadline: Math.floor(Date.now() / 1000) + 1000,
        amountOut: amount,
        amountInMaximum: ethers.parseEther("10000"),
        sqrtPriceLimitX96: 0,
      });

      console.log('Price after swap', await getCurrentPrice(pool));
    });
  });
});
