import { BigNumber } from '@ethersproject/bignumber'
import { ChainId, CurrencyAmount, Pair, Price, Route, Token } from '@sushiswap/sdk'
import { ethers } from 'ethers';

import { ConfigService } from './config'

const pairAbi = [
    "function getReserves() view returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast)",
]

const config = new ConfigService()
const provider = new ethers.providers.JsonRpcProvider(config.get('NODE_API_URL'));
const wallet = new ethers.Wallet(config.get('PRIVATE_KEY'), provider);

const bct = new Token(ChainId.MATIC, config.get('BCT_ADDRESS'), 18, 'BCT')
const mco2 = new Token(ChainId.MATIC, config.get('MCO2_ADDRESS'), 18, 'MCO2')
const usdc = new Token(ChainId.MATIC, config.get('USDC_ADDRESS'), 6, 'USDC')
const klima = new Token(ChainId.MATIC, config.get('KLIMA_ADDRESS'), 18, 'KLIMA')

// LP addresses
const usdcBctAddress = Pair.getAddress(usdc, bct)
const usdcMco2Address = Pair.getAddress(usdc, mco2)
const klimaBctAddress = Pair.getAddress(klima, bct)
const klimaMco2Address = Pair.getAddress(klima, mco2)
const usdcKlimaAddress = Pair.getAddress(usdc, klima)

console.log(`USDC/BCT: ${usdcBctAddress}`)
console.log(`USDC/MCO2: ${usdcMco2Address}`)
console.log(`KLIMA/BCT: ${klimaBctAddress}`)
console.log(`KLIMA/MCO2: ${klimaMco2Address}`)
console.log(`KLIMA/USDC: ${usdcKlimaAddress}`)



// Routes

// const usdcBctPair = new Pair(CurrencyAmount.fromRawAmount(bct, '1'), CurrencyAmount.fromRawAmount(usdc, '1'))
// const usdcMco2Pair = new Pair(CurrencyAmount.fromRawAmount(mco2, '1'), CurrencyAmount.fromRawAmount(usdc, '1'))
// const klimaBctPair = new Pair(CurrencyAmount.fromRawAmount(bct, '1'), CurrencyAmount.fromRawAmount(klima, '1'))
// const klimaMco2Pair = new Pair(CurrencyAmount.fromRawAmount(mco2, '1'), CurrencyAmount.fromRawAmount(klima, '1'))

// const usdcKlimaBctRoute = new Route([usdcBctPair, klimaBctPair], usdc, klima)
// const klimaUsdcBctRoute = new Route([klimaBctPair, usdcBctPair], klima, usdc)
// const usdcKlimaMco2Route = new Route([usdcMco2Pair, klimaMco2Pair], usdc, klima)
// const klimaUsdcMco2Route = new Route([klimaMco2Pair, usdcMco2Pair], klima, usdc)

// console.log(`USDC->KLIMA via BCT: ${usdcKlimaBctRoute.midPrice.toFixed(18)}`)
// console.log(`KLIMA->USDC via BCT: ${klimaUsdcBctRoute.midPrice}`)
// console.log(`USDC->KLIMA via MCO2: ${usdcKlimaMco2Route.midPrice}`)
// console.log(`KLIMA->USDC via MCO2: ${klimaUsdcMco2Route.midPrice}`)


const abi = new ethers.utils.Interface(pairAbi)

// USDC -> BCT -> KLIMA
const usdcBct = new ethers.Contract(usdcBctAddress, abi, wallet)
const klimaBct = new ethers.Contract(klimaBctAddress, abi, wallet)

// USDC -> MCO2 -> KLIMA
const usdcMco2 = new ethers.Contract(usdcMco2Address, abi, wallet)
const klimaMco2 = new ethers.Contract(klimaMco2Address, abi, wallet)

// USDC -> KLIMA
const usdcKlima = new ethers.Contract(usdcKlimaAddress, abi, wallet)

