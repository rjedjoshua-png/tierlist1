import { redis } from '../lib/db';

// Map the frontend's weapon label to the DB field name
function weaponDataKey(weapon) {
  if (!weapon || weapon === 'all') return 'all';
  if (weapon === 'Diasmp') return 'DiaSMP';
  if (weapon === 'NethOP') return 'Netherite';
  return weapon;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const weapon = weaponDataKey(req.query.weapon || 'all');

    // Sorted set of all registered players by total points (desc)
    const playerIds = await redis.zrange('leaderboard:all', 0, -1, { rev: true });

    if (!playerIds || playerIds.length === 0) {
      return res.status(200).json({ players: [] });
    }

    // Fetch each player's hash data in one pipelined round-trip
    const pipeline = redis.pipeline();
    playerIds.forEach((id) => pipeline.hgetall(`player:${id}`));
    const results = await pipeline.exec();

    // Filter out empties + shape the response
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

    res.status(200).json({ players });
  } catch (err) {
    console.error('leaderboard error:', err);
    res.status(500).json({ error: 'Failed to load leaderboard', players: [] });
  }
}