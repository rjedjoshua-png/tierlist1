import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const keys = await redis.keys('tenant:*');
    if (!keys || keys.length === 0) {
      return res.status(200).json({ tenants: [] });
    }

    const pipeline = redis.pipeline();
    keys.forEach((k) => pipeline.hgetall(k));
    const results = await pipeline.exec();

    const tenants = results
      .map((raw) => {
        if (!raw || !raw.slug) return null;
        const slug = String(raw.slug).trim().toLowerCase();
        if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(slug)) return null;

        // Count tiered players for this tenant
        return {
          slug,
          name: raw.name ? String(raw.name) : slug,
          icon_url: raw.avatar_url ? String(raw.avatar_url) : null,
          guild_id: raw.guild_id ? String(raw.guild_id) : null,
        };
      })
      .filter(Boolean);

    tenants.sort((a, b) => a.name.localeCompare(b.name));

    res.status(200).json({ tenants });
  } catch (err) {
    console.error('tenants error:', err);
    res.status(500).json({ error: 'Failed to load tenants', tenants: [] });
  }
}