const usdcHumanReadble = 1000;
const usdcToBorrow = usdcHumanReadble * 1e6;

// Copied from https://github.com/sushiswap/sushiswap/blob/45da97206358039039883c4a99c005bb8a4bef0c/contracts/uniswapv2/libraries/UniswapV2Library.sol#L48-L51
const getAmountOut = function(amountIn: number, reserveIn: number, reserveOut: number): number {
    const amountInWithFee = amountIn * 997;
    const numerator = amountInWithFee * reserveOut;
    const denominator = (reserveIn * 1000) + amountInWithFee;
    return numerator / denominator;
}

const getKlima = async function(amountIn: number, usdcToToken: ethers.Contract, tokenToKlima: ethers.Contract): Promise<number> {
    const usdcReserves = await usdcToToken.getReserves()
    const tokenAmount = getAmountOut(amountIn, usdcReserves[0], usdcReserves[1])
    const klimaReserves = await tokenToKlima.getReserves()
    return getAmountOut(tokenAmount, klimaReserves[0], klimaReserves[1])
}

const getUsdc = async function(amountIn: number, usdcToToken: ethers.Contract, tokenToKlima: ethers.Contract): Promise<number> {
    const klimaReserves = await tokenToKlima.getReserves()
    const tokenAmount = getAmountOut(amountIn, klimaReserves[1], klimaReserves[0])
    const usdcReserves = await usdcToToken.getReserves()
    return getAmountOut(tokenAmount, usdcReserves[1], usdcReserves[0])
}

const getKlima2 = async function(amountIn: number, usdcToKlima: ethers.Contract): Promise<number> {
    const reserves = await usdcToKlima.getReserves()
    return getAmountOut(amountIn, reserves[0], reserves[1]);
}

const getUsdc2 = async function(amountIn: number, usdcToKlima: ethers.Contract): Promise<number> {
    const reserves = await usdcToKlima.getReserves()
    return getAmountOut(amountIn, reserves[1], reserves[0]);
}

provider.on('block', async (blockNumber) => {
    try {
        // TODO: Guard in case we executed a swap X seconds ago
        console.log(`Block number: ${blockNumber}`);

        // USDC -> BCT -> KLIMA
        const klimaViaBct = await getKlima(usdcToBorrow, usdcBct, klimaBct)

        // USDC -> MCO2 -> KLIMA
        // const klimaViaMco2 = await getKlima(usdcToBorrow, usdcMco2, klimaMco2)
        // console.log(`[MCO2] USDC ${usdcHumanReadble} -> KLIMA ${klimaViaMco2 / 1e9}`);

        // USDC -> KLIMA
        const klimaDirect = await getKlima2(usdcToBorrow, usdcKlima)

        let netResult = -usdcToBorrow;
        if (klimaViaBct > klimaDirect) {
            netResult += await getUsdc2(klimaViaBct, usdcKlima)
        } else if (klimaDirect > klimaViaBct) {
            netResult += await getUsdc(klimaDirect, usdcBct, klimaBct)
        }
        console.log(`Got USDC return: ${netResult / 1e6}`)
        if (netResult <= 0) {
            // Not today
            return
        }

        // TODO: Construct path and execute flashloan request

        //   const options = {
        //     gasPrice,
        //     gasLimit,
        //   };
        //   const tx = await sushiEthDai.swap(
        //     !shouldStartEth ? DAI_TRADE : 0,
        //     shouldStartEth ? ETH_TRADE : 0,
        //     flashLoanerAddress,
        //     ethers.utils.toUtf8Bytes('1'), options,
        //   );

        //   console.log('ARBITRAGE EXECUTED! PENDING TX TO BE MINED');
        //   console.log(tx);

        //   await tx.wait();

        //   console.log('SUCCESS! TX MINED');
    } catch (err) {
        console.error(`Failed to execute arbitrage request: ${err}`);
    }
});