// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, ebool, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {FHESafeMath} from "@openzeppelin/confidential-contracts/utils/FHESafeMath.sol";

contract SilentVault is ZamaEthereumConfig {
    IERC7984 public immutable cusdt;

    mapping(address account => euint64) private _staked;
    mapping(address account => euint64) private _borrowed;

    event Staked(address indexed user, euint64 amount, euint64 totalStaked);
    event Borrowed(address indexed user, euint64 amount, euint64 totalBorrowed);
    event Repaid(address indexed user, euint64 amount, euint64 totalBorrowed);
    event Withdrawn(address indexed user, euint64 amount, euint64 totalStaked);

    error ZeroAddress();

    constructor(address cusdt_) {
        if (cusdt_ == address(0)) {
            revert ZeroAddress();
        }
        cusdt = IERC7984(cusdt_);
    }

    function stakedBalance(address account) external view returns (euint64) {
        return _staked[account];
    }

    function borrowedBalance(address account) external view returns (euint64) {
        return _borrowed[account];
    }

    function stake(externalEuint64 encryptedAmount, bytes calldata inputProof) external returns (euint64) {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        FHE.allowThis(amount);

        euint64 transferred = cusdt.confidentialTransferFrom(msg.sender, address(this), amount);
        FHE.allowThis(transferred);
        FHE.allow(transferred, msg.sender);

        euint64 newStaked = FHE.add(_staked[msg.sender], transferred);
        _staked[msg.sender] = newStaked;
        FHE.allowThis(newStaked);
        FHE.allow(newStaked, msg.sender);

        emit Staked(msg.sender, transferred, newStaked);
        return newStaked;
    }

    function borrow(externalEuint64 encryptedAmount, bytes calldata inputProof) external returns (euint64) {
        euint64 requested = FHE.fromExternal(encryptedAmount, inputProof);
        FHE.allowThis(requested);

        euint64 currentBorrowed = _borrowed[msg.sender];
        euint64 currentStaked = _staked[msg.sender];
        euint64 candidateBorrowed = FHE.add(currentBorrowed, requested);
        ebool canBorrow = FHE.le(candidateBorrowed, currentStaked);

        euint64 approved = FHE.select(canBorrow, requested, FHE.asEuint64(0));
        euint64 newBorrowed = FHE.select(canBorrow, candidateBorrowed, currentBorrowed);
        FHE.allowThis(approved);
        FHE.allowThis(newBorrowed);

        _borrowed[msg.sender] = newBorrowed;
        FHE.allow(newBorrowed, msg.sender);

        euint64 transferred = cusdt.confidentialTransfer(msg.sender, approved);
        FHE.allowThis(transferred);
        FHE.allow(transferred, msg.sender);

        emit Borrowed(msg.sender, transferred, newBorrowed);
        return newBorrowed;
    }

    function repay(externalEuint64 encryptedAmount, bytes calldata inputProof) external returns (euint64) {
        euint64 requested = FHE.fromExternal(encryptedAmount, inputProof);
        FHE.allowThis(requested);

        euint64 currentBorrowed = _borrowed[msg.sender];
        euint64 repayAmount = FHE.min(requested, currentBorrowed);
        FHE.allowThis(repayAmount);

        euint64 newBorrowed = FHE.sub(currentBorrowed, repayAmount);
        _borrowed[msg.sender] = newBorrowed;
        FHE.allowThis(newBorrowed);
        FHE.allow(newBorrowed, msg.sender);

        euint64 transferred = cusdt.confidentialTransferFrom(msg.sender, address(this), repayAmount);
        FHE.allowThis(transferred);
        FHE.allow(transferred, msg.sender);

        emit Repaid(msg.sender, transferred, newBorrowed);
        return newBorrowed;
    }

    function withdraw(externalEuint64 encryptedAmount, bytes calldata inputProof) external returns (euint64) {
        euint64 requested = FHE.fromExternal(encryptedAmount, inputProof);
        FHE.allowThis(requested);

        euint64 currentStaked = _staked[msg.sender];
        euint64 currentBorrowed = _borrowed[msg.sender];
        (, euint64 available) = FHESafeMath.trySub(currentStaked, currentBorrowed);

        euint64 withdrawAmount = FHE.min(requested, available);
        FHE.allowThis(withdrawAmount);

        euint64 newStaked = FHE.sub(currentStaked, withdrawAmount);
        _staked[msg.sender] = newStaked;
        FHE.allowThis(newStaked);
        FHE.allow(newStaked, msg.sender);

        euint64 transferred = cusdt.confidentialTransfer(msg.sender, withdrawAmount);
        FHE.allowThis(transferred);
        FHE.allow(transferred, msg.sender);

        emit Withdrawn(msg.sender, transferred, newStaked);
        return newStaked;
    }
}
