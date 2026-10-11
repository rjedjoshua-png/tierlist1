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

  const action = String(req.query.action || '').toLowerCase();
  const slug = String(req.query.slug || '').trim().toLowerCase();

  try {
    if (action === 'stats') return await handleStats(req, res, slug);
    if (action === 'leaderboard') return await handleLeaderboard(req, res, slug);
    if (action === 'queue') return await handleQueue(req, res);
    return res.status(400).json({ error: 'Unknown action. Use stats|leaderboard|queue' });
  } catch (err) {
    console.error('data error:', err);
    return res.status(500).json({ error: 'Failed to load data' });
  }
}

async function handleStats(req, res, slug) {
  if (!slug) {
    return res.status(400).json({
      error: 'Missing slug',
      totalPlayers: 0, tieredPlayers: 0, queuedNow: 0,
    });
  }

  const tenant = await redis.hgetall(`tenant:${slug}`);
  if (!tenant || Object.keys(tenant).length === 0) {
    return res.status(404).json({
      error: 'Tenant not found', slug,
      totalPlayers: 0, tieredPlayers: 0, queuedNow: 0,
    });
  }
  const gid = tenant.guild_id;

  const [totalPlayers, tieredPlayers, queuedNow] = await Promise.all([
    redis.scard(`g:${gid}:players:all`),
    redis.scard(`g:${gid}:players:tiered`),
    redis.llen(`g:${gid}:queue:global`),
  ]);

  return res.status(200).json({
    slug,
    totalPlayers: totalPlayers || 0,
    tieredPlayers: tieredPlayers || 0,
    queuedNow: queuedNow || 0,
  });
}

async function handleLeaderboard(req, res, slug) {
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

  return res.status(200).json({ slug, players });
}

async function handleQueue(req, res) {
  const WEAPONS = [
    'Sword', 'Axe', 'Mace', 'Crystal', 'Netherite', 'UHC',
    'Pot', 'SMP', 'DiaSMP', 'SpearMace', 'Cart',
  ];

  const pipeline = redis.pipeline();
  WEAPONS.forEach((w) => pipeline.lrange(`queue:${w}`, 0, -1));
  const results = await pipeline.exec();

  const queues = {};
  WEAPONS.forEach((w, i) => {
    const raw = results[i] || [];
    queues[w] = raw
      .map((entry) => {
        try {
          return typeof entry === 'string' ? JSON.parse(entry) : entry;
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean);
  });

  return res.status(200).json({ queues });
}
