export interface TickerItem {
  symbol: string;
  price: string;
  change: string;
  isNegative: boolean;
}

export interface TickerProvider {
  fetch(): Promise<TickerItem[]>;
}
