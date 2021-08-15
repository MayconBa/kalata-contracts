//npx hardhat run scripts\checkContracts.js --network testnet --no-compile
// console.log(result.toLocaleString('fullwide', {useGrouping: false}));
const got = require('got');
const {readContracts,} = require("../../utils/resources");
const {readAssets, readKala} = require("../../utils/assets");
const Contract = require('web3-eth-contract');
const {logger} = require('./logger')

async function getAbi(hre, contractName) {
    return (await hre.artifacts.readArtifact(contractName)).abi;
}

//const urlPrefix = 'http://localhost:8089';
const urlPrefix = 'https://testnet.kalata.io';

async function getLatestBlockNumber(contract, event) {
    let url = `${urlPrefix}/api/finance/transaction/logs/latestBlockNumber?1=1`;
    if (contract) {
        url += `&contract=${contract}`;
    }
    if (event) {
        url += `&event=${event}`;
    }
    const body = await got.get(url).json();
    return body['data'] + 1;
}

async function upload(items) {
    async function doUpload(data) {
        const response = await got.post(`${urlPrefix}/api/finance/transaction/logs/import`, {json: data,});
        logger.info(`transaction upload:${JSON.stringify(data)},${response.body}`);
    }

    let data = []
    for (let item of items) {
        data.push(item);
        if (data.length === 100) {
            await doUpload(data);
            data = []
        }
    }
    if (data.length > 0) {
        await doUpload(data);
    }
}


class TransactionLog {
    constructor(hre) {
        this.hre = hre;
        this.collecting = false;
        this.network = hre.network.name;
        Contract.setProvider(hre.network.provider)
    }

    async init() {
        let deployedContracts = readContracts(this.hre);
        this.deployedAssets = readAssets(this.hre);
        this.mintContract = new Contract(await getAbi(this.hre, 'Mint'), deployedContracts["Mint"].address);
        this.stakingContract = new Contract(await getAbi(this.hre, 'Staking'), deployedContracts["Staking"].address);
    }

    async collect() {
        if (this.collecting) {
            return;
        }
        this.collecting = true;
        try {
            let lastBlockNumber = await getLatestBlockNumber();
            await this.getPairEventItems(lastBlockNumber);
            await this.getMintEventItems(lastBlockNumber);
            await this.getStakingEventItems(lastBlockNumber);
        } catch (error) {
            logger.error(`transaction log collect error:${error}`);
        }
        this.collecting = false;
    }

    async getContractEventItems({lastBlockNumber, contract, event, valuesConverter}) {
        let params = {filter: {}, fromBlock: lastBlockNumber, toBlock: 'latest'};
        let events = await contract.getPastEvents(event, params, function (error) {
            error && console.error('getPastEvents error', error);
        });
        let items = []
        for (let e of events) {
            let blockNumber = e.blockNumber;
            let transactionHash = e.transactionHash;
            let parameters = valuesConverter(e.returnValues)
            let transaction = await this.hre.web3.eth.getTransaction(transactionHash);
            let sender = transaction.from;
            let blockTimestamp = (await this.hre.web3.eth.getBlock(blockNumber)).timestamp;
            items.push({network: this.network, contract: contract._address, event, sender, parameters, transactionHash, blockNumber, blockTimestamp})
        }
        //console.log('getPastEvents:', event, params, items);
        return items;
    }


