const hre = require("hardhat");
const {toBN} = require('web3-utils');
const {expect} = require("chai");
const {toUnit} = require('../utils/maths')
const assert = require('../utils/assert')
const {toUnitString} = require("../utils/maths");
const {deployToken, deployAndInitializeContract, loadContract, loadToken} = require("../utils/contract");


let deployer;
let account1;
let account2;
let account3;
let account4;
let governanceInstance;
let kalaToken;
let governanceConfig
const VOTE_YES = 0;
const VOTE_NO = 1;

const POLL_STATUS_IN_PROGRESS = 0;
const POLL_STATUS_PASSED = 1;
const POLL_STATUS_REJECTED = 2;
const POLL_STATUS_EXECUTED = 3;
const POLL_STATUS_EXPIRED = 4;


const CONTRACT_NAME = "Governance";

async function createPoll(instance, token, params) {
    await token.approve(instance.address, params.depositAmount.toString());
    let pollKey = hre.web3.utils.fromAscii(hre.web3.utils.randomHex(15));
    await instance.createPoll(params.depositAmount.toString(), params.title, params.description, pollKey);
    return await instance.queryPollId(pollKey);
}

async function createDefaultPoll(proposer) {
    let pollParams = {
        depositAmount: toUnit("500"),
        title: "title-1",
        description: 'description-1',
        govToken: kalaToken.address
    };

    let proposerWalletInstance = governanceInstance.connect(proposer);
    let proposerWalletKalaToken = kalaToken.connect(proposer);
    let pollId = await createPoll(proposerWalletInstance, proposerWalletKalaToken, pollParams);
    return [pollId, pollParams]
}

function assertConfigEqual(config1, config2) {
    expect(config1.govToken).to.equal(config2.govToken);
    expect(config1.quorum).to.equal(config2.quorum);
    expect(config1.threshold).to.equal(config2.threshold);
    expect(config1.votingPeriod).to.equal(config2.votingPeriod);
    expect(config1.effectiveDelay).to.equal(config2.effectiveDelay);
    expect(config1.expirationPeriod).to.equal(config2.expirationPeriod);
    expect(config1.proposalDeposit).to.equal(config2.proposalDeposit);
}

async function updateConfigPeriods() {
    //update config params, so that we can test endPoll() without waiting...;
    let newConfig = {...governanceConfig};
    newConfig.expirationPeriod = 0
    newConfig.votingPeriod = 3;
    newConfig.effectiveDelay = 0;
    newConfig.proposalDeposit = toUnitString("200");
    await updateConfig(governanceInstance, newConfig);
}


async function updateConfig(instance, config) {
    await instance.updateConfig(
        config.quorum,
        config.threshold,
        config.votingPeriod,
        config.effectiveDelay,
        config.expirationPeriod,
        config.proposalDeposit
    )
}


