import { redis } from '../lib/db';

const WEAPONS = [
  'Sword','Axe','Mace','Crystal','Netherite','UHC',
  'Pot','SMP','DiaSMP','SpearMace','Cart',
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Each weapon has a list at queue:<weapon>, storing player JSON strings
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

    res.status(200).json({ queues });
  } catch (err) {
    console.error('queue error:', err);
    res.status(500).json({ error: 'Failed to load queue', queues: {} });
  }
}