    async getMintEventItems(lastBlockNumber) {
        //OpenPosition(address indexed sender, address indexed collateralToken, uint collateralAmount, address indexed assetToken, uint collateralRatio, uint positionIndex, uint mintAmount);
        await upload(await this.getContractEventItems({
            lastBlockNumber,
            contract: this.mintContract,
            event: 'OpenPosition',
            valuesConverter: values => {
                let {collateralToken, collateralAmount, assetToken, collateralRatio, positionIndex, mintAmount} = values;
                return JSON.stringify({collateralToken, collateralAmount, assetToken, collateralRatio, positionIndex, mintAmount})
            },
        }))

        //event Deposit(address indexed sender, uint positionIndex, address indexed collateralToken, uint collateralAmount);
        await upload(await this.getContractEventItems({
            lastBlockNumber,
            contract: this.mintContract,
            event: 'Deposit',
            valuesConverter: values => JSON.stringify({
                positionIndex: values['positionIndex'],
                collateralToken: values['collateralToken'],
                collateralAmount: values['collateralAmount']
            }),
        }))

        //event Withdraw(address indexed sender, uint positionIndex, address indexed collateralToken, uint collateralAmount, uint protocolFee);
        await upload(await this.getContractEventItems({
            lastBlockNumber,
            contract: this.mintContract,
            event: 'Withdraw',
            valuesConverter: values => JSON.stringify({
                positionIndex: values['positionIndex'],
                collateralToken: values['collateralToken'],
                collateralAmount: values['collateralAmount'],
                protocolFee: values['protocolFee'],
            }),
        }))
        //event Mint(address indexed sender, uint positionIndex, address indexed assetToken, uint assetAmount);
        await upload(await this.getContractEventItems({
            lastBlockNumber,
            contract: this.mintContract,
            event: 'Mint',
            valuesConverter: values => JSON.stringify({
                positionIndex: values['positionIndex'],
                assetToken: values['assetToken'],
                assetAmount: values['assetAmount'],
            }),
        }))

        //event Burn(address indexed sender, uint positionIndex, address indexed assetToken, uint assetAmount);
        await upload(await this.getContractEventItems({
            lastBlockNumber,
            contract: this.mintContract,
            event: 'Burn',
            valuesConverter: values => JSON.stringify({
                positionIndex: values['positionIndex'],
                assetToken: values['assetToken'],
                assetAmount: values['assetAmount'],
            }),
        }))
        //event Auction(address indexed sender, uint positionIndex, address indexed positionOwner, uint returnCollateralAmount, uint liquidatedAssetAmount, uint protocolFee);
        await upload(await this.getContractEventItems({
            lastBlockNumber,
            contract: this.mintContract,
            event: 'Auction',
            valuesConverter: values => JSON.stringify({
                positionIndex: values['positionIndex'],
                positionOwner: values['positionOwner'],
                returnCollateralAmount: values['returnCollateralAmount'],
                liquidatedAssetAmount: values['liquidatedAssetAmount'],
                protocolFee: values['protocolFee'],
            }),
        }))
    }

    async getPairEventItems(lastBlockNumber) {
        let assets = Object.values(this.deployedAssets);
        const {abi} = require("@uniswap/v2-core/build/UniswapV2Pair.json");
        assets.push(readKala(this.hre))
        for (let asset of assets) {
            let pairContract = new Contract(abi, asset.pair)
            await upload(await this.getContractEventItems({
                lastBlockNumber,
                contract: pairContract,
                event: 'Mint',
                valuesConverter: values => JSON.stringify({amount0: values.amount0, amount1: values.amount1}),

            }))
            await upload(await this.getContractEventItems({
                lastBlockNumber,
                contract: pairContract,
                event: 'Burn',
                valuesConverter: values => {
                    let {amount0, amount1, to} = values;
                    return JSON.stringify({amount0, amount1, to})
                },

            }))
            await upload(await this.getContractEventItems({
                lastBlockNumber,
                contract: pairContract,
                event: 'Swap',
                valuesConverter: values => {
                    let {amount0In, amount1In, amount0Out, amount1Out} = values;
                    return JSON.stringify({amount0In, amount1In, amount0Out, amount1Out})
                },
                //senderParser: values => values.to
            }))
        }
    }

    async getStakingEventItems(lastBlockNumber) {
        await upload(await this.getContractEventItems({
            lastBlockNumber,
            contract: this.stakingContract,
            event: 'Stake',
            valuesConverter: values => JSON.stringify({asset: values.asset, amount: values.stakingTokenAmount}),
        }))
        await upload(await this.getContractEventItems({
            lastBlockNumber,
            contract: this.stakingContract,
            event: 'UnStake',
            valuesConverter: values => JSON.stringify({asset: values.asset, amount: values.amount}),
        }))
    }

}

module.exports = {
    TransactionLog
};
