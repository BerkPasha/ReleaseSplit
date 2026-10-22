import { useState, useCallback } from 'react';
import { WalletHeader } from './components/WalletHeader';
import { CreateDealForm } from './components/CreateDealForm';
import { DealList } from './components/DealList';
import { DealDetail } from './components/DealDetail';

type View = 'list' | 'create' | 'detail';

export default function App() {
  const [view, setView] = useState<View>('list');
  const [selectedDealId, setSelectedDealId] = useState<bigint | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleSelectDeal = useCallback((id: bigint) => {
    setSelectedDealId(id);
    setView('detail');
  }, []);

  const handleDealCreated = useCallback(() => {
    setRefreshTrigger(t => t + 1);
    setView('list');
  }, []);

  return (
    <div
      className="relative min-h-dvh overflow-hidden"
      style={{ background: 'var(--bg-gradient)' }}
    >
      {/* Soft background blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          style={{
            position: 'absolute', top: '8%', left: '5%',
            width: 280, height: 280, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(133,177,237,0.22) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
        <div
          style={{
            position: 'absolute', bottom: '8%', right: '8%',
            width: 260, height: 260, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,205,131,0.20) 0%, transparent 70%)',
            filter: 'blur(58px)',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-md px-4 pb-12 pt-6">
        <WalletHeader />

        {view === 'list' && (
          <DealList
            onSelectDeal={handleSelectDeal}
            onNewDeal={() => setView('create')}
            refreshTrigger={refreshTrigger}
          />
        )}

        {view === 'create' && (
          <div className="space-y-4">
            <button
              onClick={() => setView('list')}
              className="text-sm font-semibold"
              style={{ color: 'var(--accent-hover)' }}
            >
              ← Back to Deals
            </button>
            <CreateDealForm onCreated={handleDealCreated} />
          </div>
        )}

        {view === 'detail' && selectedDealId !== null && (
          <DealDetail
            dealId={selectedDealId}
            onBack={() => setView('list')}
          />
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-xs" style={{ color: 'var(--subtle)' }}>
          ReleaseSplit on Arc Mainnet &middot; USDC escrow + split &middot; No fees
        </div>
      </div>
    </div>
  );
}
