import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

const GM_MAP = {
  'Sword':     { web: 'Sword',     mod: 'sword' },
  'Axe':       { web: 'Axe',       mod: 'axe' },
  'Mace':      { web: 'Mace',      mod: 'mace' },
  'Crystal':   { web: 'Crystal',   mod: 'crystal' },
  'Netherite': { web: 'Netherite', mod: 'nethop' },
  'UHC':       { web: 'UHC',       mod: 'uhc' },
  'Pot':       { web: 'Pot',       mod: 'pot' },
  'SMP':       { web: 'SMP',       mod: 'smp' },
  'DiaSMP':    { web: 'DiaSMP',    mod: 'dia_smp' },
  'Cart':      { web: 'Cart',      mod: 'cart' },
};

const TIER_POINTS = {
  'HT1': 60, 'LT1': 45, 'HT2': 30, 'LT2': 20, 'HT3': 10,
  'LT3': 6, 'HT4': 4, 'LT4': 3, 'HT5': 2, 'LT5': 1,
  'RHT1': 60, 'RLT1': 45, 'RHT2': 30, 'RLT2': 20,
};

function parseTier(tierStr) {
  if (!tierStr) return null;
  const s = String(tierStr).toUpperCase();
  const retired = s.startsWith('R');
  const cleaned = retired ? s.slice(1) : s;
  const m = cleaned.match(/^([HL])T([1-5])$/);
  if (!m) return null;
  const pos = m[1] === 'H' ? 0 : 1;
  const tier = parseInt(m[2], 10);
  return { tier, pos, retired };
}

async function lookupIgnFromUuid(uuid) {
  const cleanUuid = uuid.replace(/-/g, '');

  // Try Mojang first (premium accounts)
  try {
    const r = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${cleanUuid}`);
    if (r.ok) {
      const data = await r.json();
      if (data && data.name) return data.name;
    }
  } catch (_) {
    // fall through to Redis
  }

  // Fallback: check our Redis mapping (cracked accounts)
  try {
    const stored = await redis.get(`uuid:${cleanUuid}`);
    if (stored) return String(stored);
  } catch (_) {
    // ignore
  }

  return null;
}

async function computePoints(tiers) {
  let total = 0;
  for (const t of Object.values(tiers || {})) {
    total += TIER_POINTS[t] || 0;
  }
  return total;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const uuid = String(req.query.uuid || '').trim();
    const slug = String(req.query.slug || '').trim().toLowerCase();

    if (!uuid) return res.status(400).json({ error: 'Missing UUID' });
    if (!slug) return res.status(400).json({ error: 'Missing slug' });

    // Resolve tenant -> guild_id
    const tenant = await redis.hgetall(`tenant:${slug}`);
    if (!tenant || !tenant.guild_id) {
      return res.status(404).json({ error: 'Tenant not found', slug });
    }
    const gid = String(tenant.guild_id);

    // Convert UUID -> IGN (Mojang for premium, Redis for cracked)
    const ign = await lookupIgnFromUuid(uuid);
    if (!ign) {
      return res.status(404).json({ error: 'Could not resolve UUID to IGN', uuid });
    }

    // Look up player in Redis
    const player = await redis.hgetall(`g:${gid}:player:${ign}`);
    if (!player || Object.keys(player).length === 0) {
      return res.status(404).json({ error: 'Player not found', ign });
    }

    let webTiers = {};
    try {
      webTiers = typeof player.tiers === 'string' ? JSON.parse(player.tiers) : (player.tiers || {});
    } catch (_) { webTiers = {}; }

    // Build MCTiers-shaped rankings
    const rankings = {};
    for (const [webName, tierStr] of Object.entries(webTiers)) {
      const parsed = parseTier(tierStr);
      if (!parsed) continue;

      const entry = Object.values(GM_MAP).find(g => g.web.toLowerCase() === webName.toLowerCase());
      const modId = entry ? entry.mod : webName.toLowerCase();

      rankings[modId] = {
        tier: parsed.tier,
        pos: parsed.pos,
        peak_tier: parsed.tier,
        peak_pos: parsed.pos,
        attained: Math.floor(Date.now() / 1000),
        retired: parsed.retired,
      };
    }

    const points = await computePoints(webTiers);
    const region = player.region ? String(player.region) : 'NA';

    // Compute overall rank
    let overallRank = 0;
    try {
      const rankIdx = await redis.zrevrank(`g:${gid}:leaderboard:all`, ign);
      if (rankIdx !== null && rankIdx !== undefined) overallRank = rankIdx + 1;
    } catch (_) {}

    const response = {
      uuid: uuid.replace(/-/g, ''),
      name: ign,
      region: region,
      points: points,
      overall: overallRank,
      rankings: rankings,
      badges: [],
      combat_master: points >= 250,
    };

    res.status(200).json(response);
  } catch (err) {
    console.error('profile error:', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
}
