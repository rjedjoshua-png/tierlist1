import { redis } from '../lib/db';

export default async function handler(req, res) {
  // CORS (in case frontend and API end up on different origins)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const [totalPlayers, tieredPlayers, queuedNow] = await Promise.all([
      redis.scard('players:all'),
      redis.scard('players:tiered'),
      redis.llen('queue:global'),
    ]);

    res.status(200).json({
      totalPlayers: totalPlayers || 0,
      tieredPlayers: tieredPlayers || 0,
      queuedNow: queuedNow || 0,
    });
  } catch (err) {
    console.error('stats error:', err);
    res.status(500).json({
      error: 'Failed to load stats',
      totalPlayers: 0,
      tieredPlayers: 0,
      queuedNow: 0,
    });
  }
}