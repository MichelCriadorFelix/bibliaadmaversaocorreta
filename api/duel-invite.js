import { createClient } from '@supabase/supabase-js';

const BIBLE_BOOKS_MAP = {
  "gênesis": "Gênesis", "êxodo": "Êxodo", "levítico": "Levítico", "números": "Números", "deuteronômio": "Deuteronômio",
  "josué": "Josué", "juízes": "Juízes", "rute": "Rute", "1_samuel": "1 Samuel", "2_samuel": "2 Samuel",
  "1_reis": "1 Reis", "2_reis": "2 Reis", "1_crônicas": "1 Crônicas", "2_crônicas": "2 Crônicas",
  "esdras": "Esdras", "neemias": "Neemias", "ester": "Ester", "jó": "Jó", "salmos": "Salmos", "provérbios": "Provérbios",
  "eclesiastes": "Eclesiastes", "cantares": "Cantares", "isaías": "Isaías", "jeremias": "Jeremias",
  "lamentações": "Lamentações", "ezequiel": "Ezequiel", "daniel": "Daniel", "oséias": "Oséias", "joel": "Joel",
  "amós": "Amós", "obadias": "Obadias", "jonas": "Jonas", "miquéias": "Miquéias", "naum": "Naum", "habacuque": "Habacuque",
  "sofonias": "Sofonias", "ageu": "Ageu", "zacarias": "Zacarias", "malaquias": "Malaquias", "mateus": "Mateus",
  "marcos": "Marcos", "lucas": "Lucas", "joão": "João", "atos": "Atos", "romanos": "Romanos", "1_coríntios": "1 Coríntios",
  "2_coríntios": "2 Coríntios", "gálatas": "Gálatas", "efésios": "Efésios", "filipenses": "Filipenses",
  "colossenses": "Colossenses", "1_tessalonicenses": "1 Tessalonicenses", "2_tessalonicenses": "2 Tessalonicenses",
  "1_timóteo": "1 Timóteo", "2_timóteo": "2 Timóteo", "tito": "Tito", "filemom": "Filemom", "hebreus": "Hebreus",
  "tiago": "Tiago", "1_pedro": "1 Pedro", "2_pedro": "2 Pedro", "1_joão": "1 João", "2_joão": "2 João",
  "3_joão": "3 João", "judas": "Judas", "apocalipse": "Apocalipse"
};

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

  // "Bíblia Geral" ou "Bíblia Completa" usa perguntas de TODOS os livros já cadastrados.
  // Qualquer outro livro filtra só pelo prefixo do chapter_key dele.
  const isGeneral = 
    book.toLowerCase().includes('geral') || 
    book.toLowerCase().includes('bíblia toda') || 
    book.toLowerCase().includes('completa') || 
    book.toLowerCase().includes('todos os livros');
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
          // Extrai a referência do livro e capítulo
          let chapterRef = '';
          if (quiz.chapter_key && !quiz.chapter_key.startsWith('general_')) {
            const parts = quiz.chapter_key.split('_');
            if (parts.length >= 2) {
              const chapterNum = parts[parts.length - 1];
              const bookSlug = parts.slice(0, parts.length - 1).join('_').toLowerCase();
              const displayName = BIBLE_BOOKS_MAP[bookSlug] || bookSlug.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
              chapterRef = `${displayName} ${chapterNum}`;
            }
          }
          
          if (!chapterRef && quiz.title) {
            chapterRef = quiz.title
              .replace(/Avaliação do Capítulo:\s*/i, '')
              .replace(/Quiz:\s*/i, '')
              .trim();
          }

          allQuestions.push({
            ...q,
            chapterRef: chapterRef || quiz.title || 'Geral'
          });
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
