import { ethers } from 'ethers';

// Copied from https://github.com/sushiswap/sushiswap/blob/45da97206358039039883c4a99c005bb8a4bef0c/contracts/uniswapv2/libraries/UniswapV2Library.sol#L48-L51
export const getAmountOut = function(amountIn: number, reserveIn: number, reserveOut: number): number {
    const amountInWithFee = amountIn * 997;
    const numerator = amountInWithFee * reserveOut;
    const denominator = (reserveIn * 1000) + amountInWithFee;
    return numerator / denominator;
}

export const getKlima = async function(amountIn: number, usdcToToken: ethers.Contract, tokenToKlima: ethers.Contract): Promise<number> {
    const usdcReserves = await usdcToToken.getReserves()
    const tokenAmount = getAmountOut(amountIn, usdcReserves[0], usdcReserves[1])
    const klimaReserves = await tokenToKlima.getReserves()
    return getAmountOut(tokenAmount, klimaReserves[0], klimaReserves[1])
}

export const getUsdc = async function(amountIn: number, usdcToToken: ethers.Contract, tokenToKlima: ethers.Contract): Promise<number> {
    const klimaReserves = await tokenToKlima.getReserves()
    const tokenAmount = getAmountOut(amountIn, klimaReserves[1], klimaReserves[0])
    const usdcReserves = await usdcToToken.getReserves()
    return getAmountOut(tokenAmount, usdcReserves[1], usdcReserves[0])
}

export const getKlima2 = async function(amountIn: number, usdcToKlima: ethers.Contract): Promise<number> {
    const reserves = await usdcToKlima.getReserves()
    return getAmountOut(amountIn, reserves[0], reserves[1]);
}

export const getUsdc2 = async function(amountIn: number, usdcToKlima: ethers.Contract): Promise<number> {
    const reserves = await usdcToKlima.getReserves()
    return getAmountOut(amountIn, reserves[1], reserves[0]);
}
