import { ChainId, Pair, Token } from '@sushiswap/sdk'
import { ethers } from 'ethers'
import { Contract, Provider } from 'ethers-multicall'

import { config } from './config'
import { arbitrageCheck, checkReserves, Route } from './helpers'


const provider = new ethers.providers.JsonRpcProvider(config.get('NODE_API_URL'))
const multicallProvider = new Provider(provider)
multicallProvider.init()
const wallet = new ethers.Wallet(config.get('PRIVATE_KEY'), provider)
console.log(`Keeper address: ${wallet.address}`)


/************************************************
 *  ERC20 CONTRACTS
 ***********************************************/

const bct = new Token(ChainId.MATIC, config.get('BCT_ADDRESS'), 18, 'BCT')
const mco2 = new Token(ChainId.MATIC, config.get('MCO2_ADDRESS'), 18, 'MCO2')
const usdc = new Token(ChainId.MATIC, config.get('USDC_ADDRESS'), 6, 'USDC')
const klima = new Token(ChainId.MATIC, config.get('KLIMA_ADDRESS'), 9, 'KLIMA')

console.log(`USDC: ${usdc.address}`)
console.log(`KLIMA: ${klima.address}`)
console.log(`BCT: ${bct.address}`)
console.log(`MCO2: ${mco2.address}`)


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

const uniPairAbi = [
    'function getReserves() view returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast)',
]
// USDC -> BCT -> KLIMA
const usdcBct = new Contract(usdcBctAddress, uniPairAbi)
const klimaBct = new Contract(klimaBctAddress, uniPairAbi)
// USDC -> MCO2 -> KLIMA
const usdcMco2 = new Contract(usdcMco2Address, uniPairAbi)
const klimaMco2 = new Contract(klimaMco2Address, uniPairAbi)
const calls = [
    usdcBct.getReserves(), 
    klimaBct.getReserves(), 
    usdcMco2.getReserves(), 
    klimaMco2.getReserves(),
]


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
const usdcHumanReadble = config.get('BORROWED_AMOUNT')
const usdcToBorrow = ethers.utils.parseUnits(usdcHumanReadble, 6)
// Premium withheld by AAVE
// https://github.com/aave/protocol-v2/blob/30a2a19f6d28b6fb8d26fc07568ca0f2918f4070/contracts/protocol/lendingpool/LendingPool.sol#L502
const premium = usdcToBorrow.mul(9).div(10000)
const totalDebt = usdcToBorrow.add(premium)
console.log(`USDC to borrow: ${usdcHumanReadble}`)


/************************************************
 *  MAIN
 ***********************************************/

let locked = false

provider.on('block', async (blockNumber) => {
    try {
        // Acquire lock so we won't be submitting multiple transactions across adjacent
        // blocks once we spot an arbitrage opportunity.
        if (locked) {
            console.log(`#${blockNumber}: Ignoring this block as there is already an in-flight request`)
            return
        } else {
            locked = true
        }

        // Gather reserves from all Klima pools
        const klimaPools: Route[] = []
        const [
            usdcBctResp,
            klimaBctResp,
            usdcMco2Resp,
            klimaMco2Resp,
        ] = await multicallProvider.all(calls);

        // USDC -> BCT -> KLIMA
        checkReserves(
            usdcToBorrow,
            usdcBctResp,
            klimaBctResp,
            bct.address,
            klimaPools,
        )

        // USDC -> MCO2 -> KLIMA
        checkReserves(
            usdcToBorrow,
            usdcMco2Resp,
            klimaMco2Resp,
            mco2.address,
            klimaPools,
        )

        // Check whether we can execute an arbitrage
        const { netResult, path } = arbitrageCheck(klimaPools, totalDebt)
        console.log(`#${blockNumber}: Got USDC return: ${netResult.div(1e6)}`)
        if (netResult.lte(0)) {
            return
        }
        console.log(`#${blockNumber}: Path: ${JSON.stringify(path)}`)

        // TODO: Read gas limit dynamically
        // const gasLimit = BigNumber.from(600000)
        // const gasPrice = await wallet.getGasPrice()
        // TODO: Sum gas costs with net result to ensure we are
        // still profitable
        // const gasCost = Number(ethers.utils.formatEther(gasPrice.mul(gasLimit)))

        // Execute flasloan request
        const tx = await loaner.flashloan(
            config.get('USDC_ADDRESS'),
            usdcToBorrow,
            path,
        )
        await tx.wait()

        locked = false
        console.log(`#${blockNumber}: Flashloan request ${tx.hash} successfully mined`)
    } catch (err) {
        locked = false
        console.error(`#${blockNumber}: Failed to execute flasloan request: ${err}`)
    }
});
