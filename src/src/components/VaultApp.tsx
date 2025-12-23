import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { Contract, formatUnits, parseUnits } from 'ethers';
import { Header } from './Header';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { CUSDT_ABI, CUSDT_ADDRESS, VAULT_ABI, VAULT_ADDRESS } from '../config/contracts';
import '../styles/VaultApp.css';

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';
const DECIMALS = 6;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

type HandlesState = {
  wallet: string;
  staked: string;
  borrowed: string;
};

type PositionState = {
  wallet: bigint;
  staked: bigint;
  borrowed: bigint;
};

export function VaultApp() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [handles, setHandles] = useState<HandlesState>({
    wallet: ZERO_HASH,
    staked: ZERO_HASH,
    borrowed: ZERO_HASH,
  });
  const [position, setPosition] = useState<PositionState>({
    wallet: 0n,
    staked: 0n,
    borrowed: 0n,
  });
  const [isOperator, setIsOperator] = useState<boolean | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>('');
  const [error, setError] = useState<string>('');

  const [mintAmount, setMintAmount] = useState('');
  const [stakeAmount, setStakeAmount] = useState('');
  const [borrowAmount, setBorrowAmount] = useState('');
  const [repayAmount, setRepayAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');

  const vaultAddress = VAULT_ADDRESS as `0x${string}`;
  const tokenAddress = CUSDT_ADDRESS as `0x${string}`;
  const hasAddresses = vaultAddress !== ZERO_ADDRESS && tokenAddress !== ZERO_ADDRESS;

  const formatAmount = useCallback((value: bigint) => formatUnits(value, DECIMALS), []);

  const availableToWithdraw = useMemo(() => {
    if (position.staked <= position.borrowed) {
      return 0n;
    }
    return position.staked - position.borrowed;
  }, [position.staked, position.borrowed]);

  const parseAmount = (value: string) => {
    if (!value.trim()) {
      return null;
    }
    try {
      const parsed = parseUnits(value, DECIMALS);
      if (parsed <= 0n) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  };

  const refreshHandles = useCallback(async () => {
    if (!address || !publicClient) {
      return;
    }
    if (!hasAddresses) {
      setError('Update contract addresses in src/src/config/contracts.ts before reading.');
      return;
    }
    setIsReading(true);
    setError('');
    try {
      const [stakedHandle, borrowedHandle, walletHandle, operatorStatus] = await Promise.all([
        publicClient.readContract({
          address: vaultAddress,
          abi: VAULT_ABI,
          functionName: 'stakedBalance',
          args: [address],
        }),
        publicClient.readContract({
          address: vaultAddress,
          abi: VAULT_ABI,
          functionName: 'borrowedBalance',
          args: [address],
        }),
        publicClient.readContract({
          address: tokenAddress,
          abi: CUSDT_ABI,
          functionName: 'confidentialBalanceOf',
          args: [address],
        }),
        publicClient.readContract({
          address: tokenAddress,
          abi: CUSDT_ABI,
          functionName: 'isOperator',
          args: [address, vaultAddress],
        }),
      ]);

      setHandles({
        wallet: (walletHandle as string) || ZERO_HASH,
        staked: (stakedHandle as string) || ZERO_HASH,
        borrowed: (borrowedHandle as string) || ZERO_HASH,
      });
      setIsOperator(Boolean(operatorStatus));
    } catch (err) {
      console.error('Failed to refresh handles:', err);
      setError('Unable to read encrypted balances from the network.');
    } finally {
      setIsReading(false);
    }
  }, [address, publicClient, tokenAddress, vaultAddress, hasAddresses]);

  const decryptHandles = useCallback(
    async (targetHandles: string[], contractAddress: string) => {
      if (!instance || !address || !signerPromise) {
        return targetHandles.map(() => 0n);
      }

      const activeHandles = targetHandles.filter((handle) => handle !== ZERO_HASH);
      if (activeHandles.length === 0) {
        return targetHandles.map(() => 0n);
      }

      const keypair = instance.generateKeypair();
      const handleContractPairs = activeHandles.map((handle) => ({
        handle,
        contractAddress,
      }));
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '10';
      const contractAddresses = [contractAddress];

      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Wallet signer not available.');
      }

      const signature = await signer.signTypedData(
        eip712.domain,
        {
          UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
        },
        eip712.message,
      );

      const result = await instance.userDecrypt(
        handleContractPairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays,
      );

      return targetHandles.map((handle) => {
        if (handle === ZERO_HASH) {
          return 0n;
        }
        const value = result[handle];
        return value ? BigInt(value) : 0n;
      });
    },
    [address, instance, signerPromise],
  );

  const decryptPosition = useCallback(async () => {
    if (!address) {
      return;
    }
    if (!hasAddresses) {
      setError('Update contract addresses in src/src/config/contracts.ts before decrypting.');
      return;
    }
    setIsDecrypting(true);
    setError('');
    try {
      const [vaultValues, walletValues] = await Promise.all([
        decryptHandles([handles.staked, handles.borrowed], vaultAddress),
        decryptHandles([handles.wallet], tokenAddress),
      ]);

      setPosition({
        staked: vaultValues[0],
        borrowed: vaultValues[1],
        wallet: walletValues[0],
      });
    } catch (err) {
      console.error('Decryption failed:', err);
      setError('Decryption failed. Please sign the request again.');
    } finally {
      setIsDecrypting(false);
    }
  }, [address, decryptHandles, handles.borrowed, handles.staked, handles.wallet, tokenAddress, vaultAddress, hasAddresses]);

  const runAction = useCallback(
    async (label: string, action: () => Promise<void>) => {
      setActiveAction(label);
      setNotice('');
      setError('');
      try {
        await action();
        await refreshHandles();
        setNotice(`${label} confirmed.`);
      } catch (err) {
        console.error(`${label} failed:`, err);
        const message =
          err instanceof Error && err.message
            ? err.message
            : `${label} failed. Please check your wallet and try again.`;
        setError(message);
      } finally {
        setActiveAction(null);
      }
    },
    [refreshHandles],
  );

  const handleOperator = useCallback(() => {
    return runAction('Authorization', async () => {
      if (!signerPromise) {
        throw new Error('Signer missing');
      }
      if (!hasAddresses) {
        throw new Error('Contract addresses not configured');
      }
      const signer = await signerPromise;
      if (!signer || !address) {
        throw new Error('Wallet not connected');
      }
      const token = new Contract(tokenAddress, CUSDT_ABI, signer);
      const until = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
      setNotice('Confirm operator approval in your wallet.');
      const tx = await token.setOperator(vaultAddress, until);
      setNotice('Waiting for confirmation...');
      await tx.wait();
    });
  }, [address, runAction, signerPromise, tokenAddress, vaultAddress, hasAddresses]);

  const handleMint = useCallback(() => {
    return runAction('Mint', async () => {
      const amount = parseAmount(mintAmount);
      if (!amount) {
        throw new Error('Invalid amount');
      }
      if (!signerPromise || !address) {
        throw new Error('Signer missing');
      }
      if (!hasAddresses) {
        throw new Error('Contract addresses not configured');
      }
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer missing');
      }
      const token = new Contract(tokenAddress, CUSDT_ABI, signer);
      setNotice('Confirm mint in your wallet.');
      const tx = await token.mint(address, amount);
      setNotice('Waiting for confirmation...');
      await tx.wait();
      setMintAmount('');
    });
  }, [address, mintAmount, runAction, signerPromise, tokenAddress, hasAddresses]);

  const handleEncryptedAction = useCallback(
    async (label: string, method: 'stake' | 'borrow' | 'repay' | 'withdraw', amountValue: string, reset: () => void) => {
      return runAction(label, async () => {
        const amount = parseAmount(amountValue);
        if (!amount) {
          throw new Error('Invalid amount');
        }
        if (!instance || !address) {
          throw new Error('Encryption service unavailable');
        }
        if (!hasAddresses) {
          throw new Error('Contract addresses not configured');
        }
        if (!signerPromise) {
          throw new Error('Signer missing');
        }
        const signer = await signerPromise;
        if (!signer) {
          throw new Error('Signer missing');
        }

        const input = instance.createEncryptedInput(vaultAddress, address);
        input.add64(amount);
        const encrypted = await input.encrypt();

        const vault = new Contract(vaultAddress, VAULT_ABI, signer);
        setNotice(`Confirm ${label.toLowerCase()} in your wallet.`);
        const tx = await vault[method](encrypted.handles[0], encrypted.inputProof);
        setNotice('Waiting for confirmation...');
        await tx.wait();
        reset();
      });
    },
    [address, instance, runAction, signerPromise, vaultAddress, hasAddresses],
  );

  useEffect(() => {
    if (address) {
      refreshHandles();
    }
  }, [address, refreshHandles]);

  return (
    <div className="vault-shell">
      <Header />
      <main className="vault-app">
        <section className="hero">
          <div className="hero-copy">
            <p className="hero-eyebrow">Confidential Lending Vault</p>
            <h1 className="hero-title">Stake privately. Borrow instantly. Stay silent.</h1>
            <p className="hero-subtitle">
              Silent Vault encrypts every stake and loan. Your cUSDT positions stay private while you move liquidity in
              and out with full control.
            </p>
            <div className="hero-actions">
              <button
                className="btn primary"
                onClick={decryptPosition}
                disabled={!isConnected || zamaLoading || isDecrypting || !hasAddresses}
              >
                {isDecrypting ? 'Decrypting...' : 'Decrypt balances'}
              </button>
              <button className="btn ghost" onClick={refreshHandles} disabled={!isConnected || isReading || !hasAddresses}>
                {isReading ? 'Refreshing...' : 'Refresh handles'}
              </button>
            </div>
            {notice && <p className="helper-text success-text">{notice}</p>}
            {error && <p className="helper-text error-text">{error}</p>}
            {zamaError && <p className="helper-text error-text">{zamaError}</p>}
          </div>
          <div className="hero-card">
            <div className="stat-line">
              <span>Wallet balance</span>
              <strong>{formatAmount(position.wallet)} cUSDT</strong>
            </div>
            <div className="stat-line">
              <span>Staked</span>
              <strong>{formatAmount(position.staked)} cUSDT</strong>
            </div>
            <div className="stat-line">
              <span>Borrowed</span>
              <strong>{formatAmount(position.borrowed)} cUSDT</strong>
            </div>
            <div className="stat-line">
              <span>Available to withdraw</span>
              <strong>{formatAmount(availableToWithdraw)} cUSDT</strong>
            </div>
            <div className="stat-divider" />
            <div className="stat-line">
              <span>Operator approval</span>
              <strong>{isOperator === null ? 'Unknown' : isOperator ? 'Active' : 'Required'}</strong>
            </div>
          </div>
        </section>

        <section className="action-grid">
          <div className="action-card">
            <div className="action-header">
              <h3>Authorize Vault</h3>
              <p>Allow the vault contract to move encrypted cUSDT on your behalf.</p>
            </div>
              <button
                className="btn secondary"
                onClick={handleOperator}
                disabled={!isConnected || !!activeAction || !hasAddresses}
              >
                {activeAction === 'Authorization' ? 'Authorizing...' : 'Approve operator'}
              </button>
          </div>

          <div className="action-card">
            <div className="action-header">
              <h3>Mint cUSDT</h3>
              <p>Get testing liquidity to start staking and borrowing.</p>
            </div>
            <div className="action-row">
              <input
                type="text"
                inputMode="decimal"
                placeholder="Amount"
                value={mintAmount}
                onChange={(event) => setMintAmount(event.target.value)}
              />
              <button className="btn secondary" onClick={handleMint} disabled={!isConnected || !!activeAction || !hasAddresses}>
                {activeAction === 'Mint' ? 'Minting...' : 'Mint'}
              </button>
            </div>
            <p className="input-hint">Uses 6 decimal places, same as cUSDT.</p>
          </div>

          <div className="action-card">
            <div className="action-header">
              <h3>Stake</h3>
              <p>Encrypt and lock cUSDT to open a borrowing line.</p>
            </div>
            <div className="action-row">
              <input
                type="text"
                inputMode="decimal"
                placeholder="Amount"
                value={stakeAmount}
                onChange={(event) => setStakeAmount(event.target.value)}
              />
              <button
                className="btn primary"
                onClick={() => handleEncryptedAction('Stake', 'stake', stakeAmount, () => setStakeAmount(''))}
                disabled={!isConnected || !!activeAction || !isOperator || !instance || zamaLoading || !hasAddresses}
              >
                {activeAction === 'Stake' ? 'Staking...' : 'Stake'}
              </button>
            </div>
          </div>

          <div className="action-card">
            <div className="action-header">
              <h3>Borrow</h3>
              <p>Borrow up to your encrypted stake amount.</p>
            </div>
            <div className="action-row">
              <input
                type="text"
                inputMode="decimal"
                placeholder="Amount"
                value={borrowAmount}
                onChange={(event) => setBorrowAmount(event.target.value)}
              />
              <button
                className="btn primary"
                onClick={() => handleEncryptedAction('Borrow', 'borrow', borrowAmount, () => setBorrowAmount(''))}
                disabled={!isConnected || !!activeAction || !instance || zamaLoading || !hasAddresses}
              >
                {activeAction === 'Borrow' ? 'Borrowing...' : 'Borrow'}
              </button>
            </div>
          </div>

          <div className="action-card">
            <div className="action-header">
              <h3>Repay</h3>
              <p>Send cUSDT back to reduce your borrowed balance.</p>
            </div>
            <div className="action-row">
              <input
                type="text"
                inputMode="decimal"
                placeholder="Amount"
                value={repayAmount}
                onChange={(event) => setRepayAmount(event.target.value)}
              />
              <button
                className="btn secondary"
                onClick={() => handleEncryptedAction('Repay', 'repay', repayAmount, () => setRepayAmount(''))}
                disabled={!isConnected || !!activeAction || !isOperator || !instance || zamaLoading || !hasAddresses}
              >
                {activeAction === 'Repay' ? 'Repaying...' : 'Repay'}
              </button>
            </div>
          </div>

          <div className="action-card">
            <div className="action-header">
              <h3>Withdraw</h3>
              <p>Withdraw what is available after accounting for debt.</p>
            </div>
            <div className="action-row">
              <input
                type="text"
                inputMode="decimal"
                placeholder="Amount"
                value={withdrawAmount}
                onChange={(event) => setWithdrawAmount(event.target.value)}
              />
              <button
                className="btn secondary"
                onClick={() =>
                  handleEncryptedAction('Withdraw', 'withdraw', withdrawAmount, () => setWithdrawAmount(''))
                }
                disabled={!isConnected || !!activeAction || !instance || zamaLoading || !hasAddresses}
              >
                {activeAction === 'Withdraw' ? 'Withdrawing...' : 'Withdraw'}
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
