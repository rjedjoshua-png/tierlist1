import Pusher from 'pusher';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const pusher = new Pusher({
      appId: process.env.PUSHER_APP_ID,
      key: process.env.PUSHER_KEY,
      secret: process.env.PUSHER_SECRET,
      cluster: process.env.PUSHER_CLUSTER,
      useTLS: true,
    });

    await pusher.trigger('eclipsetiers-updates', 'tier_updated', {
      ign: 'TestPlayer',
      weapon: 'Sword',
      tier: 'HT1',
    });

    res.status(200).json({ ok: true, message: 'Triggered test event' });
  } catch (err) {
    console.error('pusher test error:', err);
    res.status(500).json({ error: err.message });
  }
}