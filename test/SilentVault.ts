import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import {
  ConfidentialUSDT,
  ConfidentialUSDT__factory,
  SilentVault,
  SilentVault__factory,
} from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const cusdtFactory = (await ethers.getContractFactory("ConfidentialUSDT")) as ConfidentialUSDT__factory;
  const cusdt = (await cusdtFactory.deploy()) as ConfidentialUSDT;
  const cusdtAddress = await cusdt.getAddress();

  const vaultFactory = (await ethers.getContractFactory("SilentVault")) as SilentVault__factory;
  const vault = (await vaultFactory.deploy(cusdtAddress)) as SilentVault;
  const vaultAddress = await vault.getAddress();

  return { cusdt, vault, cusdtAddress, vaultAddress };
}

describe("SilentVault", function () {
  let signers: Signers;
  let cusdt: ConfidentialUSDT;
  let vault: SilentVault;
  let cusdtAddress: string;
  let vaultAddress: string;

  before(async function () {
    const ethSigners = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("This hardhat test suite cannot run on Sepolia Testnet");
      this.skip();
    }

    ({ cusdt, vault, cusdtAddress, vaultAddress } = await deployFixture());
  });

  it("stakes, borrows, repays, and withdraws with encrypted balances", async function () {
    const mintAmount = 1_000n;
    await cusdt.connect(signers.deployer).mint(signers.alice.address, mintAmount);

    const operatorUntil = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
    await cusdt.connect(signers.alice).setOperator(vaultAddress, operatorUntil);

    const stakeAmount = 100n;
    const encryptedStake = await fhevm
      .createEncryptedInput(vaultAddress, signers.alice.address)
      .add64(stakeAmount)
      .encrypt();
    await vault.connect(signers.alice).stake(encryptedStake.handles[0], encryptedStake.inputProof);

    const borrowAmount = 40n;
    const encryptedBorrow = await fhevm
      .createEncryptedInput(vaultAddress, signers.alice.address)
      .add64(borrowAmount)
      .encrypt();
    await vault.connect(signers.alice).borrow(encryptedBorrow.handles[0], encryptedBorrow.inputProof);

    const repayAmount = 15n;
    const encryptedRepay = await fhevm
      .createEncryptedInput(vaultAddress, signers.alice.address)
      .add64(repayAmount)
      .encrypt();
    await vault.connect(signers.alice).repay(encryptedRepay.handles[0], encryptedRepay.inputProof);

    const withdrawAmount = 30n;
    const encryptedWithdraw = await fhevm
      .createEncryptedInput(vaultAddress, signers.alice.address)
      .add64(withdrawAmount)
      .encrypt();
    await vault.connect(signers.alice).withdraw(encryptedWithdraw.handles[0], encryptedWithdraw.inputProof);

    const stakedHandle = await vault.stakedBalance(signers.alice.address);
    const borrowedHandle = await vault.borrowedBalance(signers.alice.address);
    const balanceHandle = await cusdt.confidentialBalanceOf(signers.alice.address);

    const decryptedStaked = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      stakedHandle,
      vaultAddress,
      signers.alice,
    );
    const decryptedBorrowed = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      borrowedHandle,
      vaultAddress,
      signers.alice,
    );
    const decryptedBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      balanceHandle,
      cusdtAddress,
      signers.alice,
    );

    expect(decryptedStaked).to.eq(70n);
    expect(decryptedBorrowed).to.eq(25n);
    expect(decryptedBalance).to.eq(955n);
  });
});
