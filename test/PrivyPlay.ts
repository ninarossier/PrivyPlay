import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { PrivyPlay, PrivyPlay__factory } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("PrivyPlay")) as PrivyPlay__factory;
  const privyPlay = (await factory.deploy()) as PrivyPlay;
  const privyPlayAddress = await privyPlay.getAddress();

  return { privyPlay, privyPlayAddress };
}

describe("PrivyPlay", function () {
  let signers: Signers;
  let privyPlay: PrivyPlay;
  let privyPlayAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ privyPlay, privyPlayAddress } = await deployFixture());
  });

  it("buys points, plays a round, and wins with a correct guess", async function () {
    const depositTx = await privyPlay.connect(signers.alice).buyPoints({ value: ethers.parseEther("1") });
    await depositTx.wait();

    const encryptedBalanceAfterDeposit = await privyPlay.getBalance(signers.alice.address);
    const clearBalanceAfterDeposit = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalanceAfterDeposit,
      privyPlayAddress,
      signers.alice,
    );
    expect(clearBalanceAfterDeposit).to.eq(1_000_000);

    const startTx = await privyPlay.connect(signers.alice).startGame();
    await startTx.wait();

    expect(await privyPlay.isGameActive(signers.alice.address)).to.eq(true);

    const encryptedBalanceAfterStart = await privyPlay.getBalance(signers.alice.address);
    const clearBalanceAfterStart = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalanceAfterStart,
      privyPlayAddress,
      signers.alice,
    );
    expect(clearBalanceAfterStart).to.eq(999_900);

    const encryptedRoll = await privyPlay.getLastRoll(signers.alice.address);
    const clearRoll = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      encryptedRoll,
      privyPlayAddress,
      signers.alice,
    );
    expect(clearRoll).to.be.gte(1).and.to.be.lte(6);

    const guessIsBig = clearRoll >= 4;
    const encryptedGuess = await fhevm
      .createEncryptedInput(privyPlayAddress, signers.alice.address)
      .addBool(guessIsBig)
      .encrypt();

    const guessTx = await privyPlay
      .connect(signers.alice)
      .submitGuess(encryptedGuess.handles[0], encryptedGuess.inputProof);
    await guessTx.wait();

    expect(await privyPlay.isGameActive(signers.alice.address)).to.eq(false);

    const encryptedReward = await privyPlay.getLastReward(signers.alice.address);
    const clearReward = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedReward,
      privyPlayAddress,
      signers.alice,
    );
    expect(clearReward).to.eq(1_000);

    const encryptedBalanceAfterGuess = await privyPlay.getBalance(signers.alice.address);
    const clearBalanceAfterGuess = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalanceAfterGuess,
      privyPlayAddress,
      signers.alice,
    );
    expect(clearBalanceAfterGuess).to.eq(1_000_900);
  });
});
