import { useRef } from 'react';
import { ArrowRight, ArrowUpRight, Blocks, CircleDollarSign, Clock, SearchCheck, UserCheck } from 'lucide-react';
import { CONTRACT_ADDRESS } from '../lib/releaseplit-contract';
import { formatAddress } from '../lib/utils';

const EXPLORER = 'https://explorer.arc.io';
const spectral = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)';

const glass = {
  card: {
    background: 'rgba(255,255,255,0.64)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    border: '1px solid rgba(255,255,255,0.68)',
    boxShadow: '0 8px 32px rgba(18,45,69,0.08), inset 0 1px 0 rgba(255,255,255,0.55)',
  } as React.CSSProperties,
  pill: {
    background: 'rgba(255,255,255,0.58)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.66)',
  } as React.CSSProperties,
};

const STEPS = [
  { title: 'Create', body: 'Define the payment amount, approver, recipients, and deadline.' },
  { title: 'Fund', body: 'Deposit USDC into the escrow contract.' },
  { title: 'Release or refund', body: 'The approver releases payment before the deadline, or the payer reclaims funds after expiry.' },
];

const TRUST = [
  { icon: Blocks, title: 'Arc Mainnet', body: 'Deployed on Arc, chain ID 5042.' },
  { icon: CircleDollarSign, title: 'USDC payments', body: 'Deals are funded and paid out in USDC.' },
  { icon: SearchCheck, title: 'Onchain verification', body: 'Every deal, deposit, and payout can be checked on Arc Explorer.' },
  { icon: UserCheck, title: 'Independent approver', body: 'Only an approver address separate from the payer can release.' },
  { icon: Clock, title: 'Deadline-based refunds', body: 'After the deadline, the payer can reclaim unreleased funds.' },
];

/** First screen: product intro and process beside the Create Deal form passed in as `children`. */
export function Landing({ children, onViewDeals }: { children: React.ReactNode; onViewDeals: () => void }) {
  const formRef = useRef<HTMLDivElement>(null);

  function goToForm() {
    const form = formRef.current;
    if (!form) return;
    const top = form.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight / 2) {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      form.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }
    form.querySelector('input')?.focus({ preventScroll: true });
  }

  return (
    <div>
      <div className="grid gap-y-10 pt-2 lg:grid-cols-[minmax(0,1fr)_440px] lg:grid-rows-[auto_1fr] lg:gap-x-14 lg:gap-y-12 lg:pt-8">
        {/* Hero */}
        <section className="lg:col-start-1 lg:row-start-1" aria-labelledby="landing-title">
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{ ...glass.pill, color: 'var(--ink-2)' }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--success)' }} aria-hidden="true" />
            Live on Arc Mainnet
          </span>
          <h1
            id="landing-title"
            className="display mt-5 text-[1.875rem] font-bold leading-[1.08] sm:text-5xl lg:text-[2.75rem] xl:text-[3.25rem]"
            style={{ color: 'var(--ink)' }}
          >
            Secure the payment.
            <br />
            <span style={{ color: '#4b5f94' }}>Control the release.</span>
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed sm:text-[17px]" style={{ color: 'var(--ink-2)' }}>
            Lock USDC, assign an independent approver, and split payments automatically across recipients. Refund after the deadline.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button
              onClick={goToForm}
              className="focus-ring rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: 'var(--accent)' }}
            >
              Create a deal
            </button>
            <button
              onClick={onViewDeals}
              className="focus-ring inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ ...glass.pill, color: 'var(--ink)' }}
            >
              View all deals <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </section>

        {/* Create Deal form */}
        <div id="create-deal" ref={formRef} className="scroll-mt-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          {children}
        </div>

        {/* How it works */}
        <section data-landing="steps" className="self-start lg:col-start-1 lg:row-start-2" aria-labelledby="how-title">
          <h2 id="how-title" className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--muted)' }}>
            How it works
          </h2>
          <div className="mt-3 overflow-hidden rounded-3xl" style={glass.card}>
            <div className="h-1" style={{ background: spectral }} />
            <ol className="divide-y divide-[rgba(18,45,69,0.08)]">
              {STEPS.map((step, i) => (
                <li
                  key={step.title}
                  className="grid grid-cols-[2rem_minmax(0,1fr)] items-baseline gap-x-2 px-5 py-4 sm:grid-cols-[2.25rem_9.5rem_minmax(0,1fr)] sm:gap-x-3"
                >
                  <span className="mono text-xs font-medium" style={{ color: 'var(--accent-hover)' }}>
                    0{i + 1}
                  </span>
                  <h3 className="display text-[15px] font-bold" style={{ color: 'var(--ink)' }}>
                    {step.title}
                  </h3>
                  <p className="col-start-2 mt-1 text-sm leading-relaxed sm:col-start-3 sm:mt-0" style={{ color: 'var(--muted)' }}>
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
          <p className="mt-3 px-1 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
            ReleaseSplit charges no platform fee. Arc network fees are paid in USDC from your wallet.
          </p>
        </section>
      </div>

      {/* Trust and transparency */}
      <section
        data-landing="trust"
        className="mt-12 border-t pt-7"
        style={{ borderColor: 'var(--border)' }}
        aria-labelledby="trust-title"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <h2 id="trust-title" className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--muted)' }}>
            Trust and transparency
          </h2>
          <a
            href={`${EXPLORER}/address/${CONTRACT_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring inline-flex items-center gap-1.5 rounded text-xs font-medium"
            style={{ color: 'var(--accent-hover)' }}
          >
            Escrow contract
            <span className="mono hidden sm:inline">{CONTRACT_ADDRESS}</span>
            <span className="mono sm:hidden">{formatAddress(CONTRACT_ADDRESS)}</span>
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">(view on Arc Explorer, opens in a new tab)</span>
          </a>
        </div>
        <ul className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-5">
          {TRUST.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3 lg:flex-col lg:gap-2.5">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                style={{ background: 'rgba(133,177,237,0.16)', color: 'var(--accent-hover)' }}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{title}</h3>
                <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
