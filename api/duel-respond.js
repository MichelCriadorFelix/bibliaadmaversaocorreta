import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // CORS support
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { inviteId, status } = req.body || {}; // status: 'accepted' | 'declined' | 'expired'
  if (!inviteId || !status) return res.status(400).json({ error: 'Dados incompletos.' });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Configuração do Supabase ausente.' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  let invite = null;

  try {
    const { data: row } = await supabase
      .from('adma_content')
      .select('data')
      .eq('id', inviteId)
      .eq('collection', 'duel_invites')
      .maybeSingle();

    if (row && row.data) {
      invite = { ...row.data, status };

      await supabase.from('adma_content')
        .update({ data: invite })
        .eq('id', inviteId)
        .eq('collection', 'duel_invites');
    }
  } catch (err) {
    console.error('Erro ao atualizar convite no banco:', err);
  }

  if (!invite) {
    invite = { id: inviteId, status };
  }

  // Avisa o remetente em tempo real sobre a resposta
  if (invite.senderEmail) {
    try {
      const broadcastRes = await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
        body: JSON.stringify({
          messages: [{
            topic: `adma_user_${invite.senderEmail.toLowerCase().trim()}`,
            event: status === 'accepted' ? 'duel_accepted' : 'duel_declined',
            payload: { invite },
          }],
        }),
      });
      if (!broadcastRes.ok) {
        console.error('Erro no broadcast REST de resposta:', await broadcastRes.text());
      }
    } catch (chanErr) {
      console.error('Erro ao enviar broadcast de resposta do convite:', chanErr);
    }
  }

  return res.status(200).json({ invite });
}
