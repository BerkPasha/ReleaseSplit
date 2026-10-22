import artifact from '../../contracts/out/ReleaseSplit.sol/ReleaseSplit.json';

export const CONTRACT_ADDRESS = '0x8891521e3eb78a900e0664e802fb6549b4b4a819' as const;

export const RELEASE_SPLIT_ABI = artifact.abi;

export const RELEASE_SPLIT = {
  address: CONTRACT_ADDRESS,
  abi: RELEASE_SPLIT_ABI,
} as const;

export type DealState = 0 | 1 | 2 | 3;
export const DEAL_STATE_LABELS: Record<DealState, string> = {
  0: 'Created',
  1: 'Funded',
  2: 'Released',
  3: 'Refunded',
};

export interface DealData {
  dealId: bigint;
  payer: string;
  approver: string;
  recipientWallets: [string, string, string];
  recipientBps: [number, number, number];
  recipientCount: number;
  amount: bigint;
  deadline: bigint;
  state: DealState;
}

export const ARC_CHAIN_ID = 5042;
export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const;
export const USDC_DECIMALS = 6;
