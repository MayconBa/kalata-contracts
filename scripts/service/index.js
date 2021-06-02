const hre = require("hardhat");
const {exec} = require('child_process');
const fastify = require('fastify')({logger: true})
const {collectPrices} = require('./collector')
const {batchFeed} = require('./feeder')
const {distribute} = require('./factory')
const {logger} = require('./logger')

//http://127.0.0.1:3001/api/private/build
fastify.get('/api/app/build', async (request, reply) => {
    exec('sh /home/xuxf/app.kalata.io/deploy.sh > /var/www/app.kalata.io/deploy.txt', (err, stdout, stderr) => {
        if (err) {
            logger.error(err);
        }
    });
    return `${new Date()}, Building, check url https://app.kalata.io/deploy.txt for building log`
})


const start = async () => {
    await distribute(hre)
    // await distribute(hre).catch(error => {
    //     logger.error(`distribute error:${error}`)
    // })
    try {
        //setInterval(() => collectPrices(hre), 5 * 1000);
        //setInterval(() => batchFeed(hre), 60 * 10 * 1000);
        //setInterval(() => distribute(hre), 5 * 1000);
        //await fastify.listen(3001)
    } catch (err) {
        fastify.log.error(err)
        process.exit(1)
    }
}

start().then(r => {
    //console.log('service started')
})

