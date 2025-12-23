import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

task("vault:address", "Prints the SilentVault and ConfidentialUSDT addresses").setAction(
  async function (_taskArguments: TaskArguments, hre) {
    const { deployments } = hre;

    const vault = await deployments.get("SilentVault");
    const cusdt = await deployments.get("ConfidentialUSDT");

    console.log(`SilentVault: ${vault.address}`);
    console.log(`ConfidentialUSDT: ${cusdt.address}`);
  },
);

task("vault:operator", "Approves SilentVault as operator for cUSDT")
  .addOptionalParam("until", "Unix timestamp (uint48) for operator expiration")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const signers = await ethers.getSigners();
    const signer = signers[0];
    const cusdt = await deployments.get("ConfidentialUSDT");
    const vault = await deployments.get("SilentVault");

    const until =
      taskArguments.until && Number.isFinite(Number(taskArguments.until))
        ? Number(taskArguments.until)
        : Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;

    const cusdtContract = await ethers.getContractAt("ConfidentialUSDT", cusdt.address);
    const tx = await cusdtContract.connect(signer).setOperator(vault.address, until);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

task("vault:mint", "Mints cUSDT to the first signer")
  .addParam("amount", "The mint amount (uint64)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const signers = await ethers.getSigners();
    const signer = signers[0];
    const cusdt = await deployments.get("ConfidentialUSDT");

    const amount = BigInt(taskArguments.amount);
    const cusdtContract = await ethers.getContractAt("ConfidentialUSDT", cusdt.address);
    const tx = await cusdtContract.connect(signer).mint(signer.address, amount);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

task("vault:stake", "Stakes cUSDT into SilentVault")
  .addParam("amount", "Stake amount (uint64)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const signers = await ethers.getSigners();
    const signer = signers[0];

    const vault = await deployments.get("SilentVault");
    const vaultContract = await ethers.getContractAt("SilentVault", vault.address);

    const amount = BigInt(taskArguments.amount);
    const encrypted = await fhevm.createEncryptedInput(vault.address, signer.address).add64(amount).encrypt();

    const tx = await vaultContract.connect(signer).stake(encrypted.handles[0], encrypted.inputProof);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

task("vault:borrow", "Borrows cUSDT from SilentVault")
  .addParam("amount", "Borrow amount (uint64)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const signers = await ethers.getSigners();
    const signer = signers[0];

    const vault = await deployments.get("SilentVault");
    const vaultContract = await ethers.getContractAt("SilentVault", vault.address);

    const amount = BigInt(taskArguments.amount);
    const encrypted = await fhevm.createEncryptedInput(vault.address, signer.address).add64(amount).encrypt();

    const tx = await vaultContract.connect(signer).borrow(encrypted.handles[0], encrypted.inputProof);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

task("vault:repay", "Repays cUSDT to SilentVault")
  .addParam("amount", "Repay amount (uint64)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const signers = await ethers.getSigners();
    const signer = signers[0];

    const vault = await deployments.get("SilentVault");
    const vaultContract = await ethers.getContractAt("SilentVault", vault.address);

    const amount = BigInt(taskArguments.amount);
    const encrypted = await fhevm.createEncryptedInput(vault.address, signer.address).add64(amount).encrypt();

    const tx = await vaultContract.connect(signer).repay(encrypted.handles[0], encrypted.inputProof);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

task("vault:withdraw", "Withdraws cUSDT from SilentVault")
  .addParam("amount", "Withdraw amount (uint64)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const signers = await ethers.getSigners();
    const signer = signers[0];

    const vault = await deployments.get("SilentVault");
    const vaultContract = await ethers.getContractAt("SilentVault", vault.address);

    const amount = BigInt(taskArguments.amount);
    const encrypted = await fhevm.createEncryptedInput(vault.address, signer.address).add64(amount).encrypt();

    const tx = await vaultContract.connect(signer).withdraw(encrypted.handles[0], encrypted.inputProof);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

task("vault:position", "Decrypts staked and borrowed balances for the first signer").setAction(
  async function (_taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const signers = await ethers.getSigners();
    const signer = signers[0];

    const vault = await deployments.get("SilentVault");
    const cusdt = await deployments.get("ConfidentialUSDT");

    const vaultContract = await ethers.getContractAt("SilentVault", vault.address);
    const cusdtContract = await ethers.getContractAt("ConfidentialUSDT", cusdt.address);

    const [stakedHandle, borrowedHandle, balanceHandle] = await Promise.all([
      vaultContract.stakedBalance(signer.address),
      vaultContract.borrowedBalance(signer.address),
      cusdtContract.confidentialBalanceOf(signer.address),
    ]);

    const decryptedStaked =
      stakedHandle === ZERO_HASH
        ? 0
        : await fhevm.userDecryptEuint(FhevmType.euint64, stakedHandle, vault.address, signer);
    const decryptedBorrowed =
      borrowedHandle === ZERO_HASH
        ? 0
        : await fhevm.userDecryptEuint(FhevmType.euint64, borrowedHandle, vault.address, signer);
    const decryptedBalance =
      balanceHandle === ZERO_HASH
        ? 0
        : await fhevm.userDecryptEuint(FhevmType.euint64, balanceHandle, cusdt.address, signer);

    console.log(`cUSDT balance: ${decryptedBalance}`);
    console.log(`Staked: ${decryptedStaked}`);
    console.log(`Borrowed: ${decryptedBorrowed}`);
  },
);
