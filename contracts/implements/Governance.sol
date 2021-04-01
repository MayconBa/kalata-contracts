// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../interfaces/IGovernance.sol";
import "../interfaces/IBEP20Token.sol";
import "../libraries/SafeDecimalMath.sol";
import "../libraries/String.sol";

/**
    The Governance Contract contains logic for holding pollsMap and Kalata Token (KALA) staking,
        and allows the Kalata Protocol to be governed by its users in a decentralized manner.
        After the initial bootstrapping of Kalata Protocol contracts,
        the Governance Contract is assigned to be the owner of itself and Kalata Factory.

    New proposals for change are submitted as pollsMap, and are voted on by KALA stakers through the voting procedure.
        Polls can contain messages that can be executed directly without changing the Kalata Protocol code.

    The Governance Contract keeps a balance of KALA tokens, which it uses to reward stakers with funds it receives
        from trading fees sent by the Kalata Collector and user deposits from creating new governance pollsMap.
        This balance is separate from the Community Pool, which is held by the Community contract (owned by the Governance contract).
*/
contract Governance is OwnableUpgradeable, IGovernance {
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using String for string;

    uint constant  MIN_TITLE_LENGTH = 4;
    uint constant  MAX_TITLE_LENGTH = 64;
    uint constant  MIN_DESC_LENGTH = 4;
    uint constant  MAX_DESC_LENGTH = 256;


    Config config;
    State state;

    //pollId=>Pool
    mapping(uint => Poll) pollsMap;

    uint[] pollIds;

    //pollId=>AddressVoterInfo
    mapping(uint => AddressVoterInfo[]) pollVotes;

    //voter=> StakingInfo
    mapping(address => StakingInfo) stakingInfos;

    //pollKey=>pollId;
    mapping(bytes32 => uint) pollKeyIdMap;


    function initialize(address govToken, uint quorum, uint threshold, uint votingPeriod, uint effectiveDelay, uint expirationPeriod, uint proposalDeposit)
    external virtual initializer {
        __Ownable_init();
        config = Config({
        govToken : govToken,
        quorum : quorum,
        threshold : threshold,
        votingPeriod : votingPeriod,
        effectiveDelay : effectiveDelay,
        expirationPeriod : expirationPeriod,
        proposalDeposit : proposalDeposit
        });


    }

    /***
       Create a new poll
       Issued when sending KALA tokens to the Governance contract to create a new poll.
       Will only succeed if the amount of tokens sent meets the configured proposal_deposit amount.
       About pollKey:  this.function cannot not return any data except the transaction receipt.  So add a pollKey for searching
   */
    function createPoll(uint depositAmount, string calldata title, string calldata description, bytes32 pollKey) override external {
        address proposer = _msgSender();
        uint titleLength = bytes(title).length;
        uint descriptionLength = bytes(description).length;

        require(titleLength >= MIN_TITLE_LENGTH, "Title too short");
        require(titleLength <= MAX_TITLE_LENGTH, "Title too long");

        require(descriptionLength >= MIN_DESC_LENGTH, "Description too short");
        require(descriptionLength <= MAX_DESC_LENGTH, "Description too long");

        require(depositAmount >= config.proposalDeposit, "deposit amount is not enough");

        require(IERC20(config.govToken).transferFrom(proposer, address(this), depositAmount), "Unable to execute transferFrom, recipient may have reverted");

        uint pollId = state.pollCount.add(1);

        state.pollCount = pollId;

        state.totalDeposit = state.totalDeposit.add(depositAmount);

        Poll memory newPoll = Poll({
        id : pollId,
        key : pollKey,
        creator : proposer,
        status : PollStatus.InProgress,
        yesVotes : 0,
        noVotes : 0,
        endHeight : block.number.add(config.votingPeriod),
        title : title,
        description : description,
        depositAmount : depositAmount,
        totalBalanceAtEndPoll : 0
        });

        savePoll(pollId, newPoll);


        pollKeyIdMap[pollKey] = pollId;
        emit CreatePoll(newPoll.creator, pollId, newPoll.endHeight);
    }

    function queryPollId(bytes32 pollKey) override external view returns (uint pollId){
        pollId = pollKeyIdMap[pollKey];
    }

    // sender is the user account
    // user->KalaToken.tansfer(govAddress,amount) -> forward to this method
    function stakeVotingTokens(uint amount) override external {
        address sender = _msgSender();
        require(amount != 0, "Insufficient funds sent");

        //address(this) is Governance contract address, as  govToken account address

        require(IERC20(config.govToken).transferFrom(sender, address(this), amount), "Unable to execute transferFrom, recipient may have reverted");

        //get the totalBalance(without
        uint totalBalance = loadTokenBalance(config.govToken, address(this)).sub(state.totalDeposit).sub(amount);

        uint share = amount;

        if (totalBalance > 0 && state.totalShare > 0) {
            share = amount.multiplyDecimal(state.totalShare.divideDecimal(totalBalance));
        }

        stakingInfos[sender].share = stakingInfos[sender].share.add(share);

        state.totalShare = state.totalShare.add(share);

        emit StakeVotingTokens(sender, share, amount);
    }

    //Updates the configuration for the Governance contract.
    function updateConfig(uint quorum, uint threshold, uint votingPeriod, uint effectiveDelay, uint expirationPeriod, uint proposalDeposit) override external onlyOwner {
        Config memory m = config;
        m.quorum = quorum;
        m.threshold = threshold;
        m.votingPeriod = votingPeriod;
        m.effectiveDelay = effectiveDelay;
        m.expirationPeriod = expirationPeriod;
        m.proposalDeposit = proposalDeposit;
        config = m;
    }

    // Withdraw amount if not staked. By default all funds will be withdrawn.
    function withdrawVotingTokens(uint amount) override external {
        address sender = _msgSender();
        //Check if stakingInfo exists

        StakingInfo memory stakingInfo = stakingInfos[sender];

        require(stakingInfo.share > 0 || stakingInfo.lockedBalance.length > 0 || stakingInfo.participatedPolls.length > 0, "Nothing staked");

        uint totalShare = state.totalShare;

        uint tokenBalance = loadTokenBalance(config.govToken, address(this));

        uint totalBalance = tokenBalance.sub(state.totalDeposit);

        uint lockedBalance = getLockedBalance(sender);

        uint lockedShare = lockedBalance.multiplyDecimal(totalShare).divideDecimal(totalBalance);

        uint withdrawShare = amount == 0 ? stakingInfos[sender].share : amount.multiplyDecimal(totalShare).divideDecimal(totalBalance);

        require(lockedShare + withdrawShare <= stakingInfos[sender].share, "User is trying to withdraw too many tokens.");
        uint share = stakingInfos[sender].share.sub(withdrawShare);
        stakingInfos[sender].share = share;
        state.totalShare = totalShare.sub(withdrawShare);

        IBEP20Token(config.govToken).transfer(sender, amount);
    }

    function endPoll(uint pollId) override external {
        require(pollsMap[pollId].id == pollId, "Nothing to end");
        require(pollsMap[pollId].status == PollStatus.InProgress, "Poll is not in progress");

        //console.log("pollsMap[pollId].endHeight", pollsMap[pollId].endHeight);
        //console.log("block.number", block.number);
        require(pollsMap[pollId].endHeight <= block.number, "Voting period has not expired");
        require(state.totalShare > 0, "Nothing staked");

        uint noVotes = pollsMap[pollId].noVotes;
        uint yesVotes = pollsMap[pollId].yesVotes;

        uint talliedWeight = yesVotes + noVotes;

        uint tokenBalance = loadTokenBalance(config.govToken, address(this));

        uint stakedWeight = tokenBalance.sub(state.totalDeposit);
        //console.log("stakedWeight", stakedWeight);

        uint quorum = talliedWeight > 0 && stakedWeight > 0 ? talliedWeight.divideDecimal(stakedWeight) : 0;

        //console.log("quorum", quorum);
        //console.log("config.quorum", config.quorum);

        string memory rejectedReason = "";
        bool passed = false;
        PollStatus pollStatus = PollStatus.Rejected;

        if (quorum < config.quorum) {
            rejectedReason = "Quorum not reached";
        } else {
            if (yesVotes.divideDecimal(talliedWeight) > config.threshold) {
                pollStatus = PollStatus.Passed;
                passed = true;
            } else {
                rejectedReason = "Threshold not reached";
            }
            //Refunds deposit only when quorum is reached
            if (pollsMap[pollId].depositAmount != 0) {
                IBEP20Token(config.govToken).transfer(pollsMap[pollId].creator, pollsMap[pollId].depositAmount);
            }
        }

        state.totalDeposit = state.totalDeposit.sub(pollsMap[pollId].depositAmount);


        //Update poll status
        pollsMap[pollId].status = pollStatus;
        pollsMap[pollId].totalBalanceAtEndPoll = stakedWeight;

        for (uint i = 0; i < pollVotes[pollId].length; i++) {
            unlockTokens(pollVotes[pollId][i].voter, pollId);
        }

        delete pollVotes[pollId];

        emit EndPoll(pollId, passed, rejectedReason);
    }


    function executePoll(uint pollId) override external {
        Poll storage poll = pollsMap[pollId];
        require(poll.id == pollId, "Invalid pollId");
        require(poll.status == PollStatus.Passed, "Poll is not in passed status");
        require(poll.endHeight + config.effectiveDelay <= block.number, "Effective delay has not expired");

        poll.status = PollStatus.Executed;

        //Each poll may have different task to execute


    }
    /// ExpirePoll is used to make the poll as expired state for querying purpose
    function expirePoll(uint pollId) override external {
        Poll storage poll = pollsMap[pollId];
        require(poll.status == PollStatus.Passed, "Poll is not in passed status");

        //TODO, Each poll may have different task to execute
        require(poll.endHeight + config.expirationPeriod <= block.number, "Expire height has not been reached");
        poll.status = PollStatus.Expired;
    }


    function castVote(uint pollId, VoteOption vote, uint amount) override external {
        address sender = _msgSender();
        require(pollId != 0 && state.pollCount >= pollId, "Poll does not exist");

        Poll memory poll = pollsMap[pollId];

        require(poll.status == PollStatus.InProgress, "Poll is not in progress");
        //console.log("cat block.number", block.number);
        //console.log("cat poll.endHeight", poll.endHeight);

        require(block.number <= poll.endHeight, "Not casting time");

        for (uint i = 0; i < pollVotes[pollId].length; i++) {
            if (pollVotes[pollId][i].voter == sender) {
                revert("User has already voted");
            }
        }

        uint totalShare = state.totalShare;
        require(totalShare > 0, "No share is staked");
        ////console.log("totalShare", totalShare);

        StakingInfo storage stakingInfo = stakingInfos[sender];
        require(stakingInfo.share > 0, "No share is staked by sender");

        //This is the staker's balance.
        uint totalBalance = loadTokenBalance(config.govToken, address(this)).sub(state.totalDeposit);

        require(totalBalance > 0, "Staker's balance is a zero now");

        require(stakingInfo.share.multiplyDecimal(totalBalance.divideDecimal(totalShare)) >= amount, "User does not have enough staked tokens.");

        if (VoteOption.Yes == vote) {
            poll.yesVotes += amount;
        } else {
            poll.noVotes += amount;
        }

        pollsMap[pollId] = poll;

        stakingInfo.participatedPolls.push(pollId);
        stakingInfo.lockedBalance.push(PollIdVoterInfo({pollId : pollId, vote : vote, balance : amount}));

        pollVotes[pollId].push(AddressVoterInfo({voter : sender, vote : vote, balance : amount}));

        emit CastVote(pollId, vote, amount);
    }


    function queryConfig() override external view returns (
        address govToken, //Contract address of Kalata Token (KALA)
        uint quorum, //Minimum percentage of participation required for a poll to pass
        uint threshold, //Minimum percentage of yes votes required for a poll to pass
        uint votingPeriod, //Number of blocks during which votes can be cast
        uint effectiveDelay, //Number of blocks after a poll passes to apply changes
        uint expirationPeriod, //Number of blocks after a poll's voting period during which the poll can be executed.
        uint proposalDeposit //Minimum KALA deposit required for a new poll to be submitted
    ){
        Config memory m = config;
        (govToken,quorum,threshold,votingPeriod,effectiveDelay,expirationPeriod,proposalDeposit) =
        (m.govToken, m.quorum, m.threshold, m.votingPeriod, m.effectiveDelay, m.expirationPeriod, m.proposalDeposit);
    }

    function queryState() override external view returns (uint pollCount, uint totalShare, uint totalDeposit) {
        State memory m = state;
        (pollCount, totalShare, totalDeposit) = (m.pollCount, m.totalShare, m.totalDeposit);
    }

    function queryPoll(uint pollId) override external view returns (
        uint id,
        address creator,
        PollStatus status,
        uint yesVotes,
        uint noVotes,
        uint endHeight,
        string memory title,
        string memory description,
        uint depositAmount,
        uint totalBalanceAtEndPoll
    ){
        Poll memory poll = pollsMap[pollId];
        id = poll.id;
        creator = poll.creator;
        status = poll.status;
        yesVotes = poll.yesVotes;
        noVotes = poll.noVotes;
        endHeight = poll.endHeight;
        title = poll.title;
        description = poll.description;
        depositAmount = poll.depositAmount;
        totalBalanceAtEndPoll = poll.totalBalanceAtEndPoll;
    }

    function queryStakingInfo(address account) override external view returns (
        uint share,
        uint[] memory lockedBalancePollIdArray,
        VoteOption[] memory lockedBalanceVoteOptionArray,
        uint[] memory lockedBalance,
        uint[] memory participatedPolls
    ){
        StakingInfo memory stakingInfo = stakingInfos[account];
        share = stakingInfo.share;
        participatedPolls = stakingInfo.participatedPolls;

        lockedBalancePollIdArray = new uint[](stakingInfo.lockedBalance.length);
        lockedBalanceVoteOptionArray = new VoteOption[](stakingInfo.lockedBalance.length);
        lockedBalance = new uint[](stakingInfo.lockedBalance.length);
        for (uint i = 0; i < stakingInfo.lockedBalance.length; i++) {
            PollIdVoterInfo memory info = stakingInfo.lockedBalance[i];
            lockedBalancePollIdArray[i] = info.pollId;
            lockedBalanceVoteOptionArray[i] = info.vote;
            lockedBalance[i] = info.balance;
        }
    }


    //Returning too many variables is not allowed in solidity.
    //Only return id/title array currently, Add other proerties if needed in future.
    function queryAllPolls() override external view returns (uint[] memory allPollIds, bytes32[] memory allTitles){
        allPollIds = pollIds;
        allTitles = new bytes32[](allPollIds.length);
        for (uint i = 0; i < allPollIds.length; i++) {
            allTitles[i] = pollsMap[allPollIds[i]].title.convertToBytes32();
        }
    }


    function queryVoters(uint pollId) override external view returns (address[] memory voters, VoteOption[] memory votes, uint[] memory balances){
        uint length = pollVotes[pollId].length;
        voters = new address[](length);
        votes = new VoteOption[](length);
        balances = new uint[](length);
        for (uint i = 0; i < length; i++) {
            AddressVoterInfo memory info = pollVotes[pollId][i];
            voters[i] = info.voter;
            votes[i] = info.vote;
            balances[i] = info.balance;
        }
    }



    //////private functions/////////////////////////////


    // finds the largest locked amount in participated pollsMap.
    function getLockedBalance(address voter) internal virtual view returns (uint){
        uint maxBalance = 0;
        for (uint i = 0; i < stakingInfos[voter].lockedBalance.length; i++) {
            uint balance = stakingInfos[voter].lockedBalance[i].balance;
            if (balance > maxBalance) {
                maxBalance = balance;
            }
        }
        return maxBalance;
    }

    function loadTokenBalance(address contractAddr, address accountAddr) private view returns (uint) {
        return IBEP20Token(contractAddr).balanceOf(accountAddr);
    }


    function unlockTokens(address voter, uint pollId) internal virtual {
        StakingInfo storage stakingInfo = stakingInfos[voter];
        PollIdVoterInfo[] memory lockedBalance = stakingInfo.lockedBalance;
        delete stakingInfo.lockedBalance;
        for (uint i = 0; i < lockedBalance.length; i++) {
            if (lockedBalance[i].pollId != pollId) {
                stakingInfo.lockedBalance.push(lockedBalance[i]);
            }
        }
    }


    function savePoll(uint pollId, Poll memory poll) internal virtual {
        bool exists = false;
        for (uint i = 0; i < pollIds.length; i++) {
            if (pollIds[i] == pollId) {
                exists = true;
                break;
            }
        }
        if (!exists) {
            pollIds.push(pollId);
        }
        pollsMap[pollId] = poll;
    }

    function removePoll(uint pollId) internal virtual {
        delete pollsMap[pollId];
        uint length = pollIds.length;
        for (uint i = 0; i < length; i++) {
            if (pollIds[i] == pollId) {
                if (i != length - 1) {
                    pollIds[i] = pollIds[length - 1];
                }
                delete pollIds[length - 1];
            }
        }
    }

}