import crypto from 'node:crypto';
import { buildChains } from './chains.js';

export const USDC_SOL_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';    // 6 decimals
// keccak256("Transfer(address,address,uint256)")
export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const pow10 = (d) => 10n ** BigInt(d);

export function toBase(amount, decimals) {
  const [whole = '0', frac = ''] = String(amount).split('.');
  return BigInt(whole) * pow10(decimals) + BigInt((frac + '0'.repeat(decimals)).slice(0, decimals));
}

export function toDisplay(base, decimals) {
  const b = BigInt(base);
  const whole = b / pow10(decimals);
  const frac = (b % pow10(decimals)).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

// Builds the enabled-asset registry. ETH and USDC are single logical assets that
// are accepted on every watched EVM network (her address is the same on all of
// them), so donors never pick a network.
export function buildAssets(config) {
  const assets = {};
  const chains = buildChains();

  const add = (a) => {
    assets[a.id] = {
      ...a,
      min: toBase(String(a.minDisplay), a.decimals),
      dust: () => BigInt(crypto.randomInt(1, a.dustMax)),
      toBase: (amt) => toBase(amt, a.decimals),
      toDisplay: (base) => toDisplay(base, a.decimals),
    };
  };

  if (config.ethAddress) {
    const ethNetworks = chains.filter((c) => c.nativeEth).map((c) => c.name);
    const usdcNetworks = chains.filter((c) => c.usdc).map((c) => c.name);

    add({
      id: 'eth', kind: 'native', evm: true, symbol: 'ETH', label: 'ETH',
      decimals: 18, recipient: config.ethAddress, coingecko: 'ethereum',
      networks: ethNetworks, minDisplay: config.minEth, dustMax: 999_000,
      presets: ['0.005', '0.01', '0.025', '0.05'],
      uri: (recipient, display) => `ethereum:${recipient}?value=${toBase(display, 18)}`,
      wallet: (recipient, base) => ({ kind: 'native', to: recipient, valueHex: '0x' + BigInt(base).toString(16) }),
    });
    add({
      id: 'usdc', kind: 'erc20', evm: true, symbol: 'USDC', label: 'USDC',
      decimals: 6, recipient: config.ethAddress, coingecko: 'usd-coin',
      networks: usdcNetworks, minDisplay: config.minUsdc, dustMax: 999,
      presets: ['5', '10', '25', '50'],
      // address-only URI so it's network-agnostic; exact amount shown as text
      uri: (recipient) => `ethereum:${recipient}`,
      wallet: (recipient, base) => ({ kind: 'erc20', recipient, amountBase: base.toString() }),
    });
  }

  if (config.btcAddress) {
    add({
      id: 'btc', kind: 'btc', evm: false, symbol: 'BTC', label: 'Bitcoin (BTC)',
      decimals: 8, recipient: config.btcAddress, coingecko: 'bitcoin',
      networks: ['Bitcoin'], minDisplay: config.minBtc, dustMax: 99_999,
      presets: ['0.0002', '0.0005', '0.001', '0.002'],
      uri: (recipient, display) => `bitcoin:${recipient}?amount=${display}`,
      wallet: null,
    });
  }

  if (config.solAddress) {
    add({
      id: 'sol', kind: 'native', evm: false, symbol: 'SOL', label: 'Solana (SOL)',
      decimals: 9, recipient: config.solAddress, coingecko: 'solana',
      networks: ['Solana'], minDisplay: config.minSol, dustMax: 99_999,
      presets: ['0.05', '0.1', '0.25', '0.5'],
      uri: (recipient, display) => `solana:${recipient}?amount=${display}`,
      wallet: null,
    });
    if (config.usdcSol) {
      add({
        id: 'usdc_sol', kind: 'spl', evm: false, symbol: 'USDC', label: 'USDC (Solana)',
        decimals: 6, recipient: config.solAddress, mint: USDC_SOL_MINT, coingecko: 'usd-coin',
        networks: ['Solana'], minDisplay: config.minUsdc, dustMax: 999,
        presets: ['5', '10', '25', '50'],
        uri: (recipient, display) => `solana:${recipient}?amount=${display}&spl-token=${USDC_SOL_MINT}`,
        wallet: null,
      });
    }
  }

  return { assets, chains };
}
