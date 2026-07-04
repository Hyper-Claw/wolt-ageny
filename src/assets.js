import crypto from 'node:crypto';

// Well-known token identifiers
export const USDC_ETH_CONTRACT = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'; // 6 decimals
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

// Builds the enabled-asset registry from config. Each asset carries everything
// the watchers, the donate route, and the front-end need.
export function buildAssets(config) {
  const assets = {};

  const add = (a) => {
    assets[a.id] = {
      ...a,
      min: toBase(String(a.minDisplay), a.decimals),
      // Dust tail (in base units) that uniquely fingerprints a pending donation.
      // Kept far below one cent so it never meaningfully changes the amount.
      dust: () => BigInt(crypto.randomInt(1, a.dustMax)),
      toBase: (amt) => toBase(amt, a.decimals),
      toDisplay: (base) => toDisplay(base, a.decimals),
    };
  };

  if (config.ethAddress) {
    add({
      id: 'eth', chain: 'eth', kind: 'native', symbol: 'ETH', label: 'Ξ Ethereum',
      decimals: 18, recipient: config.ethAddress, coingecko: 'ethereum',
      minDisplay: config.minEth, dustMax: 999_000,
      presets: ['0.005', '0.01', '0.025', '0.05'],
      uri: (recipient, display) => `ethereum:${recipient}?value=${toBase(display, 18)}`,
      wallet: (recipient, base) => ({ kind: 'native', to: recipient, valueHex: '0x' + BigInt(base).toString(16) }),
    });
    if (config.usdcEth) {
      add({
        id: 'usdc_eth', chain: 'eth', kind: 'erc20', symbol: 'USDC', label: '$ USDC · Ethereum',
        decimals: 6, recipient: config.ethAddress, contract: USDC_ETH_CONTRACT, coingecko: 'usd-coin',
        minDisplay: config.minUsdc, dustMax: 999,
        presets: ['5', '10', '25', '50'],
        uri: (recipient, display) =>
          `ethereum:${USDC_ETH_CONTRACT}/transfer?address=${recipient}&uint256=${toBase(display, 6)}`,
        wallet: (recipient, base) => ({
          kind: 'erc20', to: USDC_ETH_CONTRACT,
          // transfer(address,uint256) selector 0xa9059cbb
          data: '0xa9059cbb' +
            recipient.replace(/^0x/, '').toLowerCase().padStart(64, '0') +
            BigInt(base).toString(16).padStart(64, '0'),
        }),
      });
    }
  }

  if (config.solAddress) {
    add({
      id: 'sol', chain: 'sol', kind: 'native', symbol: 'SOL', label: '◎ Solana',
      decimals: 9, recipient: config.solAddress, coingecko: 'solana',
      minDisplay: config.minSol, dustMax: 99_999,
      presets: ['0.05', '0.1', '0.25', '0.5'],
      uri: (recipient, display) => `solana:${recipient}?amount=${display}`,
      wallet: null,
    });
    if (config.usdcSol) {
      add({
        id: 'usdc_sol', chain: 'sol', kind: 'spl', symbol: 'USDC', label: '$ USDC · Solana',
        decimals: 6, recipient: config.solAddress, mint: USDC_SOL_MINT, coingecko: 'usd-coin',
        minDisplay: config.minUsdc, dustMax: 999,
        presets: ['5', '10', '25', '50'],
        uri: (recipient, display) => `solana:${recipient}?amount=${display}&spl-token=${USDC_SOL_MINT}`,
        wallet: null,
      });
    }
  }

  return assets;
}
