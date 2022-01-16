import Arbitragoor from './arbitragoor'

(async () => {
    // Initialize arbitragoor
    const arb = new Arbitragoor()
    await arb.init()

    // Run arbitragoor
    arb.run()
})()
