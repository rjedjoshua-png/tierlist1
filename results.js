import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const slug = String(req.query.slug || '').trim().toLowerCase();
    if (!slug) {
      return res.status(400).json({ error: 'Missing slug parameter' });
    }

    // Resolve slug → guild_id
    const tenant = await redis.hgetall(`tenant:${slug}`);
    if (!tenant || Object.keys(tenant).length === 0) {
      return res.status(404).json({ error: 'Tenant not found', slug });
    }
    const guildId = tenant.guild_id;
    if (!guildId) {
      return res.status(500).json({ error: 'Tenant has no guild_id' });
    }

    // Parse filters
    const limit = Math.min(parseInt(req.query.limit || '20', 10) || 20, 100);
    const gamemode = req.query.gamemode ? String(req.query.gamemode) : null;
    const testerId = req.query.tester ? String(req.query.tester) : null;
    const since = req.query.since ? String(req.query.since) : null;

    // Redis key for recent results (written by bot via eclipse.result_posted)
    // We keep a rolling list of the last 200 results per guild
    const key = `g:${guildId}:results:recent`;

    // Fetch raw entries (they're JSON strings)
    let raw = [];
    try {
      raw = await redis.lrange(key, 0, 199);
    } catch (_) {
      raw = [];
    }

    let results = raw
      .map((entry) => {
        try {
          return typeof entry === 'string' ? JSON.parse(entry) : entry;
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean);

    // Apply filters
    if (gamemode) {
      const gm = gamemode.toLowerCase();
      results = results.filter((r) => (r.gamemode || '').toLowerCase() === gm);
    }
    if (testerId) {
      results = results.filter((r) => String(r.testerId || '') === testerId);
    }
    if (since) {
      results = results.filter((r) => (r.testedAt || '') >= since);
    }

    results = results.slice(0, limit);

    return res.status(200).json({
      slug,
      guild_id: guildId,
      count: results.length,
      results,
    });
  } catch (err) {
    console.error('results error:', err);
    return res.status(500).json({ error: 'Failed to load results' });
  }
}
