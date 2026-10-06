import { redis } from '../../lib/db';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const ign = String(req.query.ign || '').trim();
    if (!ign) return res.status(400).json({ error: 'Missing IGN' });

    const player = await redis.hgetall(`player:${ign}`);

    if (!player || Object.keys(player).length === 0) {
      return res.status(404).json({ error: 'Player not found' });
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

    // Compute global rank from the sorted set
    const rankIndex = await redis.zrevrank('leaderboard:all', ign);

    res.status(200).json({
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