describe("Test Governance", () => {
    beforeEach(async () => {
        [deployer, account1, account2, account3, account4] = await hre.ethers.getSigners();
        kalaToken = await deployToken(hre, "Kalata", "Kala", toUnitString('1200000000000'));
        governanceConfig = {
            votingPeriod: 201600, //Number of blocks during which votes can be cast
            effectiveDelay: 100800,//Number of blocks after a poll passes to apply changes
            expirationPeriod: 14400,//Number of blocks after a poll's voting period during which the poll can be executed.
            govToken: kalaToken.address,
            proposalDeposit: toUnitString("20"), //Minimum KALA deposit required for a new poll to be submitted
            quorum: toUnitString("0.1"), //Minimum percentage of participation required for a poll to pass
            threshold: toUnitString("0.5") //Minimum percentage of yes votes required for a poll to pass
        };

        governanceInstance = await deployAndInitializeContract(hre, CONTRACT_NAME, [
            governanceConfig.govToken,
            governanceConfig.quorum,
            governanceConfig.threshold,
            governanceConfig.votingPeriod,
            governanceConfig.effectiveDelay,
            governanceConfig.expirationPeriod,
            governanceConfig.proposalDeposit
        ])
        expect(governanceInstance.address).to.properAddress;
        kalaToken.transfer(account1.address, toUnitString("100000"));
        kalaToken.transfer(account2.address, toUnitString("100000"));
        kalaToken.transfer(account3.address, toUnitString("100000"));
        kalaToken.transfer(account4.address, toUnitString("100000"));
    });


    describe("Deployment", async () => {
        it("Should set the right deployer", async () => {
            expect(await governanceInstance.owner()).to.equal(deployer.address);
        });
    });
    describe("Transactions", async () => {
        it("queryConfig/updateConfig/permission", async () => {
            assertConfigEqual(governanceConfig, await governanceInstance.queryConfig());
            let newConfig = {
                votingPeriod: 201601, //Number of blocks during which votes can be cast
                effectiveDelay: 10082,//Number of blocks after a poll passes to apply changes
                expirationPeriod: 1441,//Number of blocks after a poll's voting period during which the poll can be executed.
                govToken: kalaToken.address,
                proposalDeposit: toUnitString("210"), //Minimum KALA deposit required for a new poll to be submitted
                quorum: toUnitString("0.2"), //Minimum percentage of participation required for a poll to pass
                threshold: toUnitString("0.3") //Minimum percentage of yes votes required for a poll to pass
            };
            await updateConfig(governanceInstance, newConfig);
            assertConfigEqual(newConfig, await governanceInstance.queryConfig());
            await updateConfig(governanceInstance, governanceConfig);
            assertConfigEqual(governanceConfig, await governanceInstance.queryConfig());

            //Another account should have no permission to updateConfig
            let account1Instance = governanceInstance.connect(account1);
            await expect(updateConfig(account1Instance, newConfig)).to.be.revertedWith("Ownable: caller is not the owner");

            //transfer ownership
            await governanceInstance.transferOwnership(account1.address);

            //now another account should have permission to updateConfig
            await updateConfig(account1Instance, newConfig)
            assertConfigEqual(newConfig, await governanceInstance.queryConfig());

            //transfer ownership back
            await account1Instance.transferOwnership(deployer.address);

            //update config back
            await updateConfig(governanceInstance, governanceConfig);
            assertConfigEqual(governanceConfig, await governanceInstance.queryConfig());
        });
    });
    describe("createPoll", async () => {
        it("createPoll", async () => {
            async function testAccount(proposer) {
                let pollParams = {
                    depositAmount: toUnit("30.2"),
                    title: "title-1",
                    description: 'description-1',
                    govToken: kalaToken.address
                };

                //Use the proposer wallet to test
                let proposerWalletInstance = governanceInstance.connect(proposer);
                let proposerWalletKalaToken = kalaToken.connect(proposer);


                let totalBalanceBefore = await proposerWalletKalaToken.balanceOf(governanceInstance.address);
                let stateBefore = await proposerWalletInstance.queryState();

                let pollId = await createPoll(proposerWalletInstance, proposerWalletKalaToken, pollParams);
                let poll = await proposerWalletInstance.queryPoll(pollId);

                expect(poll.title).to.equal(pollParams.title);
                expect(poll.description).to.equal(pollParams.description);
                expect(poll.id).to.equal(pollId);
                expect(poll.depositAmount.toString()).to.equal(pollParams.depositAmount.toString());

                let totalBalanceAfter = await proposerWalletKalaToken.balanceOf(proposerWalletInstance.address);

                let stateAfter = await proposerWalletInstance.queryState();

                assert.bnEqual(pollParams.depositAmount, totalBalanceAfter - totalBalanceBefore);
                assert.bnEqual(stateBefore.pollCount.add(1), stateAfter.pollCount)
                assert.bnEqual(toBN(stateBefore.totalDeposit.toString()), toBN(stateAfter.totalDeposit.toString()).sub(pollParams.depositAmount))
            }

            await testAccount(account1);
            await testAccount(account2);
            await testAccount(account3);
        });
    });
    describe("stakeVotingTokens", async () => {
        it("stakeVotingTokens", async () => {
            async function testAccount(staker) {
                //load the contract instance for account. so that account becomes the "msg.sender" in Contract;
                let walletInstance = governanceInstance.connect(staker);
                let walletKalaToken = kalaToken.connect(staker);

                let stakingInfoBefore = await walletInstance.queryStakingInfo(staker.address);
                let stateBefore = await walletInstance.queryState();

                //console.log('stakingInfoBefore', stakingInfoBefore);
                //console.log('stateBefore', stateBefore);

                //Should staking correct amount
                //await expect(walletInstance.stakeVotingTokens(0)).to.be.revertedWith("Insufficient funds sent");
                await expect(walletInstance.stakeVotingTokens(0)).to.be.revertedWith("Insufficient funds sent");

                //If user didnt't IERC20.approve some tokens, the transaction should be reverted
                await expect(walletInstance.stakeVotingTokens(toUnitString("10"))).to.be.reverted;

                let stakingAmount = toUnit("22.5");

                //If user didn't IERC20.approve enough tokens, the transaction should be reverted
                let approveAmount = stakingAmount.sub(toUnit("2"));
                await walletKalaToken.approve(governanceInstance.address, approveAmount.toString());
                await expect(walletInstance.stakeVotingTokens(stakingAmount.toString())).to.be.reverted;
                await walletKalaToken.decreaseAllowance(governanceInstance.address, approveAmount.toString());


                await walletKalaToken.approve(governanceInstance.address, stakingAmount.toString());
                walletInstance.stakeVotingTokens(stakingAmount.toString());

                let stakingInfoAfter = await walletInstance.queryStakingInfo(account1.address);
                expect(stakingInfoAfter.share.sub(stakingInfoBefore.share).toString()).to.equal(stakingAmount.toString())

                let stateAfter = await walletInstance.queryState();
                expect(stateAfter.totalShare.sub(stateBefore.totalShare).toString()).to.equal(stakingAmount.toString())
            }

            await testAccount(account1);
            await testAccount(account2);
            await testAccount(account3);
        });
    });
    describe("withdrawVotingTokens", async () => {
        it("Nothing staked", async () => {
            let withdrawAmount = toUnit("2");
            let walletInstance = governanceInstance.connect(account1);

            //account has no staking info,transaction should be reverted
            await expect(walletInstance.withdrawVotingTokens(withdrawAmount.toString())).to.be.revertedWith("Nothing staked");
        });

        it("withdraw", async () => {
            const staker = account1;
            let walletInstance = governanceInstance.connect(staker);
            let walletKalaToken = kalaToken.connect(staker);

            //stake some
            let stakingAmount = toUnit("1.2");
            await walletKalaToken.approve(governanceInstance.address, stakingAmount.toString());
            await walletInstance.stakeVotingTokens(stakingAmount.toString());
            let [stakingInfo, state] = [await walletInstance.queryStakingInfo(staker.address), await walletInstance.queryState()]
            expect(stakingInfo.share.toString()).to.equal(stakingAmount.toString())
            expect(state.totalShare.toString()).to.equal(stakingAmount.toString())

            //withdraw half
            let withdrawAmount = stakingAmount.div(toBN("2"))
            await walletInstance.withdrawVotingTokens(withdrawAmount.toString());
            [stakingInfo, state] = [await walletInstance.queryStakingInfo(staker.address), await walletInstance.queryState()]
            expect(stakingInfo.share.toString()).to.equal(stakingAmount.sub(withdrawAmount).toString())
            expect(state.totalShare.toString()).to.equal(stakingAmount.sub(withdrawAmount).toString())


            //withdraw another half, now the stake share and total share shoudl be zero
            await walletInstance.withdrawVotingTokens(withdrawAmount.toString());
            [stakingInfo, state] = [await walletInstance.queryStakingInfo(staker.address), await walletInstance.queryState()]
            expect(stakingInfo.share.toString()).to.equal('0')
            expect(state.totalShare.toString()).to.equal('0')
        });
    });
    describe("castVote", async () => {
        it("Nothing to cast", async () => {
            expect(governanceInstance.castVote(1, VOTE_YES, toUnitString("2"))).to.be.revertedWith("Poll does not exist");
            expect(governanceInstance.castVote(0, VOTE_NO, toUnitString("2"))).to.be.revertedWith("Poll does not exist");
        });

        it("No share is staked", async () => {
            let [proposer, staker1] = [account1, account2, account3];
            let [pollId] = await createDefaultPoll(proposer);
            let instance = governanceInstance.connect(staker1);
            expect(instance.castVote(pollId, VOTE_YES, toUnitString("2"))).to.be.revertedWith("No share is staked");
        });

        it("caset vote", async () => {
            let [proposer, staker1, staker2] = [account1, account2, account3];
            let [pollId] = await createDefaultPoll(proposer);
            let stakingAmount = toUnit("200")
            let instance = governanceInstance.connect(staker1);
            let token = kalaToken.connect(staker1);
            await token.approve(instance.address, stakingAmount.toString());
            await instance.stakeVotingTokens(stakingAmount.toString());

            let castAmount = stakingAmount.add(toUnit("20"));

            expect(instance.castVote(pollId, VOTE_YES, castAmount.toString())).to.be.revertedWith("revert User does not have enough staked tokens");

            castAmount = stakingAmount.sub(toUnit("20"));
            await instance.castVote(pollId, VOTE_YES, castAmount.toString());

            expect(instance.castVote(pollId, VOTE_YES, castAmount.toString())).to.be.revertedWith("User has already voted");

            let poll = await instance.queryPoll(pollId);

            expect(poll.yesVotes.toString()).to.equal(castAmount.toString())
            expect(poll.noVotes.toString()).to.equal('0')


            //another staker
            instance = governanceInstance.connect(staker2);
            token = kalaToken.connect(staker2);
            stakingAmount = toUnit("300")
            await token.approve(instance.address, stakingAmount.toString());
            await instance.stakeVotingTokens(stakingAmount.toString());
            await instance.castVote(pollId, VOTE_NO, stakingAmount.toString());
            poll = await instance.queryPoll(pollId);
            expect(poll.noVotes.toString()).to.equal(stakingAmount.toString());
        });
    });
    describe("endPoll", async () => {
        it("check input params", async () => {
            let instance = governanceInstance.connect(account1);
            expect(instance.endPoll(1)).to.be.revertedWith("Nothing to end");
            let [pollId] = await createDefaultPoll(account1);
            expect(instance.endPoll(pollId)).to.be.revertedWith("Voting period has not expired");
        });

        it("endPoll rejected", async () => {
            await updateConfigPeriods();
            let [pollId] = await createDefaultPoll(account1);
            let instance2 = governanceInstance.connect(account2);
            let amount2 = toUnit("100");
            await (kalaToken.connect(account2)).approve(instance2.address, amount2.toString());
            await instance2.stakeVotingTokens(amount2.toString());
            await instance2.endPoll(pollId);
            let poll = await instance2.queryPoll(pollId);
            expect(poll.status).to.equal(POLL_STATUS_REJECTED);
            expect(poll.yesVotes.toString()).to.equal('0');
            expect(poll.noVotes.toString()).to.equal('0');
        });

        it("endPoll passed", async () => {
            await updateConfigPeriods();
            let [pollId] = await createDefaultPoll(account1);
            let instance2 = governanceInstance.connect(account2);
            let amount2 = toUnit("2");

            await (kalaToken.connect(account2)).approve(instance2.address, amount2.toString());
            await instance2.stakeVotingTokens(amount2.toString());
            await instance2.castVote(pollId, VOTE_YES, amount2.toString())

            await instance2.endPoll(pollId);
            let poll = await instance2.queryPoll(pollId);
            expect(poll.status).to.equal(POLL_STATUS_PASSED);
            expect(poll.yesVotes.toString()).to.equal(amount2.toString());
            expect(poll.noVotes.toString()).to.equal('0');
        });
    });
    describe("executePoll", async () => {
        it("Invalid pollId", async () => {
            expect(governanceInstance.executePoll(12)).to.be.revertedWith("Invalid pollId");
        });

        it("Poll is not in passed status", async () => {
            let [pollId] = await createDefaultPoll(account1);
            expect(governanceInstance.executePoll(pollId)).to.be.revertedWith("Poll is not in passed status");
        });

        it("execute", async () => {
            await updateConfigPeriods();
            let [pollId] = await createDefaultPoll(account1);
            let instance2 = governanceInstance.connect(account2);
            let amount2 = toUnit("2");
            await (kalaToken.connect(account2)).approve(instance2.address, amount2.toString());
            await instance2.stakeVotingTokens(amount2.toString());
            await instance2.castVote(pollId, VOTE_YES, amount2.toString())
            await instance2.endPoll(pollId);
            await instance2.executePoll(pollId);
            let poll = await instance2.queryPoll(pollId);
            expect(poll.status).to.equal(POLL_STATUS_EXECUTED);
        });
    });
});