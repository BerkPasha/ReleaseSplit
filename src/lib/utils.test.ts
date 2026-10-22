// Run with: npx -y bun@1.3.14 test src
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { formatUnits, parseUnits } from 'viem';
import { ARC_CHAIN_ID, USDC_DECIMALS } from './releaseplit-contract';
import { DEAL_FLOW_GAS_RESERVE, GAS_FEE_SAFETY_MULTIPLIER, maxDepositAmount, parseUSDC } from './utils';

const GWEI = 10n ** 9n;
// maxFeePerGas viem estimates on Arc Mainnet at its 20 gwei minimum base fee
const FEE = 24n * GWEI;
const RESERVE = DEAL_FLOW_GAS_RESERVE * FEE * GAS_FEE_SAFETY_MULTIPLIER; // 0.072 USDC, 18 decimals
const native = (value: string) => parseUnits(value, 18);
const usdc = (value: string) => parseUnits(value, 6);
const max = (nativeBalance: bigint, usdcBalance: bigint, fee = FEE) =>
  maxDepositAmount(ARC_CHAIN_ID, nativeBalance, usdcBalance, fee);

void describe('maxDepositAmount', () => {
  void test('keeps the gas reserve back from a real Arc balance', () => {
    // Balances read from the payer wallet on Arc Mainnet: the ERC-20 view is the native view truncated
    const nativeBalance = 10_822_411_411_645_249_000n;
    assert.equal(nativeBalance / 10n ** 12n, 10_822_411n);
    assert.equal(max(nativeBalance, 10_822_411n), 10_750_411n);
    assert.equal(10_822_411n - max(nativeBalance, 10_822_411n), usdc('0.072'));
  });

  void test('returns 6-decimal ERC-20 units, not 18-decimal native units', () => {
    assert.equal(max(native('1') + RESERVE, usdc('1')), 1_000_000n);
  });

  void test('truncates sub-microdollar dust instead of rounding up', () => {
    assert.equal(max(RESERVE + 1_999_999_999_999n, usdc('1')), 1n);
  });

  void test('is never negative', () => {
    for (const nativeBalance of [0n, RESERVE - 1n, RESERVE]) {
      assert.equal(max(nativeBalance, nativeBalance / 10n ** 12n), 0n);
    }
  });

  void test('is never above the ERC-20 balance', () => {
    assert.equal(max(native('5'), usdc('1')), usdc('1'));
    assert.equal(max(native('5'), 0n), 0n);
  });

  void test('reserves more when fees rise', () => {
    // 240 gwei: reserve = 1M gas x 240 gwei x 3 = 0.72 USDC
    assert.equal(max(native('1'), usdc('1'), 240n * GWEI), usdc('0.28'));
  });

  void test('reserve covers the measured createDeal + approve + fundDeal gas with margin', () => {
    assert.ok(DEAL_FLOW_GAS_RESERVE >= 2n * (256_480n + 55_438n + 78_524n));
    assert.ok(GAS_FEE_SAFETY_MULTIPLIER >= 2n);
  });

  void test('refuses a chain whose gas token is not USDC', () => {
    assert.throws(() => maxDepositAmount(1, native('1'), usdc('1'), FEE), /not USDC/);
  });
});

void describe('Max button text', () => {
  void test('parses back to the exact amount, with no locale grouping', () => {
    for (const amount of [0n, 1n, 10_750_411n, 1_234_567_890_000n]) {
      const text = formatUnits(amount, USDC_DECIMALS);
      assert.doesNotMatch(text, /,/);
      assert.equal(parseUSDC(text), amount);
    }
  });
});
