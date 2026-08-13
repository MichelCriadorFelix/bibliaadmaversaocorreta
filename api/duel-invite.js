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

  const { senderEmail, senderName, receiverEmail, receiverName, book, questions } = req.body || {};
  if (!senderEmail || !receiverEmail || !book || !Array.isArray(questions)) {
    return res.status(400).json({ error: 'Dados incompletos.' });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Configuração do Supabase ausente.' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const invite = {
    id: `duel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    senderEmail: senderEmail.toLowerCase().trim(),
    senderName,
    receiverEmail: receiverEmail.toLowerCase().trim(),
    receiverName,
    book,
    questionsCount: questions.length,
    status: 'pending',
    questions,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(), // 60s
  };

  // Persiste no mesmo padrão de tabela genérica já usado no projeto
  try {
    const { error } = await supabase.from('adma_content').upsert({
      id: invite.id,
      collection: 'duel_invites',
      data: invite,
    }, { onConflict: 'id,collection' });

    if (error) {
      console.error('Erro ao salvar convite:', error);
    }
  } catch (err) {
    console.error('Erro na persistência do convite:', err);
  }

  // Entrega em tempo real via REST Broadcast API (sem WebSocket, sem race condition)
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
          topic: `adma_user_${invite.receiverEmail}`,
          event: 'duel_invite',
          payload: { invite },
        }],
      }),
    });
    if (!broadcastRes.ok) {
      console.error('Erro no broadcast REST:', await broadcastRes.text());
    }
  } catch (chanErr) {
    console.error('Erro ao enviar broadcast do convite:', chanErr);
  }

  return res.status(200).json({ invite });
}
