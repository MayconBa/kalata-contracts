// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;




/// The Governance Contract contains logic for holding polls and Kalata Token (KALA) staking,
/// and allows the Kalata Protocol to be governed by its users in a decentralized manner.
/// After the initial bootstrapping of Kalata Protocol contracts,
/// the Governance Contract is assigned to be the owner of itself and Kalata Factory.

/// New proposals for change are submitted as polls, and are voted on by KALA stakers through the voting procedure.
/// Polls can contain messages that can be executed directly without changing the Kalata Protocol code.

/// The Governance Contract keeps a balance of KALA tokens, which it uses to reward stakers
/// with funds it receives from trading fees sent by the Kalata Collector
/// and user deposits from creating new governance polls.
/// This balance is separate from the Community Pool,
/// which is held by the Community contract (owned by the Governance contract).
interface IGovernance {

    struct Config {
        //Contract address of Kalata Token (KALA)
        address govToken;

        //Minimum percentage of participation required for a poll to pass
        uint quorum;

        //Minimum percentage of yes votes required for a poll to pass
        uint threshold;

        //Number of blocks during which votes can be cast
        uint votingPeriod;

        //Number of blocks after a poll passes to apply changes
        uint effectiveDelay;

        //Number of blocks after a poll's voting period during which the poll can be executed.
        uint expirationPeriod;

        //Minimum KALA deposit required for a new poll to be submitted
        uint proposalDeposit;
    }


    struct State {
        uint pollCount;
        uint totalShare;
        uint totalDeposit;
    }

    enum VoteOption {Yes, No}

    //struct VoterInfo {VoteOption vote; uint balance;}

    struct PollIdVoterInfo {
        uint pollId;
        VoteOption vote;
        uint balance;
    }

    struct AddressVoterInfo {
        address voter;
        VoteOption vote;
        uint balance;
    }

    struct StakingInfo {
        // total staked balance
        uint share;

        PollIdVoterInfo[] lockedBalance;

        //poolId
        uint[] participatedPolls;
    }


    enum PollStatus {
        InProgress,
        Passed,
        Rejected,
        Executed,
        Expired
    }

    struct ExecuteData {
        //原名为contract
        address targetContract;
        bytes32 msg;
    }

    struct Poll {
        uint id;
        bytes32 key;
        address creator;
        PollStatus status;
        uint yesVotes;
        uint noVotes;

        uint endHeight;

        string title;

        string description;

        uint depositAmount;

        // Total balance at the end poll
        uint totalBalanceAtEndPoll;
    }


    function stakeVotingTokens(uint amount) external;

    function updateConfig(uint quorum, uint threshold, uint votingPeriod, uint effectiveDelay, uint expirationPeriod, uint proposalDeposit) external;
    // Withdraw amount if not staked. By default all funds will be withdrawn.
    function withdrawVotingTokens(uint amount) external;


    /// create a new poll
    function createPoll(uint depositAmount, string calldata title, string calldata description, bytes32 positionKey) external;


    function queryPollId(bytes32 pollKey) external view returns (uint pollId);

    function endPoll(uint pollId) external;

    function executePoll(uint pollId) external;

    /// ExpirePoll is used to make the poll as expired state for querying purpose
    function expirePoll(uint pollId) external;

    function castVote(uint pollId, VoteOption vote, uint amount) external;

    function queryConfig() external view returns (
    //Contract address of Kalata Token (KALA)
        address govToken,
    //Minimum percentage of participation required for a poll to pass
        uint quorum,
    //Minimum percentage of yes votes required for a poll to pass
        uint threshold,
    //Number of blocks during which votes can be cast
        uint votingPeriod,
    //Number of blocks after a poll passes to apply changes
        uint effectiveDelay,
    //Number of blocks after a poll's voting period during which the poll can be executed.
        uint expirationPeriod,
    //Minimum KALA deposit required for a new poll to be submitted
        uint proposalDeposit

    );

    function queryState() external view returns (uint pollCount, uint totalShare, uint totalDeposit);

    function queryPoll(uint pollId) external view returns (
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
    );

    function queryAllPolls() external view returns (uint[] memory allPollIds, bytes32[] memory allTitles);

    function queryVoters(uint pollId) external view returns (
        address[] memory voters,
        VoteOption[] memory votes,
        uint[] memory balances
    );

    function queryStakingInfo(address account) external view returns (
        uint share,
        uint[] memory lockedBalancePollIdArray,
        VoteOption[] memory lockedBalanceVoteOptionArray,
        uint[] memory lockedBalance,
        uint[] memory participatedPolls
    );


    event CreatePoll(address creator, uint pollId, uint endHeight);
    event EndPoll(uint pollId, bool passed, string rejectedReason);
    event StakeVotingTokens(address sender, uint share, uint amount);

    event CastVote(uint pollId, VoteOption vote, uint amount);

}


