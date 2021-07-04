require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ethers");
require('@openzeppelin/hardhat-upgrades');
require("@nomiclabs/hardhat-web3");
require("hardhat-deploy");
require("hardhat-gas-reporter");
require('hardhat-preprocessor');
const {removeConsoleLog} = require("hardhat-preprocessor");

const env = require('./env.js');

// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async () => {
    const accounts = await ethers.getSigners();
    for (const account of accounts) {
        console.log(account.address);
    }
});

task("transfer-test-busd", "Batch transfer Test Kalas").addParam("amount", "The account's address").setAction(async taskArgs => {
    const hre = require("hardhat");
    if (hre.network.name !== 'testnet') {
        return;
    }
    let amount = taskArgs.amount;
    const moment = require("moment");
    const fs = require('fs');
    const {readJson, saveJson} = require("./utils/json")
    const {toUnitString} = require("./utils/maths")
    const {abi} = await hre.artifacts.readArtifact("IBEP20Token");
    const {loadContractByAbi} = require("./utils/contract")
    const {readBUSD} = require("./utils/assets");
    let busdInfo = readBUSD(hre);
    let busdToken = await loadContractByAbi(hre, abi, busdInfo.address);
    const date = moment().format('YYYY-MM-DD');
    const folder = `${__dirname}/transfer/${hre.network.name}/${date}`
    //console.log(folder)
    const logFile = `${folder}/log.json`
    const transferLogs = readJson(logFile) || {};
    let transferred = Object.keys(transferLogs).length;
    await busdToken.mint('0x28D89B837BFDb5DD386988F06C87BEB3ab5DC8C0', toUnitString("10000000000"));
    console.log("transferred:", transferred)
    let index = 0;
    for (let line of fs.readFileSync(`${folder}/list.txt`, "utf-8").split("\n")) {
        let account = line.trim();
        //console.log(line)
        if (account.startsWith("0x") && account.length === 42 && !transferLogs[account]) {
            let result = await busdToken.transfer(account, toUnitString(amount));
            let transferLog = {account, amount: amount, transaction: result.hash, time: moment().format()};
            console.log(transferred + (++index), JSON.stringify(transferLog))
            transferLogs[account] = transferLog
            saveJson(logFile, transferLogs);
        }
    }
});

task("balance", "Prints an account's balance")
    .addParam("account", "The account's address")
    .setAction(async taskArgs => {
        const account = web3.utils.toChecksumAddress(taskArgs.account);
        const balance = await web3.eth.getBalance(account);
        console.log(web3.utils.fromWei(balance, "ether"), "ETH");
    });

task("blockNumber", "Prints the current block number",
    async (_, {ethers}) => {
        await ethers.provider.getBlockNumber().then((blockNumber) => {
            console.log("Current block number: " + blockNumber);
        });
    }
);

// Go to https://hardhat.org/config/ to learn more
/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
    defaultNetwork: "hardhat",
    gasReporter: {enabled: env.reportGas, currency: 'USD', gasPrice: 2100000000},
    preprocess: {
        eachLine: removeConsoleLog((hre) => hre.network.name !== 'hardhat' && hre.network.name !== 'localhost'),
    },
    contractSizer: {
        alphaSort: true,
        runOnCompile: true,
        disambiguatePaths: false,
    },
    networks: {
        localhost: {
            //accounts: env.devAccounts.map(item => item.privateKey),
            accounts: {mnemonic: env.mnemonic}
        },
        hardhat: {
            accounts: {mnemonic: env.mnemonic}
            //ccounts: env.devAccounts.map(item => {return {privateKey:item.privateKey, balance: "100000000000000000000000000"}}),
        },
        ethMainnet: {
            url: `https://mainnet.infura.io/v3/${env.infuraApiKey}`,
            accounts: env.devAccounts.map(item => item.privateKey),
            gasPrice: 120 * 1000000000,
            chainId: 1,
        },
        ropsten: {
            url: `https://ropsten.infura.io/v3/${env.infuraApiKey}`,
            accounts: env.devAccounts.map(item => item.privateKey),
            chainId: 3,
            live: true,
            saveDeployments: true,
            tags: ["staging"],
            gasPrice: 5000000000,
            gasMultiplier: 2
        },
        rinkeby: {
            url: `https://rinkeby.infura.io/v3/${env.infuraApiKey}`,
            accounts: env.devAccounts.map(item => item.privateKey),
            chainId: 4,
            live: true,
            saveDeployments: true,
            tags: ["staging"],
            gasPrice: 5000000000,
            gasMultiplier: 2
        },
        goerli: {
            url: `https://goerli.infura.io/v3/${env.infuraApiKey}`,
            accounts: env.devAccounts.map(item => item.privateKey),
            chainId: 5,
            live: true,
            saveDeployments: true,
            tags: ["staging"],
            gasPrice: 5000000000,
            gasMultiplier: 2
        },
        kovan: {
            url: `https://kovan.infura.io/v3/${env.infuraApiKey}`,
            accounts: env.devAccounts.map(item => item.privateKey),
            chainId: 42,
            live: true,
            saveDeployments: true,
            tags: ["staging"],
            gasPrice: 20000000000,
            gasMultiplier: 2
        },
        testnet: {
            url: "https://data-seed-prebsc-1-s1.binance.org:8545",
            chainId: 97,
            gasPrice: 20000000000,
            accounts: env.devAccounts.map(item => item.privateKey),
        },
        mainnet: {
            url: "https://bsc-dataseed.binance.org/",
            chainId: 56,
            gasPrice: 20000000000,
            accounts: env.devAccounts.map(item => item.privateKey),
        },
        hecoTestnet: {
            url: "https://http-testnet.hecochain.com",
            chainId: 256,
            gasPrice: 20000000000,
            accounts: env.devAccounts.map(item => item.privateKey),
        },

        hecoMainnet: {
            url: "https://http-mainnet.hecochain.com",
            chainId: 128,
            gasPrice: 20000000000,
            accounts: env.devAccounts.map(item => item.privateKey),
        },
    },
    solidity: {
        compilers: [
            {version: '0.7.6', settings: {optimizer: {enabled: true}}},
            //{version: '0.6.6', settings: {optimizer: {enabled: true}}},
            //{version: '0.5.6', settings: {optimizer: {enabled: true}}},
            //{version: '0.5.16', settings: {optimizer: {enabled: true}}},
        ],
    },

    paths: {
        sources: "./contracts",
        tests: "./test",
        cache: "./cache",
        artifacts: "./artifacts",
    },
    mocha: {
        timeout: 200000
    },
    //Refer to https://hardhat.org/plugins/hardhat-deploy.html#namedaccounts-ability-to-name-addresses
    namedAccounts: {
        deployer: {
            default: 0, // here this will by default take the first account as deployer
            1: 0, // similarly on mainnet it will take the first account as deployer. Note though that depending on how hardhat network are configured, the account 0 on one network can be different than on another
            4: 0, // but for rinkeby it will be a specific address
        },
        feeCollector: {
            default: 1, // here this will by default take the second account as feeCollector (so in the test this will be a different account than the deployer)
            1: 1,
            4: 1
        }
    }
};

