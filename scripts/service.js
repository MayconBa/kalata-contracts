const hre = require("hardhat");
const {exec, spawn} = require('child_process');
const fastify = require('fastify')({logger: true})

// Declare a route
//http://127.0.0.1:3001/api/private/build
fastify.get('/api/app/build', async (request, reply) => {
    //exec('sh /home/xuxf/private/deploy.sh > /var/www/acquaintance.kalata.io/deploy.log')
    exec('sh /home/xuxf/app.kalata.io/deploy.sh > /var/www/app.kalata.io/deploy.txt', (err, stdout, stderr) => {
        if (err) {
            console.error(err);
        }
        //console.log(stdout);
    });
    return `${new Date()}, Building, check url https://app.kalata.io/deploy.txt for building log`
})
// Run the server!
const start = async () => {
    try {
        await fastify.listen(3001)
    } catch (err) {
        fastify.log.error(err)
        process.exit(1)
    }
}
start()

