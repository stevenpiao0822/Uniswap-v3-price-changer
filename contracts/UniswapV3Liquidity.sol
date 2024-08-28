pragma solidity 0.7.6;

import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import "@uniswap/v3-periphery/contracts/libraries/LiquidityAmounts.sol";

contract UniswapV3Liquidity {
    function getSqrtRatioAtTick(int24 tick) internal pure returns (uint160 sqrtPriceX96) {
        sqrtPriceX96 = TickMath.getSqrtRatioAtTick(tick);
    }

    // This seems to be the function you're looking for
    function getAmountsForLiquidity(
        int24 currentTick,
        int24 lowerTick,
        int24 upperTick,
        uint128 liquidity
    ) external pure returns (uint256 amount0, uint256 amount1) {
        uint160 currentSqrtPriceX96 = getSqrtRatioAtTick(currentTick);
        uint160 lowerSqrtPriceX96 = getSqrtRatioAtTick(lowerTick);
        uint160 upperSqrtPriceX96 = getSqrtRatioAtTick(upperTick);

        (amount0, amount1) = LiquidityAmounts.getAmountsForLiquidity(
            currentSqrtPriceX96,
            lowerSqrtPriceX96,
            upperSqrtPriceX96,
            liquidity            
        );
    }
}
