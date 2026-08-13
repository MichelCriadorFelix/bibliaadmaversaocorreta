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

  const { senderEmail, senderName, receiverEmail, receiverName, book } = req.body || {};
  if (!senderEmail || !receiverEmail || !book) {
    return res.status(400).json({ error: 'Dados incompletos.' });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Configuração do Supabase ausente.' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // "Bíblia Geral" usa perguntas de TODOS os livros já cadastrados.
  // Qualquer outro livro filtra só pelo prefixo do chapter_key dele.
  const isGeneral = book.toLowerCase().includes('geral') || book.toLowerCase().includes('bíblia toda');
  const bookPrefix = book.toLowerCase().trim().replace(/\s+/g, '_');

  let query = supabase
    .from('adma_content')
    .select('data')
    .eq('collection', 'quizzes');

  if (!isGeneral) {
    query = query.filter('data->>chapter_key', 'ilike', `${bookPrefix}_%`);
  }

  const { data: quizRows, error: quizErr } = await query;

  if (quizErr) {
    console.error('[duel-invite] erro ao buscar quizzes:', quizErr);
  }

  let allQuestions = [];
  (quizRows || []).forEach(row => {
    const quiz = row.data;
    if (!isGeneral && (!quiz.chapter_key || !quiz.chapter_key.toLowerCase().startsWith(bookPrefix))) return;
    if (Array.isArray(quiz.questions)) {
      quiz.questions.forEach(q => {
        if (q.text && Array.isArray(q.options) && q.options.length >= 2 && typeof q.correctIndex === 'number') {
          allQuestions.push(q);
        }
      });
    }
  });

  if (allQuestions.length < 3) {
    return res.status(400).json({ error: 'Perguntas insuficientes cadastradas para este livro. Escolha outro ou cadastre mais quizzes no painel admin.' });
  }

  const shuffled = [...allQuestions].sort(() => 0.5 - Math.random());
  const questions = shuffled.slice(0, Math.min(10, shuffled.length));

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

  // Entrega em tempo real via REST Broadcast API
  try {
    const broadcastTopic = `adma_user_${invite.receiverEmail}`;
    console.log('[duel-invite] Enviando broadcast. Topic:', broadcastTopic, '| URL:', `${supabaseUrl}/realtime/v1/api/broadcast`);
    
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
          event: 'duel_invite',
          payload: { invite },
          private: false,
        }],
      }),
    });

    const broadcastBody = await broadcastRes.text();
    console.log('[duel-invite] Resposta do broadcast REST — status:', broadcastRes.status, '| body:', broadcastBody);
    
    if (!broadcastRes.ok) {
      console.error('[duel-invite] BROADCAST FALHOU:', broadcastRes.status, broadcastBody);
    }
  } catch (chanErr) {
    console.error('[duel-invite] Exceção ao enviar broadcast:', chanErr.message, chanErr.stack);
  }

  return res.status(200).json({ invite });
}
