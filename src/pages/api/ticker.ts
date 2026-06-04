import type { APIRoute } from "astro";
import type { TickerItem } from "../../lib/ticker/types";
import { CoinGeckoProvider } from "../../lib/ticker/coingecko";
import { fallbackItems } from "../../lib/ticker/fallback";

export const prerender = false;

const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

let cache: { data: TickerItem[]; timestamp: number } | null = null;

const provider = new CoinGeckoProvider();

export const GET: APIRoute = async () => {
  const now = Date.now();

  if (cache && now - cache.timestamp < CACHE_TTL_MS) {
    return new Response(JSON.stringify(cache.data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=14400",
      },
    });
  }

  try {
    const data = await provider.fetch();
    cache = { data, timestamp: now };

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=14400",
      },
    });
  } catch {
    if (cache) {
      return new Response(JSON.stringify(cache.data), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, s-maxage=600",
        },
      });
    }

    return new Response(JSON.stringify(fallbackItems), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=600",
      },
    });
  }
};
