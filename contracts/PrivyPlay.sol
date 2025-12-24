// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint8, euint64, ebool, externalEbool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title PrivyPlay Dice Game
/// @notice Buy encrypted points, roll an encrypted dice, and guess big/small to win rewards.
contract PrivyPlay is ZamaEthereumConfig {
    uint256 public constant POINTS_PER_ETH = 1_000_000;
    uint64 public constant PLAY_COST = 100;
    uint64 public constant WIN_REWARD = 1_000;

    mapping(address => euint64) private balances;
    mapping(address => euint8) private lastRoll;
    mapping(address => ebool) private lastOutcome;
    mapping(address => euint64) private lastReward;
    mapping(address => ebool) private roundEligible;
    mapping(address => bool) private gameActive;

    event PointsPurchased(address indexed player, uint256 ethAmount, uint256 points);
    event GameStarted(address indexed player);
    event GuessSubmitted(address indexed player);

    /// @notice Buy encrypted points with ETH.
    function buyPoints() external payable {
        require(msg.value > 0, "No ETH sent");

        uint256 pointsValue = (msg.value * POINTS_PER_ETH) / 1 ether;
        require(pointsValue > 0, "Amount too small");
        require(pointsValue <= type(uint64).max, "Points overflow");

        euint64 encryptedPoints = FHE.asEuint64(uint64(pointsValue));
        balances[msg.sender] = FHE.add(balances[msg.sender], encryptedPoints);

        FHE.allowThis(balances[msg.sender]);
        FHE.allow(balances[msg.sender], msg.sender);

        emit PointsPurchased(msg.sender, msg.value, pointsValue);
    }

    /// @notice Start a game round: charge points and roll an encrypted dice (1-6).
    function startGame() external {
        require(!gameActive[msg.sender], "Game already active");
        gameActive[msg.sender] = true;

        euint64 cost = FHE.asEuint64(PLAY_COST);
        ebool hasEnough = FHE.ge(balances[msg.sender], cost);
        balances[msg.sender] = FHE.select(hasEnough, FHE.sub(balances[msg.sender], cost), balances[msg.sender]);
        roundEligible[msg.sender] = hasEnough;

        euint8 diceRoll = FHE.add(FHE.randEuint8(6), FHE.asEuint8(1));
        lastRoll[msg.sender] = diceRoll;

        FHE.allowThis(balances[msg.sender]);
        FHE.allow(balances[msg.sender], msg.sender);
        FHE.allowThis(roundEligible[msg.sender]);
        FHE.allowThis(lastRoll[msg.sender]);
        FHE.allow(lastRoll[msg.sender], msg.sender);

        emit GameStarted(msg.sender);
    }

    /// @notice Submit an encrypted guess (true for big, false for small).
    /// @param guess The encrypted guess
    /// @param inputProof The input proof
    function submitGuess(externalEbool guess, bytes calldata inputProof) external {
        require(gameActive[msg.sender], "No active game");
        gameActive[msg.sender] = false;

        ebool encryptedGuess = FHE.fromExternal(guess, inputProof);
        ebool isBig = FHE.ge(lastRoll[msg.sender], FHE.asEuint8(4));
        ebool isWin = FHE.eq(isBig, encryptedGuess);

        euint64 rewardIfWin = FHE.select(isWin, FHE.asEuint64(WIN_REWARD), FHE.asEuint64(0));
        euint64 reward = FHE.select(roundEligible[msg.sender], rewardIfWin, FHE.asEuint64(0));
        balances[msg.sender] = FHE.add(balances[msg.sender], reward);
        lastOutcome[msg.sender] = isWin;
        lastReward[msg.sender] = reward;

        FHE.allowThis(balances[msg.sender]);
        FHE.allow(balances[msg.sender], msg.sender);
        FHE.allowThis(lastOutcome[msg.sender]);
        FHE.allow(lastOutcome[msg.sender], msg.sender);
        FHE.allowThis(lastReward[msg.sender]);
        FHE.allow(lastReward[msg.sender], msg.sender);

        emit GuessSubmitted(msg.sender);
    }

    /// @notice Return the encrypted points balance for a player.
    function getBalance(address player) external view returns (euint64) {
        return balances[player];
    }

    /// @notice Return the encrypted last dice roll for a player.
    function getLastRoll(address player) external view returns (euint8) {
        return lastRoll[player];
    }

    /// @notice Return the encrypted last outcome (win/lose) for a player.
    function getLastOutcome(address player) external view returns (ebool) {
        return lastOutcome[player];
    }

    /// @notice Return the encrypted last reward for a player.
    function getLastReward(address player) external view returns (euint64) {
        return lastReward[player];
    }

    /// @notice Return whether a player has an active game round.
    function isGameActive(address player) external view returns (bool) {
        return gameActive[player];
    }
}
