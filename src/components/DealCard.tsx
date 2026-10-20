import { useReadContract } from 'wagmi';
import { Loader2, Clock, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { RELEASE_SPLIT_ABI, CONTRACT_ADDRESS, ARC_TESTNET_CHAIN_ID, DEAL_STATE_LABELS } from '../lib/releaseplit-contract';
import { formatAddress, formatUSDC, formatDeadline, deadlineStatus } from '../lib/utils';

const glass = {
  card: {
    background: 'rgba(255,255,255,0.64)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    border: '1px solid rgba(255,255,255,0.68)',
    boxShadow: '0 8px 32px rgba(18,45,69,0.08), inset 0 1px 0 rgba(255,255,255,0.55)',
  } as React.CSSProperties,
};

function StateChip({ state }: { state: number }) {
  const label = DEAL_STATE_LABELS[state as 0 | 1 | 2 | 3] ?? 'Unknown';
  const style: React.CSSProperties = (() => {
    if (state === 0) return { background: 'rgba(18,45,69,0.08)', color: 'var(--ink-2)' };
    if (state === 1) return { background: 'rgba(133,177,237,0.18)', color: '#1061a6' };
    if (state === 2) return { background: 'rgba(26,128,71,0.12)', color: 'var(--success)' };
    return { background: 'rgba(186,43,76,0.10)', color: 'var(--danger)' };
  })();
  const Icon = state === 2 ? CheckCircle : state === 3 ? XCircle : state === 1 ? RefreshCw : Clock;

  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold" style={style}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
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

export function DealCard({
  dealId,
  onClick,
}: {
  dealId: bigint;
  onClick: (id: bigint) => void;
}) {
  const { data, isLoading } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: RELEASE_SPLIT_ABI,
    functionName: 'getDeal',
    args: [dealId],
    chainId: ARC_TESTNET_CHAIN_ID,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-2xl p-4" style={glass.card}>
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--subtle)' }} />
      </div>
    );
  }

  if (!data) return null;

  const [payer, approver, _recipientWallets, recipientBps, recipientCount, amount, deadline, state] = data as unknown as GetDealReturn;

  const dlStatus = deadlineStatus(deadline);

  return (
    <button
      onClick={() => onClick(dealId)}
      className="w-full rounded-2xl p-4 text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
      style={glass.card}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="display text-sm font-bold" style={{ color: 'var(--ink)' }}>
              Deal #{dealId.toString()}
            </span>
            <StateChip state={state} />
          </div>
          <div className="text-2xl font-bold tabular-nums display" style={{ color: 'var(--ink)' }}>
            {formatUSDC(amount)} <span className="text-base font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
          </div>
        </div>

        <div className="text-right">
          <div className="text-xs" style={{ color: 'var(--subtle)' }}>Deadline</div>
          <div
            className="text-xs font-semibold"
            style={{ color: dlStatus === 'active' ? 'var(--ink-2)' : 'var(--danger)' }}
          >
            {dlStatus === 'active' ? formatDeadline(deadline) : 'Expired'}
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--subtle)' }}>Payer</span>
          <span className="mono text-xs" style={{ color: 'var(--ink-2)' }}>{formatAddress(payer)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--subtle)' }}>Approver</span>
          <span className="mono text-xs" style={{ color: 'var(--ink-2)' }}>{formatAddress(approver)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--subtle)' }}>Split</span>
          <span className="text-xs tabular-nums" style={{ color: 'var(--ink-2)' }}>
            {Array.from({ length: recipientCount }, (_, i) =>
              `${((recipientBps as readonly number[])[i] / 100).toFixed(0)}%`
            ).join(' / ')}
          </span>
        </div>
      </div>
    </button>
  );
}
