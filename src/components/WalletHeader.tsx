import { ConnectKitButton } from 'connectkit';
import { useAccount } from 'wagmi';
import { ARC_CHAIN_ID } from '../lib/releaseplit-contract';
import { useSwitchChain } from 'wagmi';

const glass = {
  pill: {
    background: 'rgba(255,255,255,0.58)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.66)',
  } as React.CSSProperties,
};

export function WalletHeader({ onHome, onAllDeals }: { onHome?: () => void; onAllDeals?: () => void }) {
  const { chainId, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const wrongChain = isConnected && chainId !== ARC_CHAIN_ID;

  return (
    <header className="mb-6 flex items-center justify-between">
      <button onClick={onHome} className="focus-ring flex items-center gap-2 rounded-xl" aria-label="ReleaseSplit home">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-xl"
          style={{ background: 'var(--accent)' }}
        >
          <span className="text-sm font-bold text-white">RS</span>
        </div>
        <span className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>
          ReleaseSplit
        </span>
      </button>

      <div className="flex items-center gap-2">
        {onAllDeals && (
          <button
            onClick={onAllDeals}
            className="focus-ring hidden rounded-full px-3 py-2 text-xs font-semibold transition-colors hover:bg-white/60 sm:inline-flex"
            style={{ color: 'var(--ink-2)' }}
          >
            All deals
          </button>
        )}
        {wrongChain && (
          <button
            onClick={() => switchChain({ chainId: ARC_CHAIN_ID })}
            className="rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{ background: 'var(--danger)', color: 'white' }}
          >
            Switch to Arc Mainnet
          </button>
        )}
        <ConnectKitButton.Custom>
          {({ isConnected: connected, show, address, truncatedAddress }) => (
            <button
              onClick={show}
              className="rounded-full px-4 py-2 text-xs font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={connected
                ? glass.pill
                : { background: 'var(--accent)', color: 'white' }
              }
            >
              <span style={connected ? { color: 'var(--ink)' } : {}}>
                {connected ? (address ? truncatedAddress : 'Connected') : 'Connect Wallet'}
              </span>
            </button>
          )}
        </ConnectKitButton.Custom>
      </div>
    </header>
  );
}
