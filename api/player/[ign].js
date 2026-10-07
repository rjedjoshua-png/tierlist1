import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const slug = String(req.query.slug || '').trim().toLowerCase();
    const ign = String(req.query.ign || '').trim();

    if (!slug) return res.status(400).json({ error: 'Missing slug' });
    if (!ign) return res.status(400).json({ error: 'Missing IGN' });

    const tenant = await redis.hgetall(`tenant:${slug}`);
    if (!tenant || Object.keys(tenant).length === 0) {
      return res.status(404).json({ error: 'Tenant not found', slug });
    }
    const gid = tenant.guild_id;

    const player = await redis.hgetall(`g:${gid}:player:${ign}`);

    if (!player || Object.keys(player).length === 0) {
      return res.status(404).json({ error: 'Player not found', ign });
    }

    let tiers = {};
    try {
      tiers = typeof player.tiers === 'string' ? JSON.parse(player.tiers) : (player.tiers || {});
    } catch (_) {
      tiers = {};
    }

    let rankTitle = null;
    if (player.rankTitle) {
      try {
        rankTitle = typeof player.rankTitle === 'string' ? JSON.parse(player.rankTitle) : player.rankTitle;
      } catch (_) {
        rankTitle = { label: String(player.rankTitle) };
      }
    }

    const rankIndex = await redis.zrevrank(`g:${gid}:leaderboard:all`, ign);

    res.status(200).json({
      slug,
      ign: player.ign || ign,
      avatar: player.avatar || null,
      region: player.region || null,
      totalPts: Number(player.totalPts || 0),
      rank: rankIndex !== null && rankIndex !== undefined ? rankIndex + 1 : null,
      rankTitle,
      tiers,
    });
  } catch (err) {
    console.error('player error:', err);
    res.status(500).json({ error: 'Failed to load player' });
  }
}
