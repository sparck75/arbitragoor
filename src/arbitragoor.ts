import { ChainId, Pair, Token } from '@sushiswap/sdk'
import { BigNumber, Contract, ethers, providers, Wallet } from 'ethers'
import { Contract as MulticallContract, Provider as MulticallProvider } from 'ethers-multicall'

import { config } from './config'
import { arbitrageCheck, checkReserves, Route } from './helpers'

export default class Arbitragoor {
    // RPC providers
    private provider: providers.StaticJsonRpcProvider
    private multicallProvider: MulticallProvider

    // Wallet to execute arbitrage requests
    private wallet: Wallet

    // Amount to borrow
    private usdcToBorrow: BigNumber
    // Amount borrowed + AAVE fee
    private totalDebt: BigNumber

    // Calls provided to the multicall contract
    private calls: any[]
    // Flashloan contract
    private loaner: Contract
    // UniswapPair v2 ABI
    private uniPairAbi: string[]

    // Whether the class is initialized
    private isInitialized: boolean = false

    // LP addresses
    private usdcBctAddress: string
    private klimaBctAddress: string
    private usdcMco2Address: string
    private klimaMco2Address: string

    // Booleans used to dynamically discover token reserves
    // in LP contracts
    private usdcBctReverse: boolean
    private usdcMco2Reverse: boolean
    private klimaBctReverse: boolean
    private klimaMco2Reverse: boolean

    constructor() {
        this.provider = new providers.StaticJsonRpcProvider(config.get('NODE_API_URL'))
        this.multicallProvider = new MulticallProvider(this.provider)
        this.wallet = new ethers.Wallet(config.get('PRIVATE_KEY'), this.provider)
        console.log(`Keeper address: ${this.wallet.address}`)

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

        this.usdcBctAddress = Pair.getAddress(usdc, bct)
        this.klimaBctAddress = Pair.getAddress(klima, bct)
        // For some reason the QuickSwap SDK does not return
        // the proper pair address so override here via env variables
        this.usdcMco2Address = config.get('USDC_MCO2_ADDRESS')
        this.klimaMco2Address = config.get('KLIMA_MCO2_ADDRESS')
        console.log(`USDC/BCT: ${this.usdcBctAddress}`)
        console.log(`USDC/MCO2: ${this.usdcMco2Address}`)
        console.log(`KLIMA/BCT: ${this.klimaBctAddress}`)
        console.log(`KLIMA/MCO2: ${this.klimaMco2Address}`)

        /************************************************
         *  ROUTES TO ARB
         ***********************************************/

        this.uniPairAbi = [
            'function getReserves() view returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast)',
            'function token0() view returns (address)',
        ]
        // USDC -> BCT -> KLIMA
        const usdcBct = new MulticallContract(this.usdcBctAddress, this.uniPairAbi)
        const klimaBct = new MulticallContract(this.klimaBctAddress, this.uniPairAbi)
        // USDC -> MCO2 -> KLIMA
        const usdcMco2 = new MulticallContract(this.usdcMco2Address, this.uniPairAbi)
        const klimaMco2 = new MulticallContract(this.klimaMco2Address, this.uniPairAbi)
        this.calls = [
            usdcBct.getReserves(),
            klimaBct.getReserves(),
            usdcMco2.getReserves(),
            klimaMco2.getReserves(),
        ]

        /************************************************
         *  FLASHLOAN INTERFACE
         ***********************************************/

        const flashloanAbi = new ethers.utils.Interface([
            'function flashloan(address asset, uint256 amount, bool zeroToOne, address[] calldata path0, address[] calldata path1) public',
        ])
        const flashloanAddress = config.get('FLASHLOAN_ADDRESS')
        this.loaner = new ethers.Contract(flashloanAddress, flashloanAbi, this.wallet)

        // It may be worth making this dynamic in the future based
        // on pool volume but I suspect a more optimal solution in
        // terms of speed is to run multiple bots with different sizes
        // to avoid spending the extra time needed to figure the right
        // value out.
        const usdcHumanReadble = config.get('BORROWED_AMOUNT')
        this.usdcToBorrow = ethers.utils.parseUnits(usdcHumanReadble, 6)
        // Premium withheld by AAVE
        // https://github.com/aave/protocol-v2/blob/30a2a19f6d28b6fb8d26fc07568ca0f2918f4070/contracts/protocol/lendingpool/LendingPool.sol#L502
        const premium = this.usdcToBorrow.mul(9).div(10000)
        this.totalDebt = this.usdcToBorrow.add(premium)
        console.log(`USDC to borrow: ${usdcHumanReadble}`)
    }

