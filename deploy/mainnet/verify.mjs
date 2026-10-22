// Read-only Arc Mainnet checks for the ReleaseSplit deployment. Never signs or sends transactions.
//
//   node deploy/mainnet/verify.mjs                 preflight: artifact, chain, USDC, gas
//   node deploy/mainnet/verify.mjs <deployerAddr>  preflight + deployer funding check
//   node deploy/mainnet/verify.mjs <txHash>        post-deploy verification of the deploy tx

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const RPC = 'https://rpc.mainnet.arc.io';
const TESTNET_RPC = 'https://rpc.testnet.arc.io';
const EXPLORER = 'https://explorer.arc.io';
const CHAIN_ID = '0x13b2'; // 5042
const USDC = '0x3600000000000000000000000000000000000000';
const TESTNET_DEPLOYMENT = '0x9472cf2e3cf010430f3daf84d71adec5d5f3fe71';
// SHA-256 of the tested artifact (identical to the code live on Arc Testnet).
const INITCODE_SHA256 = '31ba8a583a4ff1afbb76b81a323a8eaee0eb0b6c562b20b5db5e83e8dbd5e30e';
const RUNTIME_SHA256 = '0445a9e5831c765c4bddeee78565c67bcde03788bbedc5a52acd0908887e7437';
const GAS_BUFFER_PCT = 125n;

const here = path.dirname(fileURLToPath(import.meta.url));
const artifact = JSON.parse(
  fs.readFileSync(path.resolve(here, '../../contracts/out/ReleaseSplit.sol/ReleaseSplit.json'), 'utf8'),
);
const initcode = artifact.bytecode.object.toLowerCase();
const runtime = artifact.deployedBytecode.object.toLowerCase();

let failures = 0;
function check(ok, label, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
}

async function rpc(method, params = [], url = RPC) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

const sha256 = (hex) => crypto.createHash('sha256').update(Buffer.from(hex.slice(2), 'hex')).digest('hex');
const call = (to, data) => rpc('eth_call', [{ to, data }, 'latest']);
// Native USDC (gas) has 18 decimals; the USDC ERC-20 view has 6.
const fmt = (raw, decimals) => {
  const s = BigInt(raw).toString().padStart(decimals + 1, '0');
  return `${s.slice(0, -decimals)}.${s.slice(-decimals)}`;
};

async function preflight(deployer) {
  console.log('--- Artifact ---');
  check(sha256(initcode) === INITCODE_SHA256, 'creation bytecode matches tested artifact', `${(initcode.length - 2) / 2} bytes`);
  check(sha256(runtime) === RUNTIME_SHA256, 'runtime bytecode matches tested artifact', `${(runtime.length - 2) / 2} bytes`);
  check(!artifact.abi.some((x) => x.type === 'constructor'), 'no constructor arguments (deploy data = creation bytecode only)');
  check(Object.keys(artifact.bytecode.linkReferences ?? {}).length === 0, 'no library links');
  const testnetCode = (await rpc('eth_getCode', [TESTNET_DEPLOYMENT, 'latest'], TESTNET_RPC)).toLowerCase();
  check(testnetCode === runtime, 'same bytecode is live on Arc Testnet', TESTNET_DEPLOYMENT);

  console.log('--- Arc Mainnet ---');
  check((await rpc('eth_chainId')) === CHAIN_ID, `official RPC chain ID is 5042`, RPC);
  check((await rpc('eth_getCode', [USDC, 'latest'])).length > 2, 'USDC contract exists', USDC);
  check(BigInt(await call(USDC, '0x313ce567')) === 6n, 'USDC ERC-20 decimals() = 6');

  const from = deployer ?? '0x000000000000000000000000000000000000dEaD';
  const gas = BigInt(await rpc('eth_estimateGas', [{ from, data: initcode, value: '0x0' }]));
  const gasLimit = (gas * GAS_BUFFER_PCT) / 100n;
  const gasPrice = BigInt(await rpc('eth_gasPrice'));
  const block = await rpc('eth_getBlockByNumber', ['latest', false]);
  console.log(`INFO  estimated gas ${gas} (page sends gas limit ${gasLimit})`);
  console.log(`INFO  base fee ${Number(BigInt(block.baseFeePerGas)) / 1e9} gwei, gas price ${Number(gasPrice) / 1e9} gwei (Arc minimum base fee: 20 gwei)`);
  console.log(`INFO  expected cost ~${fmt(gas * gasPrice, 18)} USDC; worst case at 2x gas price ${fmt(gasLimit * gasPrice * 2n, 18)} USDC`);

  if (deployer) {
    console.log('--- Deployer ---');
    const native = BigInt(await rpc('eth_getBalance', [deployer, 'latest']));
    const erc20 = BigInt(await call(USDC, `0x70a08231${deployer.slice(2).toLowerCase().padStart(64, '0')}`));
    console.log(`INFO  native balance  ${fmt(native, 18)} USDC (18 decimals, pays gas)`);
    console.log(`INFO  ERC-20 balance  ${fmt(erc20, 6)} USDC (6 decimals, same funds, truncated view)`);
    check(native >= gasLimit * gasPrice * 2n, 'deployer can cover gas with 2x margin');
    console.log(`INFO  deployer nonce ${BigInt(await rpc('eth_getTransactionCount', [deployer, 'latest']))}`);
  }
}

async function postDeploy(txHash) {
  console.log('--- Deployment tx ---');
  const tx = await rpc('eth_getTransactionByHash', [txHash]);
  const receipt = await rpc('eth_getTransactionReceipt', [txHash]);
  if (!tx || !receipt) {
    check(false, 'transaction found and mined on Arc Mainnet', txHash);
    return;
  }
  check(receipt.status === '0x1', 'transaction succeeded');
  check(tx.to === null, 'transaction is a contract creation (no recipient)');
  check(BigInt(tx.value) === 0n, 'no USDC value sent with deployment');
  check(tx.input.toLowerCase() === initcode, 'deploy data equals tested creation bytecode exactly');
  const address = receipt.contractAddress;
  check(!!address, 'contract address assigned', address ?? 'none');
  if (!address) return;

  console.log('--- Deployed contract ---');
  check((await rpc('eth_getCode', [address, 'latest'])).toLowerCase() === runtime, 'onchain runtime bytecode equals tested artifact');
  check(BigInt(await call(address, '0x02d45457')) === BigInt(USDC), 'usdcAddress() = 0x3600...0000');
  check(BigInt(await call(address, '0xeadb3c9c')) === 0n, 'dealCount() = 0');

  const paid = BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice);
  console.log(`INFO  deployer ${tx.from}, gas used ${BigInt(receipt.gasUsed)}, fee paid ${fmt(paid, 18)} USDC`);
  console.log(`INFO  ${EXPLORER}/address/${address}`);
  console.log(`INFO  ${EXPLORER}/tx/${txHash}`);
}

const arg = process.argv[2];
try {
  if (/^0x[0-9a-fA-F]{64}$/.test(arg ?? '')) await postDeploy(arg);
  else if (/^0x[0-9a-fA-F]{40}$/.test(arg ?? '')) await preflight(arg);
  else if (!arg) await preflight();
  else throw new Error('Argument must be a deployer address (0x + 40 hex) or a tx hash (0x + 64 hex).');
} catch (error) {
  check(false, 'RPC request', error.message);
}
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED - do not proceed`);
process.exitCode = failures === 0 ? 0 : 1;
