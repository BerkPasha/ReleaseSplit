import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function formatUSDC(raw: bigint, decimals = 6): string {
  const divisor = BigInt(10 ** decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return fracStr ? `${whole.toLocaleString()}.${fracStr}` : whole.toLocaleString();
}

export function parseUSDC(value: string): bigint {
  const clean = value.trim().replace(/,/g, '');
  if (!clean || isNaN(Number(clean))) return 0n;
  const [whole = '0', frac = ''] = clean.split('.');
  const fracPadded = frac.slice(0, 6).padEnd(6, '0');
  return BigInt(whole) * 1_000_000n + BigInt(fracPadded);
}

export function formatDeadline(ts: bigint): string {
  const date = new Date(Number(ts) * 1000);
  return date.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function deadlineStatus(ts: bigint): 'active' | 'expired' {
  return BigInt(Math.floor(Date.now() / 1000)) <= ts ? 'active' : 'expired';
}

export function parseOnchainError(error: unknown): string {
  const message = (error as { message?: string })?.message?.toLowerCase() ?? '';
  if (message.includes('user rejected') || message.includes('user denied')) {
    return 'Transaction cancelled.';
  }
  if (message.includes('insufficient funds') || message.includes('exceeds balance')) {
    return 'Insufficient USDC balance. Add funds and try again.';
  }
  // Custom errors
  if (message.includes('notpayer')) return 'Only the payer can perform this action.';
  if (message.includes('notapprover')) return 'Only the approver can release funds.';
  if (message.includes('wrongstate')) return 'This deal is not in the right state for that action.';
  if (message.includes('deadlinenotpassed')) return 'The refund deadline has not passed yet.';
  if (message.includes('deadlinepassed')) return 'The release deadline has already passed.';
  if (message.includes('invalidrecipientcount')) return 'Please provide 2 or 3 recipients.';
  if (message.includes('zeroaddress')) return 'One of the addresses is invalid (zero address).';
  if (message.includes('duplicateaddress')) return 'Duplicate address detected. All parties must be distinct.';
  if (message.includes('invalidbps')) return 'Percentage splits must be positive and total exactly 100%.';
  if (message.includes('zeroamount')) return 'Amount must be greater than zero.';
  if (message.includes('invaliddeadline')) return 'The deadline must be in the future.';
  if (message.includes('reverted')) {
    const reasonMatch = message.match(/reason="([^"]+)"/);
    return reasonMatch ? `Transaction failed: ${reasonMatch[1]}` : 'Transaction failed. Please try again.';
  }
  if (message.includes('network') || message.includes('timeout')) {
    return 'Network issue. Check your connection and try again.';
  }
  return 'Something went wrong. Please try again.';
}
