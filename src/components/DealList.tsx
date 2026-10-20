import { useEffect } from 'react';
import { useReadContract } from 'wagmi';
import { Loader2, Plus } from 'lucide-react';
import { RELEASE_SPLIT_ABI, CONTRACT_ADDRESS, ARC_TESTNET_CHAIN_ID } from '../lib/releaseplit-contract';
import { DealCard } from './DealCard';

const glass = {
  card: {
    background: 'rgba(255,255,255,0.64)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    border: '1px solid rgba(255,255,255,0.68)',
    boxShadow: '0 8px 32px rgba(18,45,69,0.08), inset 0 1px 0 rgba(255,255,255,0.55)',
  } as React.CSSProperties,
};

export function DealList({
  onSelectDeal,
  onNewDeal,
  refreshTrigger,
}: {
  onSelectDeal: (id: bigint) => void;
  onNewDeal: () => void;
  refreshTrigger?: number;
}) {
  const { data: dealCount, isLoading, refetch } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: RELEASE_SPLIT_ABI,
    functionName: 'dealCount',
    chainId: ARC_TESTNET_CHAIN_ID,
  });

  useEffect(() => {
    void refetch();
  }, [refreshTrigger, refetch]);

  const count: bigint = (dealCount as bigint | undefined) ?? 0n;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>All Deals</h2>
          {!isLoading && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
              {count.toString()} deal{count !== 1n ? 's' : ''} onchain
            </p>
          )}
        </div>
        <button
          onClick={onNewDeal}
          className="flex items-center gap-1 rounded-full px-4 py-2 text-xs font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{ background: 'var(--accent)' }}
        >
          <Plus className="h-3 w-3" /> New Deal
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center gap-3 py-12">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--subtle)' }} />
          <span className="text-sm" style={{ color: 'var(--subtle)' }}>Loading deals...</span>
        </div>
      ) : count === 0n ? (
        <div className="rounded-3xl p-8 text-center" style={glass.card}>
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>No deals yet</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>Create your first deal to get started.</p>
          <button
            onClick={onNewDeal}
            className="mt-4 rounded-full px-5 py-2 text-sm font-semibold text-white"
            style={{ background: 'var(--accent)' }}
          >
            Create a Deal
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {Array.from({ length: Number(count) }, (_, i) => (
            <DealCard
              key={i}
              dealId={BigInt(i)}
              onClick={onSelectDeal}
            />
          ))}
        </div>
      )}
    </div>
  );
}
