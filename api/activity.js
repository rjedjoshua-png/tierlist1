import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=20, stale-while-revalidate=60');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Get all tenants
    const keys = await redis.keys('tenant:*');
    if (!keys || keys.length === 0) {
      return res.status(200).json({ events: [] });
    }

    const pipeline = redis.pipeline();
    keys.forEach((k) => pipeline.hgetall(k));
    const tenants = await pipeline.exec();

    // For each tenant, grab the most recent result entries
    const slugList = [];
    for (const raw of tenants) {
      if (!raw || !raw.slug || !raw.guild_id) continue;
      const slug = String(raw.slug).trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(slug)) continue;
      slugList.push({
        slug,
        name: raw.name ? String(raw.name) : slug,
        gid: String(raw.guild_id),
      });
    }

    if (slugList.length === 0) {
      return res.status(200).json({ events: [] });
    }

    // Pull the top recent results from each tenant
    const resultsPipeline = redis.pipeline();
    slugList.forEach(({ gid }) => resultsPipeline.lrange(`g:${gid}:results:recent`, 0, 4));
    const rawResults = await resultsPipeline.exec();

    const events = [];

    slugList.forEach((t, i) => {
      const list = rawResults[i] || [];
      list.forEach((entry) => {
        try {
          const r = typeof entry === 'string' ? JSON.parse(entry) : entry;
          if (!r || !r.ign) return;
          events.push({
            type: 'result',
            ign: String(r.ign),
            gamemode: String(r.gamemode || ''),
            tier: String(r.tier || ''),
            previousTier: r.previousTier ? String(r.previousTier) : null,
            tester: r.tester ? String(r.tester) : null,
            testedAt: String(r.testedAt || ''),
            slug: t.slug,
            serverName: t.name,
          });
        } catch (_) {}
      });
    });

    // Sort by testedAt descending
    events.sort((a, b) => (b.testedAt || '').localeCompare(a.testedAt || ''));

    res.status(200).json({ events: events.slice(0, 15) });
  } catch (err) {
    console.error('activity error:', err);
    res.status(500).json({ error: 'Failed to load activity', events: [] });
  }
}
