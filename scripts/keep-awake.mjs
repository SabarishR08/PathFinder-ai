/**
 * Keep-awake pinger — pings the health endpoint every 5 minutes
 * to prevent Vercel Hobby plan from sleeping.
 *
 * Usage:
 *   node scripts/keep-awake.mjs
 *
 * Environment:
 *   APP_URL — the deployed URL (default: https://path-finder-ai-five.vercel.app)
 *   PING_INTERVAL_MS — interval in ms (default: 300000 = 5 min)
 */

const APP_URL = process.env.APP_URL || "https://path-finder-ai-five.vercel.app";
const INTERVAL = Number(process.env.PING_INTERVAL_MS) || 5 * 60 * 1000;

async function ping() {
  const ts = new Date().toISOString();
  try {
    const res = await fetch(`${APP_URL}/api/health`);
    const body = await res.json();
    console.log(`[${ts}] ${res.status} — db: ${body.db}, llm: ${body.llm?.length ?? 0} providers`);
  } catch (err) {
    console.error(`[${ts}] PING FAILED — ${err.message}`);
  }
}

console.log(`Keep-awake started — pinging ${APP_URL} every ${INTERVAL / 1000}s\n`);
ping();
setInterval(ping, INTERVAL);
