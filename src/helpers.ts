import { BigNumber, ethers } from 'ethers';

// Copied from https://github.com/sushiswap/sushiswap/blob/45da97206358039039883c4a99c005bb8a4bef0c/contracts/uniswapv2/libraries/UniswapV2Library.sol#L48-L51
export const getAmountOut = function(amountIn: BigNumber, reserveIn: BigNumber, reserveOut: BigNumber): BigNumber {
    const amountInWithFee = amountIn.mul(997)
    const numerator = amountInWithFee.mul(reserveOut)
    const denominator = reserveIn.mul(1000).add(amountInWithFee)
    return numerator.div(denominator)
}

export const getKlima = async function(amountIn: BigNumber, usdcToToken: ethers.Contract, tokenToKlima: ethers.Contract): Promise<BigNumber> {
    const usdcReserves = await usdcToToken.getReserves()
    const tokenAmount = getAmountOut(amountIn, usdcReserves[0], usdcReserves[1])
    const klimaReserves = await tokenToKlima.getReserves()
    return getAmountOut(tokenAmount, klimaReserves[0], klimaReserves[1])
}

export const getUsdc = async function(amountIn: BigNumber, usdcToToken: ethers.Contract, tokenToKlima: ethers.Contract): Promise<BigNumber> {
    const klimaReserves = await tokenToKlima.getReserves()
    const tokenAmount = getAmountOut(amountIn, klimaReserves[1], klimaReserves[0])
    const usdcReserves = await usdcToToken.getReserves()
    return getAmountOut(tokenAmount, usdcReserves[1], usdcReserves[0])
}

interface Route {
    klimaAmount: BigNumber
    usdcToToken: ethers.Contract
    tokenToKlima: ethers.Contract
    path: string[]
}

interface Result {
    netResult: BigNumber
    path: string[]
}

export const arbitrageCheck = async function(routes: Route[], debt: BigNumber): Promise<Result> {
    if (routes.length < 2)
        throw Error('Need multiple routes to check for arbitrage')

    // Sort arrays and check for arbitrage opportunity between the
    // first and last routes.
    routes.sort(function( a , b) {
        if (a.klimaAmount > b.klimaAmount) return 1
        if (a.klimaAmount < b.klimaAmount) return -1
        return 0
    })

    const last = routes.length - 1
    // At this point we know that the last pool in the array gives the most
    // KLIMA for usdcToBorrow so we use that KLIMA amount to check how much
    // USDC the other route can give us.
    const gotUsdc = await getUsdc(
        routes[last].klimaAmount,
        routes[0].usdcToToken,
        routes[0].tokenToKlima
    )
    const netResult = gotUsdc.sub(debt)

    if (netResult.lte(0)) {
        // Not today
        return {
            netResult,
            path: [],
        }
    }

    return {
        netResult,
        path: [
            routes[last].path[0],
            routes[last].path[1],
            routes[last].path[2],
            routes[0].path[1],
            routes[0].path[0],
        ],
    }
}