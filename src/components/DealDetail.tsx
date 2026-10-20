import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount, useSwitchChain } from 'wagmi';
import { ArrowLeft, Loader2, ExternalLink, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  RELEASE_SPLIT_ABI,
  CONTRACT_ADDRESS,
  ARC_TESTNET_CHAIN_ID,
  DEAL_STATE_LABELS,
} from '../lib/releaseplit-contract';
import { formatAddress, formatUSDC, formatDeadline, deadlineStatus, parseOnchainError } from '../lib/utils';

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

const spectral = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)';
const EXPLORER = 'https://explorer.testnet.arc.io';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2" style={{ borderBottom: '1px solid rgba(18,45,69,0.07)' }}>
      <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--subtle)' }}>{label}</span>
      <span className="text-right text-sm" style={{ color: 'var(--ink-2)' }}>{value}</span>
    </div>
  );
}

type GetDealReturn = readonly [
  `0x${string}`, // payer
  `0x${string}`, // approver
  readonly [`0x${string}`, `0x${string}`, `0x${string}`], // recipientWallets
  readonly [number, number, number], // recipientBps
  number, // recipientCount
  bigint, // amount
  bigint, // deadline
  number, // state
];

export function DealDetail({
  dealId,
  onBack,
}: {
  dealId: bigint;
  onBack: () => void;
}) {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const wrongChain = isConnected && chainId !== ARC_TESTNET_CHAIN_ID;

  const { data, isLoading, refetch } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: RELEASE_SPLIT_ABI,
    functionName: 'getDeal',
    args: [dealId],
    chainId: ARC_TESTNET_CHAIN_ID,
  });

  const {
    writeContract: doRelease,
    data: releaseHash,
    isPending: releasePending,
  } = useWriteContract();
  const { isLoading: releaseConfirming, isSuccess: releaseSuccess } = useWaitForTransactionReceipt({ hash: releaseHash });

  const {
    writeContract: doRefund,
    data: refundHash,
    isPending: refundPending,
  } = useWriteContract();
  const { isLoading: refundConfirming, isSuccess: refundSuccess } = useWaitForTransactionReceipt({ hash: refundHash });

  if (releaseSuccess || refundSuccess) {
    void refetch();
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--subtle)' }} />
        <span className="text-sm" style={{ color: 'var(--subtle)' }}>Loading deal...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-3xl p-6 text-center" style={glass.card}>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Deal not found.</p>
        <button onClick={onBack} className="mt-3 text-sm font-semibold" style={{ color: 'var(--accent-hover)' }}>
          Go back
        </button>
      </div>
    );
  }

  const [payer, approver, recipientWallets, recipientBps, recipientCount, amount, deadline, state] = data as unknown as GetDealReturn;
  const dlStatus = deadlineStatus(deadline);
  const stateLabel = DEAL_STATE_LABELS[state as 0 | 1 | 2 | 3] ?? 'Unknown';

  const isApprover = !!address && address.toLowerCase() === (approver as string).toLowerCase();
  const isPayer = !!address && address.toLowerCase() === (payer as string).toLowerCase();
  const canRelease = state === 1 && isApprover && dlStatus === 'active';
  const canRefund = state === 1 && isPayer && dlStatus === 'expired';

  function handleRelease() {
    if (wrongChain) { switchChain({ chainId: ARC_TESTNET_CHAIN_ID }); return; }
    doRelease({
      address: CONTRACT_ADDRESS,
      abi: RELEASE_SPLIT_ABI,
      functionName: 'releaseDeal',
      args: [dealId],
      chainId: ARC_TESTNET_CHAIN_ID,
    }, {
      onSuccess: () => toast.success('Release confirmed! Funds distributed.'),
      onError: (err) => toast.error(parseOnchainError(err)),
    });
  }

  function handleRefund() {
    if (wrongChain) { switchChain({ chainId: ARC_TESTNET_CHAIN_ID }); return; }
    doRefund({
      address: CONTRACT_ADDRESS,
      abi: RELEASE_SPLIT_ABI,
      functionName: 'refundDeal',
      args: [dealId],
      chainId: ARC_TESTNET_CHAIN_ID,
    }, {
      onSuccess: () => toast.success('Refund confirmed! USDC returned to payer.'),
      onError: (err) => toast.error(parseOnchainError(err)),
    });
  }

  return (
    <div className="space-y-4">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm font-semibold"
        style={{ color: 'var(--accent-hover)' }}
      >
        <ArrowLeft className="h-4 w-4" /> All Deals
      </button>

      {/* Hero card */}
      <div className="rounded-3xl overflow-hidden" style={glass.card}>
        <div className="h-1" style={{ background: spectral }} />
        <div className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <span className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>
              Deal #{dealId.toString()}
            </span>
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={
                state === 2
                  ? { background: 'rgba(26,128,71,0.12)', color: 'var(--success)' }
                  : state === 3
                  ? { background: 'rgba(186,43,76,0.10)', color: 'var(--danger)' }
                  : state === 1
                  ? { background: 'rgba(133,177,237,0.18)', color: '#1061a6' }
                  : { background: 'rgba(18,45,69,0.08)', color: 'var(--ink-2)' }
              }
            >
              {stateLabel}
            </span>
          </div>

          {/* Big amount */}
          <div className="mb-4 flex items-baseline gap-1.5">
            <span className="display text-4xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
              {formatUSDC(amount)}
            </span>
            <span className="text-lg font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
          </div>

          {/* Details */}
          <div style={glass.inner}>
            <div className="rounded-xl px-4 py-1">
              <Row label="Payer" value={<span className="mono text-xs">{formatAddress(payer)}</span>} />
              <Row label="Approver" value={<span className="mono text-xs">{formatAddress(approver)}</span>} />
              <Row
                label="Deadline"
                value={
                  <span
                    className="font-medium"
                    style={{ color: dlStatus === 'active' ? 'var(--ink-2)' : 'var(--danger)' }}
                  >
                    {formatDeadline(deadline)}
                    {dlStatus === 'expired' && ' (expired)'}
                  </span>
                }
              />
            </div>
          </div>
        </div>
      </div>

      {/* Payout breakdown */}
      <div className="rounded-3xl p-5" style={glass.card}>
        <h3 className="mb-3 text-sm font-semibold" style={{ color: 'var(--ink)' }}>Payout Breakdown</h3>
        <div className="space-y-2">
          {Array.from({ length: recipientCount }, (_, i) => {
            const bpsArr = recipientBps as readonly number[];
            const walletsArr = recipientWallets as readonly string[];
            const share = (amount * BigInt(bpsArr[i])) / 10_000n;
            const pct = (bpsArr[i] / 100).toFixed(1);
            return (
              <div key={i} className="flex items-center justify-between rounded-xl px-3 py-2" style={glass.inner}>
                <div>
                  <div className="mono text-xs" style={{ color: 'var(--ink-2)' }}>{formatAddress(walletsArr[i])}</div>
                  <div className="text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>{pct}%</div>
                </div>
                <div className="text-right">
                  <div className="tabular-nums font-semibold text-sm" style={{ color: 'var(--ink)' }}>
                    {formatUSDC(share)} USDC
                  </div>
                  {i === 0 && (recipientCount) > 1 && (
                    <div className="text-xs" style={{ color: 'var(--subtle)' }}>+ dust</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Your role */}
      {isConnected && (isApprover || isPayer) && (
        <div className="rounded-2xl px-4 py-3" style={glass.card}>
          <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
            {isApprover && <span>You are the <strong style={{ color: 'var(--ink)' }}>approver</strong></span>}
            {isPayer && <span>You are the <strong style={{ color: 'var(--ink)' }}>payer</strong></span>}
          </div>
        </div>
      )}

      {/* Actions */}
      {canRelease && (
        <div className="space-y-2">
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            As the approver, you can release funds to all recipients now.
          </p>
          <button
            disabled={releasePending || releaseConfirming}
            onClick={handleRelease}
            className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: 'var(--success)' }}
          >
            {releasePending
              ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Confirm in wallet...</span>
              : releaseConfirming
              ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Releasing...</span>
              : <span className="flex items-center justify-center gap-2"><CheckCircle className="h-4 w-4" /> Release Funds to Recipients</span>}
          </button>
          {releaseHash && (
            <a
              href={`${EXPLORER}/tx/${releaseHash}`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs"
              style={{ color: 'var(--accent-hover)' }}
            >
              View release tx <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}

      {canRefund && (
        <div className="space-y-2">
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            The deadline has passed without approval. You can reclaim your USDC.
          </p>
          <button
            disabled={refundPending || refundConfirming}
            onClick={handleRefund}
            className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: 'var(--danger)' }}
          >
            {refundPending
              ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Confirm in wallet...</span>
              : refundConfirming
              ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Refunding...</span>
              : <span className="flex items-center justify-center gap-2"><XCircle className="h-4 w-4" /> Refund to My Wallet</span>}
          </button>
        </div>
      )}

      {/* Funded but not you */}
      {state === 1 && !canRelease && !canRefund && isConnected && (
        <div className="rounded-2xl p-4 text-sm" style={glass.card}>
          {!isApprover && !isPayer ? (
            <p style={{ color: 'var(--muted)' }}>You are a recipient or observer. The approver can release funds before {formatDeadline(deadline)}.</p>
          ) : isApprover && dlStatus === 'expired' ? (
            <p style={{ color: 'var(--muted)' }}>The deadline has passed. Only the payer can refund now.</p>
          ) : isPayer && dlStatus === 'active' ? (
            <p style={{ color: 'var(--muted)' }}>Waiting for the approver to release funds before {formatDeadline(deadline)}.</p>
          ) : null}
        </div>
      )}

      {/* Contract link */}
      <a
        href={`${EXPLORER}/address/${CONTRACT_ADDRESS}`}
        target="_blank" rel="noopener noreferrer"
        className="flex items-center justify-center gap-1 text-xs"
        style={{ color: 'var(--subtle)' }}
      >
        View contract on Arc Explorer <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
