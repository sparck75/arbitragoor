import { ChainId, Pair, Token } from '@sushiswap/sdk'
import { ethers } from 'ethers'

import { ConfigService } from './config'
import { arbitrageCheck, getKlima } from './helpers'


const config = new ConfigService()
const provider = new ethers.providers.JsonRpcProvider(config.get('NODE_API_URL'))
const wallet = new ethers.Wallet(config.get('PRIVATE_KEY'), provider)


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

console.log(`USDC/BCT: ${usdcBctAddress}`)
console.log(`USDC/MCO2: ${usdcMco2Address}`)
console.log(`KLIMA/BCT: ${klimaBctAddress}`)
console.log(`KLIMA/MCO2: ${klimaMco2Address}`)


/************************************************
 *  ROUTES TO ARB
 ***********************************************/

const uniPairAbi = new ethers.utils.Interface([
    'function getReserves() view returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast)',
])
// USDC -> BCT -> KLIMA
const usdcBct = new ethers.Contract(usdcBctAddress, uniPairAbi, wallet)
const klimaBct = new ethers.Contract(klimaBctAddress, uniPairAbi, wallet)
// USDC -> MCO2 -> KLIMA
const usdcMco2 = new ethers.Contract(usdcMco2Address, uniPairAbi, wallet)
const klimaMco2 = new ethers.Contract(klimaMco2Address, uniPairAbi, wallet)


/************************************************
 *  FLASHLOAN INTERFACE
 ***********************************************/

const flashloanAbi = new ethers.utils.Interface([
    'function flashloan(address asset, uint256 amount, address[] calldata path) public',
])
const flashloanAddress = config.get('FLASHLOAN_ADDRESS')
const loaner = new ethers.Contract(flashloanAddress, flashloanAbi, wallet)

// It may be worth making this dynamic in the future based
// on pool volume but I suspect a more optimal solution in
// terms of speed is to run multiple bots with different sizes
// to avoid spending the extra time needed to figure the right
// value out.
const usdcHumanReadble = Number(config.get('BORROWED_AMOUNT'))
const usdcToBorrow = usdcHumanReadble * 1e6
// Premium withheld by AAVE
// https://github.com/aave/protocol-v2/blob/30a2a19f6d28b6fb8d26fc07568ca0f2918f4070/contracts/protocol/lendingpool/LendingPool.sol#L502
const premium = usdcToBorrow * 9 / 10000
const totalDebt = usdcToBorrow + premium
console.log(`USDC to borrow: ${usdcHumanReadble}`)


/************************************************
 *  MAIN
 ***********************************************/

provider.on('block', async (blockNumber) => {
    try {
        // TODO: Guard in case we executed a swap X seconds ago
        console.log(`Block number: ${blockNumber}`)

        // Gather reserves from all Klima pools
        const klimaPools = []
        // USDC -> BCT -> KLIMA
        const klimaViaBct = await getKlima(usdcToBorrow, usdcBct, klimaBct)
        klimaPools.push({klima: klimaViaBct, usdcToToken: usdcBct, tokenToKlima: klimaBct})
        // USDC -> MCO2 -> KLIMA
        const klimaViaMco2 = await getKlima(usdcToBorrow, usdcMco2, klimaMco2)
        klimaPools.push({klima: klimaViaMco2, usdcToToken: usdcMco2, tokenToKlima: klimaMco2})

        // Check whether we can execute an arbitrage
        const { netResult, path } = await arbitrageCheck(klimaPools, totalDebt)
        console.log(`Got USDC return: ${netResult / 1e6}`)
        if (netResult <= 0) {
            return
        }

        const gasLimit = await loaner.estimateGas.flashloan(
            config.get('USDC_ADDRESS'),
            usdcToBorrow,
            path,
        )
        const gasPrice = await wallet.getGasPrice();
        // TODO: Sum gas costs with net result to ensure we are
        // still profitable
        const gasCost = Number(ethers.utils.formatEther(gasPrice.mul(gasLimit)))

        const options = {
            gasPrice,
            gasLimit,
        }
        const tx = await loaner.flashloan(
            config.get('USDC_ADDRESS'),
            usdcToBorrow,
            path,
            options
        )
        await tx.wait()

        console.log(`Flashloan request ${tx.hash} successfully mined`)
    } catch (err) {
        console.error(`Failed to execute flasloan request: ${err}`)
    }
});
