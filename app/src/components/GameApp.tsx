import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { Contract, parseEther } from 'ethers';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config/contracts';
import '../styles/GameApp.css';

const ZERO_HASH = `0x${'0'.repeat(64)}`;

const formatToken = (value: string | null, fallback = '-') => {
  if (!value) return fallback;
  try {
    return BigInt(value).toLocaleString('en-US');
  } catch {
    return value;
  }
};

export function GameApp() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [ethAmount, setEthAmount] = useState('0.01');
  const [guess, setGuess] = useState<'big' | 'small'>('big');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [balance, setBalance] = useState<string | null>(null);
  const [lastRoll, setLastRoll] = useState<number | null>(null);
  const [lastOutcome, setLastOutcome] = useState<boolean | null>(null);
  const [lastReward, setLastReward] = useState<string | null>(null);
  const [gameActive, setGameActive] = useState<boolean>(false);

  const [pointsPerEth, setPointsPerEth] = useState<string>('');
  const [playCost, setPlayCost] = useState<string>('');
  const [winReward, setWinReward] = useState<string>('');

  const [isBusy, setIsBusy] = useState({
    refresh: false,
    buy: false,
    start: false,
    guess: false,
  });

  const isConfigured = CONTRACT_ADDRESS !== ZERO_HASH;
  const canUseWallet = Boolean(isConfigured && isConnected && address && publicClient);
  const canDecrypt = Boolean(canUseWallet && instance && signerPromise && !zamaLoading);

  const decryptHandles = useCallback(
    async (handles: string[]) => {
      if (!instance || !address) {
        return {} as Record<string, string>;
      }

      const keypair = instance.generateKeypair();
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '7';
      const contractAddresses = [CONTRACT_ADDRESS];

      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);
      const resolvedSigner = await signerPromise;
      if (!resolvedSigner) {
        throw new Error('Signer not available');
      }

      const signature = await resolvedSigner.signTypedData(
        eip712.domain,
        {
          UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
        },
        eip712.message,
      );

      const handleContractPairs = handles.map((handle) => ({
        handle,
        contractAddress: CONTRACT_ADDRESS,
      }));

      return instance.userDecrypt(
        handleContractPairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays,
      );
    },
    [address, instance, signerPromise],
  );

  const refreshPlayerData = useCallback(async () => {
    if (!canUseWallet || !publicClient || !address) {
      return;
    }

    setIsBusy((prev) => ({ ...prev, refresh: true }));

    try {
      const [encryptedBalance, encryptedRoll, encryptedOutcome, encryptedReward, active] = await Promise.all([
        publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'getBalance',
          args: [address],
        }) as Promise<string>,
        publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'getLastRoll',
          args: [address],
        }) as Promise<string>,
        publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'getLastOutcome',
          args: [address],
        }) as Promise<string>,
        publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'getLastReward',
          args: [address],
        }) as Promise<string>,
        publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'isGameActive',
          args: [address],
        }) as Promise<boolean>,
      ]);

      setGameActive(active);

      if (!canDecrypt) {
        setBalance(null);
        setLastRoll(null);
        setLastOutcome(null);
        setLastReward(null);
        return;
      }

      const handlesToDecrypt = [encryptedBalance, encryptedRoll, encryptedOutcome, encryptedReward].filter(
        (handle) => handle !== ZERO_HASH,
      );

      if (handlesToDecrypt.length === 0) {
        setBalance('0');
        setLastRoll(null);
        setLastOutcome(null);
        setLastReward('0');
        return;
      }

      const decryptedValues = await decryptHandles(handlesToDecrypt);

      if (encryptedBalance !== ZERO_HASH) {
        setBalance(decryptedValues[encryptedBalance] ?? '0');
      } else {
        setBalance('0');
      }
      if (encryptedRoll !== ZERO_HASH) {
        const rawRoll = decryptedValues[encryptedRoll];
        setLastRoll(rawRoll ? Number(rawRoll) : null);
      } else {
        setLastRoll(null);
      }
      if (encryptedOutcome !== ZERO_HASH) {
        const rawOutcome = decryptedValues[encryptedOutcome];
        if (rawOutcome !== undefined) {
          setLastOutcome(rawOutcome === '1');
        }
      } else {
        setLastOutcome(null);
      }
      if (encryptedReward !== ZERO_HASH) {
        setLastReward(decryptedValues[encryptedReward] ?? '0');
      } else {
        setLastReward('0');
      }
    } catch (error) {
      console.error('Failed to refresh player data:', error);
      setStatusMessage('Unable to refresh encrypted data.');
    } finally {
      setIsBusy((prev) => ({ ...prev, refresh: false }));
    }
  }, [address, canDecrypt, canUseWallet, decryptHandles, publicClient]);

  const refreshConstants = useCallback(async () => {
    if (!publicClient || !isConfigured) return;

    try {
      const [points, cost, reward] = await Promise.all([
        publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'POINTS_PER_ETH',
        }) as Promise<bigint>,
        publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'PLAY_COST',
        }) as Promise<bigint>,
        publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'WIN_REWARD',
        }) as Promise<bigint>,
      ]);

      setPointsPerEth(points.toString());
      setPlayCost(cost.toString());
      setWinReward(reward.toString());
    } catch (error) {
      console.error('Failed to load constants:', error);
    }
  }, [publicClient]);

  useEffect(() => {
    void refreshConstants();
  }, [refreshConstants]);

  useEffect(() => {
    void refreshPlayerData();
  }, [refreshPlayerData]);

  const handleBuyPoints = async () => {
    if (!isConfigured) {
      setStatusMessage('Contract address not set.');
      return;
    }
    if (!address || !signerPromise) {
      setStatusMessage('Connect a wallet before buying points.');
      return;
    }

    setIsBusy((prev) => ({ ...prev, buy: true }));
    setStatusMessage(null);

    try {
      const resolvedSigner = await signerPromise;
      if (!resolvedSigner) {
        throw new Error('Signer not available');
      }

      const amount = Number(ethAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        setStatusMessage('Enter a valid ETH amount.');
        return;
      }

      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, resolvedSigner);
      const tx = await contract.buyPoints({ value: parseEther(ethAmount) });
      await tx.wait();
      setStatusMessage('Points credited.');
      await refreshPlayerData();
    } catch (error) {
      console.error('Buy points failed:', error);
      setStatusMessage('Transaction failed. Please retry.');
    } finally {
      setIsBusy((prev) => ({ ...prev, buy: false }));
    }
  };

  const handleStartGame = async () => {
    if (!isConfigured) {
      setStatusMessage('Contract address not set.');
      return;
    }
    if (!address || !signerPromise) {
      setStatusMessage('Connect a wallet before starting a round.');
      return;
    }

    setIsBusy((prev) => ({ ...prev, start: true }));
    setStatusMessage(null);

    try {
      const resolvedSigner = await signerPromise;
      if (!resolvedSigner) {
        throw new Error('Signer not available');
      }

      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, resolvedSigner);
      const tx = await contract.startGame();
      await tx.wait();
      setStatusMessage('Dice rolled. Submit your guess.');
      await refreshPlayerData();
    } catch (error) {
      console.error('Start game failed:', error);
      setStatusMessage('Unable to start the round.');
    } finally {
      setIsBusy((prev) => ({ ...prev, start: false }));
    }
  };

  const handleSubmitGuess = async () => {
    if (!isConfigured) {
      setStatusMessage('Contract address not set.');
      return;
    }
    if (!address || !instance || !signerPromise) {
      setStatusMessage('Connect a wallet before guessing.');
      return;
    }

    setIsBusy((prev) => ({ ...prev, guess: true }));
    setStatusMessage(null);

    try {
      const input = instance.createEncryptedInput(CONTRACT_ADDRESS, address);
      input.addBool(guess === 'big');
      const encryptedInput = await input.encrypt();

      const resolvedSigner = await signerPromise;
      if (!resolvedSigner) {
        throw new Error('Signer not available');
      }

      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, resolvedSigner);
      const tx = await contract.submitGuess(encryptedInput.handles[0], encryptedInput.inputProof);
      await tx.wait();

      setStatusMessage('Guess recorded.');
      await refreshPlayerData();
    } catch (error) {
      console.error('Submit guess failed:', error);
      setStatusMessage('Guess failed. Try again.');
    } finally {
      setIsBusy((prev) => ({ ...prev, guess: false }));
    }
  };

  const projectedPoints = useMemo(() => {
    if (!pointsPerEth || !ethAmount) return '';
    const parsed = Number(ethAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) return '';
    try {
      const points = (BigInt(pointsPerEth) * BigInt(Math.round(parsed * 1e6))) / BigInt(1e6);
      return points.toString();
    } catch {
      return '';
    }
  }, [ethAmount, pointsPerEth]);

  return (
    <div className="game-app">
      <section className="hero-panel reveal" style={{ animationDelay: '0.1s' }}>
        <div className="hero-copy">
          <p className="hero-eyebrow">Encrypted Dice Studio</p>
          <h2>Play bold. Keep your guess private.</h2>
          <p className="hero-description">
            Swap ETH for encrypted points, roll a confidential dice, and guess big or small. The chain decides the
            outcome, the relayer keeps your data sealed.
          </p>
          <div className="hero-meta">
            <div>
              <span className="meta-label">Exchange rate</span>
              <span className="meta-value">1 ETH -- {formatToken(pointsPerEth, '-')} pts</span>
            </div>
            <div>
              <span className="meta-label">Round cost</span>
              <span className="meta-value">{formatToken(playCost, '-')} pts</span>
            </div>
            <div>
              <span className="meta-label">Win reward</span>
              <span className="meta-value">{formatToken(winReward, '-')} pts</span>
            </div>
          </div>
        </div>
        <div className="hero-stats">
          <div className="stat-card">
            <span className="stat-label">Encrypted balance</span>
            <span className="stat-value">{formatToken(balance)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Last roll</span>
            <span className="stat-value">{lastRoll ?? '-'}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Last reward</span>
            <span className="stat-value">{formatToken(lastReward)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Last outcome</span>
            <span className="stat-value">
              {lastOutcome === null ? '-' : lastOutcome ? 'Win' : 'Miss'}
            </span>
          </div>
        </div>
      </section>

      <section className="actions-grid">
        <div className="action-card reveal" style={{ animationDelay: '0.2s' }}>
          <h3>Buy points</h3>
          <p>Fund your encrypted balance with ETH.</p>
          <div className="input-row">
            <input
              type="number"
              min="0"
              step="0.001"
              value={ethAmount}
              onChange={(event) => setEthAmount(event.target.value)}
              placeholder="0.01"
            />
            <button
              className="primary"
              onClick={handleBuyPoints}
              disabled={!canUseWallet || isBusy.buy}
            >
              {isBusy.buy ? 'Buying...' : 'Buy points'}
            </button>
          </div>
          <div className="helper">Projected: {projectedPoints ? formatToken(projectedPoints) : '-'} pts</div>
        </div>

        <div className="action-card reveal" style={{ animationDelay: '0.3s' }}>
          <h3>Start a round</h3>
          <p>Spend points to generate a private dice roll.</p>
          <button
            className="secondary"
            onClick={handleStartGame}
            disabled={!canUseWallet || isBusy.start || gameActive}
          >
            {gameActive ? 'Round active' : isBusy.start ? 'Rolling...' : 'Start game'}
          </button>
          <div className="status-pill">{gameActive ? 'Waiting for guess' : 'Ready for a new round'}</div>
        </div>

        <div className="action-card reveal" style={{ animationDelay: '0.4s' }}>
          <h3>Submit your guess</h3>
          <p>Pick big (4-6) or small (1-3), encrypted on-chain.</p>
          <div className="toggle-row">
            <button
              className={guess === 'big' ? 'toggle active' : 'toggle'}
              onClick={() => setGuess('big')}
            >
              Big
            </button>
            <button
              className={guess === 'small' ? 'toggle active' : 'toggle'}
              onClick={() => setGuess('small')}
            >
              Small
            </button>
          </div>
          <button
            className="primary"
            onClick={handleSubmitGuess}
            disabled={!canUseWallet || !gameActive || isBusy.guess}
          >
            {isBusy.guess ? 'Submitting...' : 'Send encrypted guess'}
          </button>
        </div>
      </section>

      <section className="utility-row reveal" style={{ animationDelay: '0.5s' }}>
        <div className="utility-card">
          <div>
            <h4>Encryption status</h4>
            <p>
              {zamaLoading ? 'Initializing relayer...' : zamaError ? zamaError : 'Ready for confidential play.'}
            </p>
          </div>
          <button className="ghost" onClick={refreshPlayerData} disabled={isBusy.refresh || !canUseWallet}>
            {isBusy.refresh ? 'Refreshing...' : 'Refresh data'}
          </button>
        </div>
        {(statusMessage || !isConfigured) && (
          <div className="status-message">
            {statusMessage || 'Contract address not set.'}
          </div>
        )}
      </section>
    </div>
  );
}
