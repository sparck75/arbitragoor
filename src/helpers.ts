import { ethers } from 'ethers';

// Copied from https://github.com/sushiswap/sushiswap/blob/45da97206358039039883c4a99c005bb8a4bef0c/contracts/uniswapv2/libraries/UniswapV2Library.sol#L48-L51
export const getAmountOut = function(amountIn: number, reserveIn: number, reserveOut: number): number {
    const amountInWithFee = amountIn * 997
    const numerator = amountInWithFee * reserveOut
    const denominator = (reserveIn * 1000) + amountInWithFee
    return numerator / denominator
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

interface Pool {
    klima: number
    usdcToToken: ethers.Contract
    tokenToKlima: ethers.Contract
}

interface Result {
    netResult: number
    path: string[]
}

export const arbitrageCheck = async function(pools: Pool[], usdcToBorrow: number): Promise<Result> {
    if (pools.length < 2)
        throw Error('Need multiple pools to check for arbitrage')

    // Sort arrays and check for arbitrage opportunity between the
    // first and last pools.
    pools.sort(function( a , b) {
        if (a.klima > b.klima) return 1
        if (a.klima < b.klima) return -1
        return 0
    })

    const last = pools.length - 1
    // At this point we know that the last pool in the array gives the most
    // KLIMA for usdcToBorrow so we use that KLIMA amount to check how much
    // USDC the other route can give us.
    const netResult = await getUsdc(
        pools[last].klima,
        pools[0].usdcToToken,
        pools[0].tokenToKlima
    ) - usdcToBorrow

    if (netResult <= 0) {
        // Not today
        return {
            netResult,
            path: [],
        }
    }

    return {
        netResult,
        path: [
            pools[last].usdcToToken.address,
            pools[last].tokenToKlima.address,
            pools[0].tokenToKlima.address,
            pools[0].usdcToToken.address,
        ],
    }
}