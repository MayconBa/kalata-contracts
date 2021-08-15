const moment = require("moment");
const {resolve} = require('path')
const {constants: {ZERO_BYTES32}} = require('@openzeppelin/test-helpers');
const {randomString} = require("../../utils/string");
const {readJson, saveJson} = require("../../utils/json");
const {readContracts} = require("../../utils/resources");
const {stringToBytes32} = require("../../utils/bytes");
const {loadContractByAbi} = require("../../utils/contract");
const {logger} = require('./logger')

class Timelock {
    constructor(hre) {
        this.hre = hre;
        const Contract = require('web3-eth-contract');
        Contract.setProvider(this.hre.network.provider)
        this.deployedContracts = readContracts(this.hre);
        this.executing = false;
        this.network = this.hre.network.name;
    }

    async init() {
        let [signer] = await this.hre.ethers.getSigners();
        let deployedContracts = readContracts(this.hre);
        let timelockInfo = deployedContracts['Timelock'];
        this.timelock = await loadContractByAbi(hre, timelockInfo.abi, timelockInfo.address, signer);
    }

    getFile() {
        return resolve(__dirname, `../governance/${this.hre.network.name}/timelock/schedule.json`);
    }

    readSchedules() {
        return readJson(this.getFile()) || {};
    }

    saveSchedules(data) {
        saveJson(this.getFile(), data);
    }

    async schedule({abi, target, method, args}) {
        let schedules = this.readSchedules();
        let minDelay = (await this.timelock.getMinDelay()).toString();
        let data = (new Contract(abi, target)).methods[method](...args).encodeABI();
        //function schedule(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt, uint256 delay)
        //function execute(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt)
        let executeParameters = {target, value: 0, data, predecessor: ZERO_BYTES32, salt: stringToBytes32(randomString(32))}
        let scheduleParameters = {...executeParameters, minDelay};
        logger.info(`scheduleParameters,${scheduleParameters}`)
        let receipt = await this.timelock.schedule(...Object.values(scheduleParameters));
        let confirmations = await receipt.wait();
        let id = confirmations.events[0].args['id'];
        schedules[id] = {
            id,
            scheduleParameters,
            executeParameters,
            created: moment().format(),
            minDelay: parseInt(minDelay),
            expectExecuteTime: moment().add(parseInt(minDelay), "second").format(),
            actualExecuteTime: null,
            status: 'pending',
        };
        this.saveSchedules(schedules);
    }

    async execute() {
        if (this.executing) {
            return;
        }
        this.executing = true;
        try {
            logger.info('timelock-task begin')
            let schedules = this.readSchedules();
            for (let schedule of Object.values(schedules)) {
                if (schedule.status === 'pending' && schedule.expectExecuteTime < moment().format()) {
                    if (await this.timelock.isOperationReady(schedule.id)) {
                        // emit CallExecuted(id, index, target, value, data);
                        let receipt = await this.timelock.schedule(...Object.values(schedule.executeParameters)).catch(e => {
                            console.error(`timelock.schedule,${e}`);
                        });
                        await receipt.wait();
                        console.log(`timelock.schedule,${receipt.hash}`)
                        schedule.actualExecuteTime = moment().format();
                        schedule.transactionHash = receipt.hash;
                        schedules.status = "done";
                        this.saveSchedules(schedules);
                    }
                }
            }
            logger.info('timelock-task end')
        } catch (error) {
            logger.error(`timelock execute error:${error}`);
        }
        this.executing = false;
    }
}

module.exports = {
    Timelock
};