    public async init(): Promise<void> {
        // Initialize multicall provider to avoid having to
        // configure a chain id
        await this.multicallProvider.init()

        // Initialize booleans used for dynamic token discovery in LP contracts
        const usdcBct = new Contract(this.usdcBctAddress, this.uniPairAbi, this.provider)
        const klimaBct = new Contract(this.klimaBctAddress, this.uniPairAbi, this.provider)
        const usdcMco2 = new Contract(this.usdcMco2Address, this.uniPairAbi, this.provider)
        const klimaMco2 = new Contract(this.klimaMco2Address, this.uniPairAbi, this.provider)
        this.usdcBctReverse = (await usdcBct.token0()) != config.get('USDC_ADDRESS')
        this.usdcMco2Reverse = (await usdcMco2.token0()) != config.get('USDC_ADDRESS')
        this.klimaBctReverse = (await klimaBct.token0()) != config.get('KLIMA_ADDRESS')
        this.klimaMco2Reverse = (await klimaMco2.token0()) != config.get('KLIMA_ADDRESS')

        this.isInitialized = true
    }

    public run(): void {
        if (!this.isInitialized) {
            throw Error('uninitialized: did you run init()?')
        }

        let locked = false

        // TODO: Ideally we track 'pending' transactions in mempool
        this.provider.on('block', async (blockNumber) => {
            // Acquire lock so we won't be submitting multiple transactions across adjacent
            // blocks once we spot an arbitrage opportunity.
            if (locked) {
                console.log(`#${blockNumber}: Ignoring this block as there is already an in-flight request`)
                return
            } else {
                locked = true
            }

            try {
                // Gather reserves from all Klima pools
                const klimaPools: Route[] = []
                const [
                    usdcBctReserve,
                    klimaBctReserve,
                    usdcMco2Reserve,
                    klimaMco2Reserve,
                ] = await this.multicallProvider.all(this.calls);

                // USDC -> BCT -> KLIMA
                checkReserves(
                    this.usdcToBorrow,
                    usdcBctReserve,
                    klimaBctReserve,
                    config.get('BCT_ADDRESS'),
                    // This should match the router that supports this path in the contract
                    // In this case router0 is meant to be the SushiSwap router.
                    0,
                    this.usdcBctReverse,
                    this.klimaBctReverse,
                    klimaPools,
                )

                // USDC -> MCO2 -> KLIMA
                checkReserves(
                    this.usdcToBorrow,
                    usdcMco2Reserve,
                    klimaMco2Reserve,
                    config.get('MCO2_ADDRESS'),
                    // This should match the router that supports this path in the contract
                    // In this case router1 is meant to be the QuickSwap router.
                    1,
                    this.usdcMco2Reverse,
                    this.klimaMco2Reverse,
                    klimaPools,
                )

                // Check whether we can execute an arbitrage
                const { netResult, zeroToOne, path0, path1 } = arbitrageCheck(klimaPools, this.totalDebt)
                console.log(`#${blockNumber}: Got USDC return: ${netResult.div(1e6)}`)
                if (netResult.lte(0)) {
                    return
                }
                console.log(`#${blockNumber}: ZeroToOne: ${zeroToOne}, Path: ${JSON.stringify({path0, path1})}`)

                // TODO: Read gas limit dynamically
                // const gasLimit = BigNumber.from(600000)
                // const gasPrice = await wallet.getGasPrice()
                // TODO: Sum gas costs with net result to ensure we are
                // still profitable
                // const gasCost = Number(ethers.utils.formatEther(gasPrice.mul(gasLimit)))

                // Execute flasloan request
                const tx = await this.loaner.flashloan(
                    config.get('USDC_ADDRESS'),
                    this.usdcToBorrow,
                    zeroToOne,
                    path0,
                    path1,
                )
                await tx.wait()

                console.log(`#${blockNumber}: Flashloan request ${tx.hash} successfully mined`)
            } catch (err) {
                console.error(`#${blockNumber}: Failed to execute flasloan request: ${err}`)
            } finally {
                locked = false
            }
        });
    }
}