const GAMEMODES = [
  { id: 'sword', title: 'Sword' },
  { id: 'axe', title: 'Axe' },
  { id: 'mace', title: 'Mace' },
  { id: 'crystal', title: 'Crystal' },
  { id: 'nethop', title: 'NethOP' },
  { id: 'uhc', title: 'UHC' },
  { id: 'pot', title: 'Pot' },
  { id: 'smp', title: 'SMP' },
  { id: 'dia_smp', title: 'DiaSMP' },
  { id: 'cart', title: 'Cart' },
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const payload = {};
  for (const gm of GAMEMODES) {
    payload[gm.id] = { title: gm.title };
  }
  res.status(200).json(payload);
}
