import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

/**
 * Example:
 *   - npx hardhat --network sepolia task:privyplay:address
 */
task("task:privyplay:address", "Prints the PrivyPlay address").setAction(async function (_taskArguments: TaskArguments, hre) {
  const { deployments } = hre;

  const privyPlay = await deployments.get("PrivyPlay");
  console.log("PrivyPlay address is " + privyPlay.address);
});

/**
 * Example:
 *   - npx hardhat --network sepolia task:privyplay:balance --player 0x...
 */
task("task:privyplay:balance", "Decrypt a player's encrypted balance")
  .addParam("player", "The player address")
  .addOptionalParam("address", "Optionally specify the PrivyPlay contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const deployment = taskArguments.address ? { address: taskArguments.address } : await deployments.get("PrivyPlay");
    console.log(`PrivyPlay: ${deployment.address}`);

    const signers = await ethers.getSigners();
    const contract = await ethers.getContractAt("PrivyPlay", deployment.address);

    const encryptedBalance = await contract.getBalance(taskArguments.player);
    if (encryptedBalance === ethers.ZeroHash) {
      console.log(`encrypted balance: ${encryptedBalance}`);
      console.log("clear balance    : 0");
      return;
    }

    const clearBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalance,
      deployment.address,
      signers[0],
    );

    console.log(`Encrypted balance: ${encryptedBalance}`);
    console.log(`Clear balance    : ${clearBalance}`);
  });

/**
 * Example:
 *   - npx hardhat --network sepolia task:privyplay:buy --value 0.1
 */
task("task:privyplay:buy", "Buy points with ETH")
  .addOptionalParam("address", "Optionally specify the PrivyPlay contract address")
  .addParam("value", "ETH amount to send")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const deployment = taskArguments.address ? { address: taskArguments.address } : await deployments.get("PrivyPlay");
    console.log(`PrivyPlay: ${deployment.address}`);

    const signers = await ethers.getSigners();
    const contract = await ethers.getContractAt("PrivyPlay", deployment.address);

    const tx = await contract.connect(signers[0]).buyPoints({ value: ethers.parseEther(taskArguments.value) });
    console.log(`Wait for tx:${tx.hash}...`);

    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

/**
 * Example:
 *   - npx hardhat --network sepolia task:privyplay:start
 */
task("task:privyplay:start", "Start a new game round")
  .addOptionalParam("address", "Optionally specify the PrivyPlay contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const deployment = taskArguments.address ? { address: taskArguments.address } : await deployments.get("PrivyPlay");
    console.log(`PrivyPlay: ${deployment.address}`);

    const signers = await ethers.getSigners();
    const contract = await ethers.getContractAt("PrivyPlay", deployment.address);

    const tx = await contract.connect(signers[0]).startGame();
    console.log(`Wait for tx:${tx.hash}...`);

    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

/**
 * Example:
 *   - npx hardhat --network sepolia task:privyplay:guess --big true
 */
task("task:privyplay:guess", "Submit an encrypted guess")
  .addOptionalParam("address", "Optionally specify the PrivyPlay contract address")
  .addParam("big", "true for big, false for small")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const deployment = taskArguments.address ? { address: taskArguments.address } : await deployments.get("PrivyPlay");
    console.log(`PrivyPlay: ${deployment.address}`);

    const signers = await ethers.getSigners();
    const contract = await ethers.getContractAt("PrivyPlay", deployment.address);

    const guess = taskArguments.big === "true";
    const encryptedInput = await fhevm
      .createEncryptedInput(deployment.address, signers[0].address)
      .addBool(guess)
      .encrypt();

    const tx = await contract.connect(signers[0]).submitGuess(encryptedInput.handles[0], encryptedInput.inputProof);
    console.log(`Wait for tx:${tx.hash}...`);

    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });
