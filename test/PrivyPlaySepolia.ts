import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, deployments } from "hardhat";
import { PrivyPlay } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  alice: HardhatEthersSigner;
};

describe("PrivyPlaySepolia", function () {
  let signers: Signers;
  let privyPlay: PrivyPlay;
  let privyPlayAddress: string;
  let step: number;
  let steps: number;

  function progress(message: string) {
    console.log(`${++step}/${steps} ${message}`);
  }

  before(async function () {
    if (fhevm.isMock) {
      console.warn(`This hardhat test suite can only run on Sepolia Testnet`);
      this.skip();
    }

    try {
      const privyPlayDeployment = await deployments.get("PrivyPlay");
      privyPlayAddress = privyPlayDeployment.address;
      privyPlay = await ethers.getContractAt("PrivyPlay", privyPlayDeployment.address);
    } catch (e) {
      (e as Error).message += ". Call 'npx hardhat deploy --network sepolia'";
      throw e;
    }

    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { alice: ethSigners[0] };
  });

  beforeEach(async () => {
    step = 0;
    steps = 0;
  });

  it("buys points and completes a round", async function () {
    steps = 12;
    this.timeout(4 * 40000);

    progress("Buying points with 0.01 ETH...");
    let tx = await privyPlay.connect(signers.alice).buyPoints({ value: ethers.parseEther("0.01") });
    await tx.wait();

    progress("Starting a game round...");
    tx = await privyPlay.connect(signers.alice).startGame();
    await tx.wait();

    progress("Checking game active...");
    expect(await privyPlay.isGameActive(signers.alice.address)).to.eq(true);

    progress("Fetching encrypted roll...");
    const encryptedRoll = await privyPlay.getLastRoll(signers.alice.address);

    progress(`Decrypting roll for ${privyPlayAddress}...`);
    const clearRoll = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      encryptedRoll,
      privyPlayAddress,
      signers.alice,
    );
    progress(`Clear roll=${clearRoll}`);

    const guessIsBig = clearRoll >= 4;

    progress("Encrypting guess...");
    const encryptedGuess = await fhevm
      .createEncryptedInput(privyPlayAddress, signers.alice.address)
      .addBool(guessIsBig)
      .encrypt();

    progress("Submitting guess...");
    tx = await privyPlay.connect(signers.alice).submitGuess(encryptedGuess.handles[0], encryptedGuess.inputProof);
    await tx.wait();

    progress("Checking game inactive...");
    expect(await privyPlay.isGameActive(signers.alice.address)).to.eq(false);

    progress("Decrypting reward...");
    const encryptedReward = await privyPlay.getLastReward(signers.alice.address);
    const clearReward = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedReward,
      privyPlayAddress,
      signers.alice,
    );
    progress(`Clear reward=${clearReward}`);

    progress("Decrypting balance...");
    const encryptedBalance = await privyPlay.getBalance(signers.alice.address);
    const clearBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalance,
      privyPlayAddress,
      signers.alice,
    );
    progress(`Clear balance=${clearBalance}`);

    expect(clearBalance).to.be.greaterThan(0);
  });
});
