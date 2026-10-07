import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const slug = String(req.query.slug || '').trim().toLowerCase();

    if (!slug) {
      // Return the list of all tenants (used by an optional homepage dropdown)
      const keys = await redis.keys('tenant:*');
      if (!keys || keys.length === 0) {
        return res.status(200).json({ tenants: [] });
      }

      const pipeline = redis.pipeline();
      keys.forEach((k) => pipeline.hgetall(k));
      const results = await pipeline.exec();

      const tenants = results
        .map((raw) => {
          if (!raw || Object.keys(raw).length === 0) return null;
          return {
            slug: raw.slug || null,
            name: raw.name || null,
            avatar_url: raw.avatar_url || null,
          };
        })
        .filter((t) => t && t.slug);

      return res.status(200).json({ tenants });
    }

    const tenant = await redis.hgetall(`tenant:${slug}`);

    if (!tenant || Object.keys(tenant).length === 0) {
      return res.status(404).json({ error: 'Tenant not found', slug });
    }

    return res.status(200).json({
      slug: tenant.slug || slug,
      guild_id: tenant.guild_id || null,
      name: tenant.name || 'Quantum Tierlist',
      avatar_url: tenant.avatar_url || null,
    });
  } catch (err) {
    console.error('site-config error:', err);
    return res.status(500).json({ error: 'Failed to load site config' });
  }
}
