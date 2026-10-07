import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const slug = String(req.query.slug || '').trim().toLowerCase();
    if (!slug) {
      return res.status(400).json({
        error: 'Missing slug',
        totalPlayers: 0, tieredPlayers: 0, queuedNow: 0
      });
    }

    const tenant = await redis.hgetall(`tenant:${slug}`);
    if (!tenant || Object.keys(tenant).length === 0) {
      return res.status(404).json({
        error: 'Tenant not found', slug,
        totalPlayers: 0, tieredPlayers: 0, queuedNow: 0
      });
    }
    const gid = tenant.guild_id;

    const [totalPlayers, tieredPlayers, queuedNow] = await Promise.all([
      redis.scard(`g:${gid}:players:all`),
      redis.scard(`g:${gid}:players:tiered`),
      redis.llen(`g:${gid}:queue:global`),
    ]);

    res.status(200).json({
      slug,
      totalPlayers: totalPlayers || 0,
      tieredPlayers: tieredPlayers || 0,
      queuedNow: queuedNow || 0,
    });
  } catch (err) {
    console.error('stats error:', err);
    res.status(500).json({
      error: 'Failed to load stats',
      totalPlayers: 0, tieredPlayers: 0, queuedNow: 0,
    });
  }
}
