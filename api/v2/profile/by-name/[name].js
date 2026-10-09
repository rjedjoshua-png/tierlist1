import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

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

const GM_TO_MOD = {
  'Sword': 'sword', 'Axe': 'axe', 'Mace': 'mace', 'Crystal': 'crystal',
  'Netherite': 'nethop', 'UHC': 'uhc', 'Pot': 'pot', 'SMP': 'smp',
  'DiaSMP': 'dia_smp', 'Cart': 'cart',
};

const TIER_POINTS = {
  'HT1': 60, 'LT1': 45, 'HT2': 30, 'LT2': 20, 'HT3': 10,
  'LT3': 6, 'HT4': 4, 'LT4': 3, 'HT5': 2, 'LT5': 1,
  'RHT1': 60, 'RLT1': 45, 'RHT2': 30, 'RLT2': 20,
};

async function lookupUuidFromName(name) {
  try {
    const r = await fetch(`https://api.mojang.com/users/profiles/minecraft/${name}`);
    if (!r.ok) return null;
    const data = await r.json();
    return data.id || null;
  } catch (_) {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const name = String(req.query.name || '').trim();
    const slug = String(req.query.slug || '').trim().toLowerCase();

    if (!name) return res.status(400).json({ error: 'Missing name' });
    if (!slug) return res.status(400).json({ error: 'Missing slug' });

    const tenant = await redis.hgetall(`tenant:${slug}`);
    if (!tenant || !tenant.guild_id) {
      return res.status(404).json({ error: 'Tenant not found', slug });
    }
    const gid = String(tenant.guild_id);

    const player = await redis.hgetall(`g:${gid}:player:${name}`);
    if (!player || Object.keys(player).length === 0) {
      return res.status(404).json({ error: 'Player not found', name });
    }

    let webTiers = {};
    try {
      webTiers = typeof player.tiers === 'string' ? JSON.parse(player.tiers) : (player.tiers || {});
    } catch (_) { webTiers = {}; }

    const rankings = {};
    let points = 0;
    for (const [webName, tierStr] of Object.entries(webTiers)) {
      const parsed = parseTier(tierStr);
      if (!parsed) continue;
      const modId = GM_TO_MOD[webName] || webName.toLowerCase();
      rankings[modId] = {
        tier: parsed.tier,
        pos: parsed.pos,
        peak_tier: parsed.tier,
        peak_pos: parsed.pos,
        attained: Math.floor(Date.now() / 1000),
        retired: parsed.retired,
      };
      points += TIER_POINTS[tierStr] || 0;
    }

    const uuid = await lookupUuidFromName(name);
    const region = player.region ? String(player.region) : 'NA';

    let overallRank = 0;
    try {
      const rankIdx = await redis.zrevrank(`g:${gid}:leaderboard:all`, name);
      if (rankIdx !== null && rankIdx !== undefined) overallRank = rankIdx + 1;
    } catch (_) {}

    res.status(200).json({
      uuid: uuid || '00000000000000000000000000000000',
      name: player.ign || name,
      region,
      points,
      overall: overallRank,
      rankings,
      badges: [],
      combat_master: points >= 250,
    });
  } catch (err) {
    console.error('search error:', err);
    res.status(500).json({ error: 'Failed to search player' });
  }
}
