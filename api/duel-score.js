export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { invite, userEmail, score, timeSeconds } = req.body || {};
  if (!invite || !userEmail) return res.status(400).json({ error: 'Dados incompletos.' });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Configuração do Supabase ausente.' });

  const isSender = invite.senderEmail.toLowerCase() === userEmail.toLowerCase().trim();
  const opponentEmail = isSender ? invite.receiverEmail : invite.senderEmail;

  if (opponentEmail) {
    try {
      const broadcastTopic = `adma_user_${opponentEmail.toLowerCase().trim()}`;
      
      const broadcastRes = await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
        body: JSON.stringify({
          messages: [{
            topic: broadcastTopic,
            event: 'duel_score',
            payload: { inviteId: invite.id, userEmail, score, timeSeconds },
            private: false,
          }],
        }),
      });

      if (!broadcastRes.ok) console.error('[duel-score] BROADCAST FALHOU:', broadcastRes.status, await broadcastRes.text());
    } catch (chanErr) {
      console.error('[duel-score] Exceção ao enviar broadcast:', chanErr);
    }
  }
  return res.status(200).json({ success: true });
}
