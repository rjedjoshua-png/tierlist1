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
  'Sword': 'sword',
  'Axe': 'axe',
  'Mace': 'mace',
  'Crystal': 'crystal',
  'Netherite': 'nethop',
  'UHC': 'uhc',
  'Pot': 'pot',
  'SMP': 'smp',
  'DiaSMP': 'dia_smp',
  'Cart': 'cart',
};

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

    const tenant = await redis.hgetall(`tenant:${slug}`);
    if (!tenant || !tenant.guild_id) {
      return res.status(404).json({ error: 'Tenant not found', slug });
    }
    const gid = String(tenant.guild_id);

    const ign = await lookupIgnFromUuid(uuid);
    if (!ign) return res.status(404).json({ error: 'Could not resolve UUID' });

    const player = await redis.hgetall(`g:${gid}:player:${ign}`);
    if (!player || Object.keys(player).length === 0) {
      return res.status(200).json({});
    }

    let webTiers = {};
    try {
      webTiers = typeof player.tiers === 'string' ? JSON.parse(player.tiers) : (player.tiers || {});
    } catch (_) { webTiers = {}; }

    const rankings = {};
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
    }

    res.status(200).json(rankings);
  } catch (err) {
    console.error('rankings error:', err);
    res.status(500).json({ error: 'Failed to load rankings' });
  }
}
