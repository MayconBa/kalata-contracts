const hre = require("hardhat");


async function main() {
    let accounts = []
    for (let i = 0; i < 100; i++) {
        let account = hre.web3.eth.accounts.create();
        accounts.push({privateKey: account.privateKey.substring(2), address: account.address});
    }
    console.log(accounts)

}


main()
    .then(() => console.log("Oracle feeder schedule job started"))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
