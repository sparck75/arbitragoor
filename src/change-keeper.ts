import { ethers } from 'ethers'

import { ConfigService } from './config'

const config = new ConfigService()
const provider = new ethers.providers.JsonRpcProvider(config.get('NODE_API_URL'))
const wallet = new ethers.Wallet(config.get('PRIVATE_KEY'), provider)
const flashloanAddress = config.get('FLASHLOAN_ADDRESS')

async function changeKeeper(newKeeper: string): Promise<void> {
    console.log(`Updating keeper to ${newKeeper}`)

    const flashloanAbi = new ethers.utils.Interface([
        'function changeKeeper(address newKeeper) public',
    ])
    const loaner = new ethers.Contract(flashloanAddress, flashloanAbi, wallet)

    const tx = await loaner.changeKeeper(newKeeper)
    await tx.wait()
    console.log(`Keeper change request ${tx.hash} successfully mined`)
}

(async () => {
    const args = process.argv
    if (args.length != 3) {
        throw Error('invalid use: need to provide a single argument (new keeper address)')
    }
    await changeKeeper(args[2])
})().catch(e => {
   console.log(`Keeper change failed: ${e.message}`)
})
