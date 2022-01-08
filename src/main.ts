import { ChainId, Pair, Token } from '@sushiswap/sdk'
import { ethers } from 'ethers';

import { ConfigService } from './config'
import { getKlima, getKlima2, getUsdc, getUsdc2 } from './helpers';


const config = new ConfigService()
const provider = new ethers.providers.JsonRpcProvider(config.get('NODE_API_URL'));
const wallet = new ethers.Wallet(config.get('PRIVATE_KEY'), provider);


/************************************************
 *  ERC20 CONTRACTS
 ***********************************************/

const bct = new Token(ChainId.MATIC, config.get('BCT_ADDRESS'), 18, 'BCT')
const mco2 = new Token(ChainId.MATIC, config.get('MCO2_ADDRESS'), 18, 'MCO2')
const usdc = new Token(ChainId.MATIC, config.get('USDC_ADDRESS'), 6, 'USDC')
const klima = new Token(ChainId.MATIC, config.get('KLIMA_ADDRESS'), 18, 'KLIMA')


/************************************************
 *  LP ADDRESSES
 ***********************************************/

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


/************************************************
 *  ROUTES TO ARB
 ***********************************************/

 const pairAbi = [
    'function getReserves() view returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast)',
]
const abi = new ethers.utils.Interface(pairAbi)
// USDC -> BCT -> KLIMA
const usdcBct = new ethers.Contract(usdcBctAddress, abi, wallet)
const klimaBct = new ethers.Contract(klimaBctAddress, abi, wallet)
// USDC -> MCO2 -> KLIMA
const usdcMco2 = new ethers.Contract(usdcMco2Address, abi, wallet)
const klimaMco2 = new ethers.Contract(klimaMco2Address, abi, wallet)
// USDC -> KLIMA
const usdcKlima = new ethers.Contract(usdcKlimaAddress, abi, wallet)


/************************************************
 *  MAIN
 ***********************************************/

const usdcHumanReadble = 200;
const usdcToBorrow = usdcHumanReadble * 1e6;

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