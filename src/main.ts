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

const getKlimaPrice = async function(usdcToToken: ethers.Contract, tokenToKlima: ethers.Contract): Promise<number> {
    const usdcReserves = await usdcToToken.getReserves()
    const klimaReserves = await tokenToKlima.getReserves()

    const usdc = Number(ethers.utils.formatUnits(usdcReserves[0], 6))
    const tokenInUsdcPool = Number(ethers.utils.formatUnits(usdcReserves[1], 18))
    const tokenPrice = usdc / tokenInUsdcPool

    const tokenInKlimaPool = Number(ethers.utils.formatUnits(klimaReserves[0], 18))
    const klima = Number(ethers.utils.formatUnits(klimaReserves[1], 9))
    return tokenInKlimaPool * tokenPrice / klima
}

const getKlimaPrice2 = async function(usdcToKlima: ethers.Contract): Promise<number> {
    const reserves = await usdcToKlima.getReserves()

    const usdc = Number(ethers.utils.formatUnits(reserves[0], 6))
    const klima = Number(ethers.utils.formatUnits(reserves[1], 9))

    return usdc / klima
}

provider.on('block', async (blockNumber) => {
    try {
        console.log(`Block number: ${blockNumber}`);

        // Fetch the reserves of the contracts we are arbing

        // USDC -> BCT -> KLIMA
        const priceKlimaBct = await getKlimaPrice(usdcBct, klimaBct)
        console.log(`USDC/KLIMA price (via BCT): ${priceKlimaBct}`);

        // USDC -> MCO2 -> KLIMA
        // const priceKlimaMco2 = await getKlimaPrice(usdcMco2, klimaMco2)
        // console.log(`USDC/KLIMA price (via MCO2): ${priceKlimaMco2}`);

        // USDC -> KLIMA
        const priceKlima = await getKlimaPrice2(usdcKlima)
        console.log(`USDC/KLIMA price (directly): ${priceKlima}`);


    //   const priceUniswap = reserve0Uni / reserve1Uni;
    //   const priceSushiswap = reserve0Sushi / reserve1Sushi;

    //   const shouldStartEth = priceUniswap < priceSushiswap;
    //   const spread = Math.abs((priceSushiswap / priceUniswap - 1) * 100) - 0.6;

    //   const shouldTrade = spread > (
    //     (shouldStartEth ? ETH_TRADE : DAI_TRADE)
    //      / Number(
    //        ethers.utils.formatEther(uniswapReserves[shouldStartEth ? 1 : 0]),
    //      ));

    //   console.log(`UNISWAP PRICE ${priceUniswap}`);
    //   console.log(`SUSHISWAP PRICE ${priceSushiswap}`);
    //   console.log(`PROFITABLE? ${shouldTrade}`);
    //   console.log(`CURRENT SPREAD: ${(priceSushiswap / priceUniswap - 1) * 100}%`);
    //   console.log(`ABSLUTE SPREAD: ${spread}`);

    //   if (!shouldTrade) return;

    //   const gasLimit = await sushiEthDai.estimateGas.swap(
    //     !shouldStartEth ? DAI_TRADE : 0,
    //     shouldStartEth ? ETH_TRADE : 0,
    //     flashLoanerAddress,
    //     ethers.utils.toUtf8Bytes('1'),
    //   );

    //   const gasPrice = await wallet.getGasPrice();

    //   const gasCost = Number(ethers.utils.formatEther(gasPrice.mul(gasLimit)));

    //   const shouldSendTx = shouldStartEth
    //     ? (gasCost / ETH_TRADE) < spread
    //     : (gasCost / (DAI_TRADE / priceUniswap)) < spread;

    //   // don't trade if gasCost is higher than the spread
    //   if (!shouldSendTx) return;

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
        console.error(`Failed to arb: ${err}`);
    }
});