import { redis } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Sorted set of tester IDs by monthly tests (desc)
    const ids = await redis.zrange('testers:all', 0, -1, { rev: true });

    if (!ids || ids.length === 0) {
      return res.status(200).json({
        testers: [],
        dashboard: {
          totalTestsThisMonth: 0,
          activeTesters: 0,
          onlineNow: 0,
          topContributor: null,
          topThree: [],
        },
      });
    }

    const pipeline = redis.pipeline();
    ids.forEach((id) => pipeline.hgetall(`tester:${id}`));
    const results = await pipeline.exec();

    const testers = results
      .map((raw, i) => {
        if (!raw || Object.keys(raw).length === 0) return null;
        return {
          id: ids[i],
          username: raw.username || ids[i],
          displayName: raw.displayName || raw.username || ids[i],
          avatar: raw.avatar || `https://mc-heads.net/avatar/${encodeURIComponent(raw.username || ids[i])}/40`,
          testsThisMonth: Number(raw.testsThisMonth || 0),
          testsAllTime: Number(raw.testsAllTime || 0),
          online: raw.online === 'true' || raw.online === true,
          role: raw.role || 'Tester',
        };
      })
      .filter(Boolean);

    const totalTestsThisMonth = testers.reduce((sum, t) => sum + t.testsThisMonth, 0);
    const activeTesters = testers.filter((t) => t.testsThisMonth > 0).length;
    const onlineNow = testers.filter((t) => t.online).length;
    const topContributor = testers[0] || null;

    res.status(200).json({
      testers,
      dashboard: {
        totalTestsThisMonth,
        activeTesters,
        onlineNow,
        topContributor,
        topThree: testers.slice(0, 3),
      },
    });
  } catch (err) {
    console.error('testers error:', err);
    res.status(500).json({ error: 'Failed to load testers', testers: [], dashboard: {} });
  }
}
