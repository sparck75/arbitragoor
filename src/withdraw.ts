import { BigNumber, ethers } from 'ethers'

import { ConfigService } from './config'

const config = new ConfigService()
const provider = new ethers.providers.JsonRpcProvider(config.get('NODE_API_URL'))
const wallet = new ethers.Wallet(config.get('PRIVATE_KEY'), provider)
const flashloanAddress = config.get('FLASHLOAN_ADDRESS')
const usdcAddress = config.get('USDC_ADDRESS')

async function withdraw(): Promise<void> {
    const erc20Abi = new ethers.utils.Interface([
        'function balanceOf(address owner) public view returns(uint256)',
    ])
    const usdc = new ethers.Contract(usdcAddress, erc20Abi, wallet)

    // Check available balance first
    const balance = await usdc.balanceOf(flashloanAddress)
    if (balance == 0) {
        console.log('Empty balance, nothing to withdraw')
        return
    }

    // Execute withdrawal
    console.log(`Withdrawing ${BigNumber.from(balance).div(1e6)} USDC...`)
    const flashloanAbi = new ethers.utils.Interface([
        'function withdraw(address asset) public',
    ])
    const loaner = new ethers.Contract(flashloanAddress, flashloanAbi, wallet)

    const tx = await loaner.withdraw(usdcAddress)
    await tx.wait()
    console.log(`Withdraw request ${tx.hash} successfully mined`)
}

(async () => {
    await withdraw()
})().catch(e => {
   console.log(`Withdrawal failed: ${e.message}`)
})
