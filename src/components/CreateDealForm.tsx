import { useState, useMemo } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract } from 'wagmi';
import { erc20Abi } from 'viem';
import { Loader2, Plus, Trash2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import {
  RELEASE_SPLIT_ABI,
  CONTRACT_ADDRESS,
  USDC_ADDRESS,
  ARC_TESTNET_CHAIN_ID,
} from '../lib/releaseplit-contract';
import { formatUSDC, parseUSDC, parseOnchainError } from '../lib/utils';

const glass = {
  card: {
    background: 'rgba(255,255,255,0.64)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    border: '1px solid rgba(255,255,255,0.68)',
    boxShadow: '0 8px 32px rgba(18,45,69,0.08), inset 0 1px 0 rgba(255,255,255,0.55)',
  } as React.CSSProperties,
  inner: {
    background: 'rgba(255,255,255,0.46)',
    border: '1px solid rgba(255,255,255,0.56)',
  } as React.CSSProperties,
};

interface RecipientRow {
  wallet: string;
  pct: string; // percentage string e.g. "50"
}

function defaultRecipients(): RecipientRow[] {
  return [
    { wallet: '', pct: '50' },
    { wallet: '', pct: '50' },
  ];
}

function pctToBps(pct: string): number {
  return Math.round(parseFloat(pct || '0') * 100);
}

function totalPct(rows: RecipientRow[]): number {
  return rows.reduce((sum, r) => sum + parseFloat(r.pct || '0'), 0);
}

export function CreateDealForm({ onCreated }: { onCreated?: () => void }) {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const wrongChain = isConnected && chainId !== ARC_TESTNET_CHAIN_ID;

  const [approver, setApprover] = useState('');
  const [amount, setAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [recipients, setRecipients] = useState<RecipientRow[]>(defaultRecipients);
  const [step, setStep] = useState<'create' | 'approve' | 'fund' | 'done'>('create');
  const minDeadline = useMemo(() => new Date(Date.now() + 60_000).toISOString().slice(0, 16), []);
  const [newDealId, setNewDealId] = useState<bigint | null>(null);

  // Read USDC balance
  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!address },
  });

  // Step 1 — createDeal
  const {
    writeContract: doCreate,
    data: createHash,
    isPending: createPending,
    reset: resetCreate,
  } = useWriteContract();
  const { isLoading: createConfirming, isSuccess: createSuccess, data: createReceipt } = useWaitForTransactionReceipt({ hash: createHash });

  // Step 2 — USDC approve
  const {
    writeContract: doApprove,
    data: approveHash,
    isPending: approvePending,
    reset: resetApprove,
  } = useWriteContract();
  const { isLoading: approveConfirming } = useWaitForTransactionReceipt({ hash: approveHash });

  // Step 3 — fundDeal
  const {
    writeContract: doFund,
    data: fundHash,
    isPending: fundPending,
    reset: resetFund,
  } = useWriteContract();
  const { isLoading: fundConfirming, isSuccess: fundSuccess } = useWaitForTransactionReceipt({ hash: fundHash });

  // Extract dealId from createDeal receipt
  const resolvedDealId: bigint | null = (() => {
    if (newDealId !== null) return newDealId;
    if (!createReceipt || !createSuccess) return null;
    // DealCreated is the first indexed event — get from logs
    // Topic[1] is indexed dealId
    for (const log of createReceipt.logs) {
      if (log.address.toLowerCase() === CONTRACT_ADDRESS.toLowerCase()) {
        // DealCreated(uint256 indexed dealId, ...) — first param indexed
        if (log.topics.length >= 2) {
          const id = BigInt(log.topics[1] as string);
          setNewDealId(id);
          return id;
        }
      }
    }
    return null;
  })();

  const parsedAmount = parseUSDC(amount);
  const totalPctVal = totalPct(recipients);

  const validationError = useMemo(() => {
    if (!isConnected) return null;
    if (!approver || approver.length !== 42 || !approver.startsWith('0x')) return 'Enter a valid approver address.';
    if (approver.toLowerCase() === address?.toLowerCase()) return 'Approver must differ from your wallet.';
    if (parsedAmount <= 0n) return 'Enter an amount greater than 0.';
    if (!deadline) return 'Choose a refund deadline.';
    const dl = Math.floor(new Date(deadline).getTime() / 1000);
    // eslint-disable-next-line no-restricted-globals -- intentional deadline check
    const nowSec = Math.floor(Date.now() / 1000);
    if (dl <= nowSec) return 'Deadline must be in the future.';
    if (recipients.length < 2 || recipients.length > 3) return 'Add 2 or 3 recipients.';
    for (const r of recipients) {
      if (!r.wallet || r.wallet.length !== 42 || !r.wallet.startsWith('0x')) return 'Each recipient needs a valid address.';
      if (r.wallet.toLowerCase() === address?.toLowerCase()) return 'A recipient cannot be the payer.';
      if (r.wallet.toLowerCase() === approver.toLowerCase()) return 'A recipient cannot be the approver.';
      if (parseFloat(r.pct || '0') <= 0) return 'Each recipient must have a positive percentage.';
    }
    const wallets = recipients.map(r => r.wallet.toLowerCase());
    if (new Set(wallets).size !== wallets.length) return 'Recipients must have distinct addresses.';
    if (Math.abs(totalPctVal - 100) > 0.001) return `Percentages must sum to 100% (currently ${totalPctVal.toFixed(2)}%).`;
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, approver, address, parsedAmount, deadline, recipients, totalPctVal]);

  function handleCreate() {
    if (wrongChain) { switchChain({ chainId: ARC_TESTNET_CHAIN_ID }); return; }
    if (validationError) { toast.error(validationError); return; }

    const deadlineTs = BigInt(Math.floor(new Date(deadline).getTime() / 1000));
    const wallets = recipients.map(r => r.wallet as `0x${string}`);
    const bpsArr = recipients.map(r => pctToBps(r.pct));

    doCreate({
      address: CONTRACT_ADDRESS,
      abi: RELEASE_SPLIT_ABI,
      functionName: 'createDeal',
      args: [approver as `0x${string}`, wallets, bpsArr, parsedAmount, deadlineTs],
      chainId: ARC_TESTNET_CHAIN_ID,
    }, {
      onSuccess: () => { setStep('approve'); },
      onError: (err) => toast.error(parseOnchainError(err)),
    });
  }

  function handleApprove() {
    if (wrongChain) { switchChain({ chainId: ARC_TESTNET_CHAIN_ID }); return; }
    doApprove({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [CONTRACT_ADDRESS, parsedAmount],
      chainId: ARC_TESTNET_CHAIN_ID,
    }, {
      onSuccess: () => { setStep('fund'); },
      onError: (err) => toast.error(parseOnchainError(err)),
    });
  }

  function handleFund() {
    if (wrongChain) { switchChain({ chainId: ARC_TESTNET_CHAIN_ID }); return; }
    if (resolvedDealId === null) { toast.error('Could not find deal ID. Please retry.'); return; }
    doFund({
      address: CONTRACT_ADDRESS,
      abi: RELEASE_SPLIT_ABI,
      functionName: 'fundDeal',
      args: [resolvedDealId],
      chainId: ARC_TESTNET_CHAIN_ID,
    }, {
      onSuccess: () => { setStep('done'); onCreated?.(); },
      onError: (err) => toast.error(parseOnchainError(err)),
    });
  }

  function handleReset() {
    setStep('create');
    setApprover('');
    setAmount('');
    setDeadline('');
    setRecipients(defaultRecipients());
    setNewDealId(null);
    resetCreate();
    resetApprove();
    resetFund();
  }

  const explorerBase = 'https://explorer.testnet.arc.io';

  // ——— Step: done ———
  if (step === 'done' && fundSuccess) {
    return (
      <div className="rounded-3xl p-6 space-y-4" style={glass.card}>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: 'rgba(26,128,71,0.12)' }}>
            <span className="text-lg">✓</span>
          </div>
          <h2 className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>Deal Funded!</h2>
        </div>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Deal #{resolvedDealId?.toString()} is now active. The approver can release funds to all recipients before the deadline.
        </p>
        {fundHash && (
          <a
            href={`${explorerBase}/tx/${fundHash}`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium"
            style={{ color: 'var(--accent-hover)' }}
          >
            View on Arc Explorer <ExternalLink className="h-3 w-3" />
          </a>
        )}
        <button
          onClick={handleReset}
          className="w-full rounded-2xl py-3 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99]"
          style={{ background: 'var(--accent)' }}
        >
          Create Another Deal
        </button>
      </div>
    );
  }

  // ——— Step: fund ———
  if (step === 'fund') {
    return (
      <div className="rounded-3xl p-6 space-y-4" style={glass.card}>
        <div>
          <h2 className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>Step 3 of 3: Deposit USDC</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            Send {formatUSDC(parsedAmount)} USDC to the escrow contract. Deal #{resolvedDealId?.toString()}.
          </p>
        </div>
        <button
          disabled={fundPending || fundConfirming}
          onClick={handleFund}
          className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: 'var(--accent)' }}
        >
          {fundPending
            ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Confirm in wallet...</span>
            : fundConfirming
            ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Depositing...</span>
            : `Deposit ${formatUSDC(parsedAmount)} USDC`}
        </button>
        {fundHash && (
          <a
            href={`${explorerBase}/tx/${fundHash}`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs"
            style={{ color: 'var(--accent-hover)' }}
          >
            View deposit tx <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    );
  }

  // ——— Step: approve ———
  if (step === 'approve') {
    return (
      <div className="rounded-3xl p-6 space-y-4" style={glass.card}>
        <div>
          <h2 className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>Step 2 of 3: Allow USDC</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            Approve the escrow contract to spend {formatUSDC(parsedAmount)} USDC from your wallet.
          </p>
        </div>
        {createHash && (
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>
            Deal created.{' '}
            <a href={`${explorerBase}/tx/${createHash}`} target="_blank" rel="noopener noreferrer" className="underline">View tx</a>
          </p>
        )}
        <button
          disabled={approvePending || approveConfirming}
          onClick={handleApprove}
          className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: 'var(--accent)' }}
        >
          {approvePending
            ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Confirm in wallet...</span>
            : approveConfirming
            ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Approving...</span>
            : `Approve ${formatUSDC(parsedAmount)} USDC`}
        </button>
        {approveHash && (
          <a
            href={`${explorerBase}/tx/${approveHash}`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs"
            style={{ color: 'var(--accent-hover)' }}
          >
            View approve tx <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    );
  }

  // ——— Step: create (main form) ———
  return (
    <div className="rounded-3xl p-6 space-y-5" style={glass.card}>
      <div>
        <h2 className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>New Deal</h2>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
          Escrow USDC and split it when approved.
        </p>
      </div>

      {/* USDC balance */}
      {isConnected && usdcBalance !== undefined && (
        <div className="rounded-xl px-3 py-2 text-xs" style={glass.inner}>
          <span style={{ color: 'var(--subtle)' }}>Your USDC balance: </span>
          <span className="tabular-nums font-semibold" style={{ color: 'var(--ink)' }}>
            {formatUSDC(usdcBalance)} USDC
          </span>
        </div>
      )}

      {/* Amount */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
          Escrow Amount (USDC)
        </label>
        <div className="rounded-2xl p-3" style={glass.inner}>
          <input
            inputMode="decimal"
            value={amount}
            onChange={e => {
              const v = e.target.value.replace(/[^0-9.]/g, '');
              if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v);
            }}
            placeholder="100.00"
            className="display w-full bg-transparent text-3xl font-bold tabular-nums outline-none placeholder:opacity-30"
            style={{ color: 'var(--ink)' }}
          />
          <div className="mt-1 flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--subtle)' }}>USDC</span>
            {usdcBalance !== undefined && (
              <button
                onClick={() => setAmount(formatUSDC(usdcBalance).replace(/,/g, ''))}
                className="text-xs font-semibold"
                style={{ color: 'var(--accent-hover)' }}
              >
                Max
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Approver */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
          Approver Address
        </label>
        <input
          value={approver}
          onChange={e => setApprover(e.target.value.trim())}
          placeholder="0x..."
          className="mono w-full rounded-xl px-3 py-2.5 text-sm outline-none"
          style={{ ...glass.inner, color: 'var(--ink)' }}
        />
        <p className="text-xs" style={{ color: 'var(--subtle)' }}>
          Only this address can release funds before the deadline.
        </p>
      </div>

      {/* Deadline */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
          Refund Deadline
        </label>
        <input
          type="datetime-local"
          value={deadline}
          onChange={e => setDeadline(e.target.value)}
          min={minDeadline}
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
          style={{ ...glass.inner, color: 'var(--ink)' }}
        />
        <p className="text-xs" style={{ color: 'var(--subtle)' }}>
          After this date, only you (the payer) can reclaim the funds.
        </p>
      </div>

      {/* Recipients */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
            Recipients
          </label>
          <span
            className="text-xs font-semibold tabular-nums"
            style={{ color: Math.abs(totalPctVal - 100) < 0.001 ? 'var(--success)' : 'var(--danger)' }}
          >
            {totalPctVal.toFixed(1)}% / 100%
          </span>
        </div>

        {recipients.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-xl px-3 py-2" style={glass.inner}>
              <input
                value={r.wallet}
                onChange={e => {
                  const next = [...recipients];
                  next[i] = { ...next[i], wallet: e.target.value.trim() };
                  setRecipients(next);
                }}
                placeholder="0x... wallet"
                className="mono min-w-0 flex-1 bg-transparent text-xs outline-none"
                style={{ color: 'var(--ink)' }}
              />
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0.01}
                  max={99.99}
                  step={0.01}
                  value={r.pct}
                  onChange={e => {
                    const next = [...recipients];
                    next[i] = { ...next[i], pct: e.target.value };
                    setRecipients(next);
                  }}
                  className="w-14 bg-transparent text-right text-sm tabular-nums font-semibold outline-none"
                  style={{ color: 'var(--ink)' }}
                />
                <span className="text-xs" style={{ color: 'var(--subtle)' }}>%</span>
              </div>
            </div>
            {recipients.length > 2 && (
              <button
                onClick={() => setRecipients(recipients.filter((_, j) => j !== i))}
                className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
                style={{ color: 'var(--danger)' }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}

        {recipients.length < 3 && (
          <button
            onClick={() => setRecipients([...recipients, { wallet: '', pct: '0' }])}
            className="flex items-center gap-1 text-xs font-semibold"
            style={{ color: 'var(--accent-hover)' }}
          >
            <Plus className="h-3 w-3" /> Add recipient (max 3)
          </button>
        )}
      </div>

      {/* CTA */}
      <button
        disabled={!isConnected || createPending || createConfirming}
        onClick={wrongChain ? () => switchChain({ chainId: ARC_TESTNET_CHAIN_ID }) : handleCreate}
        className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        style={{ background: 'var(--accent)' }}
      >
        {!isConnected
          ? 'Connect Wallet to Continue'
          : wrongChain
          ? 'Switch to Arc Testnet'
          : createPending
          ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Confirm in wallet...</span>
          : createConfirming
          ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Creating deal...</span>
          : 'Step 1: Create Deal'}
      </button>
      {!isConnected && (
        <p className="text-center text-xs" style={{ color: 'var(--subtle)' }}>Connect your wallet to create a deal.</p>
      )}
    </div>
  );
}
