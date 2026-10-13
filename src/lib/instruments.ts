export type DataSource = 'fxcm' | 'exness';

export interface Instrument {
  symbol: string;
  base: string;
  quote: string;
  pip: number;
  digits: number;
  contract: number;
  source: DataSource;
  from: string;
  stopPips: number[];
}

const FOREX = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD',
  'EURJPY', 'GBPJPY', 'AUDJPY', 'CADJPY', 'NZDJPY',
  'EURGBP', 'EURAUD', 'EURCHF', 'EURNZD',
  'GBPCHF', 'GBPCAD', 'GBPNZD',
  'AUDCAD', 'AUDCHF', 'AUDNZD', 'CADCHF', 'NZDCAD', 'NZDCHF',
];

export const MAJORS = FOREX.slice(0, 7);
export const CROSSES = FOREX.slice(7);
export const METALS = ['XAUUSD'];

const forex = (symbol: string): Instrument => {
  const quote = symbol.slice(3);
  const jpy = quote === 'JPY';
  return {
    symbol,
    base: symbol.slice(0, 3),
    quote,
    pip: jpy ? 0.01 : 0.0001,
    digits: jpy ? 3 : 5,
    contract: 100_000,
    source: 'fxcm',
    from: '2012-01-09',
    stopPips: [10, 20, 30, 50],
  };
};

const GOLD: Instrument = {
  symbol: 'XAUUSD',
  base: 'XAU',
  quote: 'USD',
  pip: 0.1,
  digits: 2,
  contract: 100,
  source: 'exness',
  from: '2015-08-24',
  stopPips: [30, 50, 100, 200],
};

export const INSTRUMENTS: Instrument[] = [...FOREX.map(forex), GOLD];

export function getInstrument(symbol: string): Instrument {
  const found = INSTRUMENTS.find((i) => i.symbol === symbol);
  if (!found) throw new Error(`Unknown instrument ${symbol}`);
  return found;
}

export const isSymbol = (symbol: string): boolean => INSTRUMENTS.some((i) => i.symbol === symbol);

export const pairLabel = (symbol: string): string => `${symbol.slice(0, 3)}/${symbol.slice(3)}`;

export function conversionPair(inst: Instrument): { symbol: string; invert: boolean } | null {
  if (inst.quote === 'USD') return null;
  const direct = `${inst.quote}USD`;
  if (FOREX.includes(direct)) return { symbol: direct, invert: false };
  return { symbol: `USD${inst.quote}`, invert: true };
}
