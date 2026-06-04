const SITE_URL = process.env.URL || "https://smit3y.xyz";
const MAX_AGE_MS = 4 * 60 * 60 * 1000;

interface TickerItem {
  symbol: string;
  price: string;
  change: string;
  isNegative: boolean;
}

interface TickerResponse {
  data: TickerItem[];
  lastUpdated: string | null;
}

export default async () => {
  const log = (msg: string) => console.log(`[ticker-health] ${msg}`);

  try {
    const res = await fetch(`${SITE_URL}/api/ticker`);
    if (!res.ok) {
      log(`ERROR: /api/ticker returned ${res.status}`);
      return new Response("Unhealthy", { status: 500 });
    }

    const body: TickerResponse = await res.json();

    if (!body.lastUpdated) {
      log("WARN: lastUpdated is null — serving fallback data, no live prices");
      return new Response("Fallback data", { status: 500 });
    }

    const lastUpdated = new Date(body.lastUpdated);
    const ageMs = Date.now() - lastUpdated.getTime();
    const ageMin = Math.round(ageMs / 60000);

    log(`Last updated: ${lastUpdated.toISOString()} (${ageMin}m ago)`);
    log(`Coins (${body.data.length}): ${body.data.map((c) => c.symbol).join(", ")}`);

    if (ageMs > MAX_AGE_MS) {
      const ageHours = Math.round(ageMs / 3600000);
      log(`WARN: Data is ${ageHours}h old (max ${MAX_AGE_MS / 3600000}h)`);
      return new Response("Stale data", { status: 500 });
    }

    if (body.data.length !== 10) {
      log(`WARN: Expected 10 coins, got ${body.data.length}`);
      return new Response("Missing coins", { status: 500 });
    }

    for (const coin of body.data) {
      if (!coin.symbol || !coin.price || !coin.change) {
        log(`WARN: Incomplete data for coin: ${JSON.stringify(coin)}`);
        return new Response("Incomplete coin data", { status: 500 });
      }
    }

    log("OK: Prices are fresh and complete");
    return new Response("Healthy", { status: 200 });
  } catch (err) {
    log(`ERROR: ${err instanceof Error ? err.message : err}`);
    return new Response("Error", { status: 500 });
  }
};

export const config = {
  schedule: "0 */2 * * *",
};
