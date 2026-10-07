import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

function weaponDataKey(weapon) {
  if (!weapon || weapon === 'all') return 'all';
  if (weapon === 'Diasmp') return 'DiaSMP';
  if (weapon === 'NethOP') return 'Netherite';
  return weapon;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const slug = String(req.query.slug || '').trim().toLowerCase();
    if (!slug) {
      return res.status(400).json({ error: 'Missing slug', players: [] });
    }

    const tenant = await redis.hgetall(`tenant:${slug}`);
    if (!tenant || Object.keys(tenant).length === 0) {
      return res.status(404).json({ error: 'Tenant not found', slug, players: [] });
    }
    const gid = tenant.guild_id;

    const weapon = weaponDataKey(req.query.weapon || 'all');
    const key = `g:${gid}:leaderboard:${weapon}`;

    const playerIds = await redis.zrange(key, 0, -1, { rev: true });

    if (!playerIds || playerIds.length === 0) {
      return res.status(200).json({ slug, players: [] });
    }

    const pipeline = redis.pipeline();
    playerIds.forEach((id) => pipeline.hgetall(`g:${gid}:player:${id}`));
    const results = await pipeline.exec();

    const players = results
      .map((raw, i) => {
        if (!raw || Object.keys(raw).length === 0) return null;
        let tiers = {};
        try {
          tiers = typeof raw.tiers === 'string' ? JSON.parse(raw.tiers) : (raw.tiers || {});
        } catch (_) {
          tiers = {};
        }
        return {
          ign: raw.ign || playerIds[i],
          avatar: raw.avatar || null,
          region: raw.region || null,
          totalPts: Number(raw.totalPts || 0),
          rankTitle: raw.rankTitle
            ? (typeof raw.rankTitle === 'string' ? JSON.parse(raw.rankTitle) : raw.rankTitle)
            : null,
          tiers,
        };
      })
      .filter(Boolean);

    res.status(200).json({ slug, players });
  } catch (err) {
    console.error('leaderboard error:', err);
    res.status(500).json({ error: 'Failed to load leaderboard', players: [] });
  }
}
