import type { TickerItem, TickerProvider } from "./types";

const COINGECKO_IDS = [
  "avalanche-2",
  "chainlink",
  "bitcoin",
  "ethereum",
  "solana",
  "dogecoin",
  "hyperliquid",
  "binancecoin",
  "ripple",
  "cardano",
] as const;

const DISPLAY_ORDER: Record<string, number> = {
  AVAX: 0,
  LINK: 1,
  BTC: 2,
  ETH: 3,
  SOL: 4,
  DOGE: 5,
  HYPE: 6,
  BNB: 7,
  XRP: 8,
  ADA: 9,
};

function formatPrice(usd: number): string {
  if (usd >= 1) {
    return (
      "$" +
      usd.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }
  return "$" + usd.toFixed(4);
}

function formatChange(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

interface CoinGeckoMarket {
  symbol: string;
  current_price: number;
  price_change_percentage_24h: number | null;
}

export class CoinGeckoProvider implements TickerProvider {
  async fetch(): Promise<TickerItem[]> {
    const apiKey = import.meta.env.COINGECKO_API_KEY;
    const ids = COINGECKO_IDS.join(",");

    const url = new URL("https://api.coingecko.com/api/v3/coins/markets");
    url.searchParams.set("vs_currency", "usd");
    url.searchParams.set("ids", ids);
    url.searchParams.set("price_change_percentage", "24h");

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (apiKey) {
      headers["x-cg-demo-api-key"] = apiKey;
    }

    const res = await fetch(url.toString(), { headers });

    if (!res.ok) {
      throw new Error(`CoinGecko API error: ${res.status}`);
    }

    const data: CoinGeckoMarket[] = await res.json();

    const items: TickerItem[] = data.map((coin) => {
      const pct = coin.price_change_percentage_24h ?? 0;
      return {
        symbol: coin.symbol.toUpperCase(),
        price: formatPrice(coin.current_price),
        change: formatChange(pct),
        isNegative: pct < 0,
      };
    });

    items.sort(
      (a, b) =>
        (DISPLAY_ORDER[a.symbol] ?? 99) - (DISPLAY_ORDER[b.symbol] ?? 99),
    );

    return items;
  }
}
