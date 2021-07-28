const hre = require("hardhat");
const {exec} = require('child_process');
const fastify = require('fastify')({logger: true})
const {collectPrices} = require('./collector')
const {batchFeed} = require('./feeder')
const {distribute} = require('./factory')
const {TransactionLog} = require('./transactionLog')
const {Timelock} = require('./timelock')
const {logger} = require('./logger')
const {Mint} = require('./mint')


const start = async () => {
    let transactionLog = new TransactionLog(hre);
    await transactionLog.init();
    let timelock = new Timelock(hre);
    await timelock.init();
    let mint = new Mint(hre);
    await mint.init();
    if (true) {
        try {
            setInterval(() => mint.doAuction(), 60 * 1000);
            setInterval(() => timelock.execute(), 60 * 1000);
            setInterval(() => distribute(hre), 3600 * 2 * 1000);
            setInterval(() => transactionLog.collect(), 30 * 1000);
            setInterval(() => collectPrices(hre), 5 * 1000);
            setInterval(() => batchFeed(hre), 55 * 5 * 1000);
            await fastify.listen(3001)
        } catch (err) {
            fastify.log.error(err)
            process.exit(1)
        }
    }

}

start().then(r => {
    //console.log('service started')
})

