import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // CORS support
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { inviteId } = req.query || {};
  if (!inviteId) {
    return res.status(400).json({ error: 'Falta o ID do convite.' });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Configuração do Supabase ausente.' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data: row, error } = await supabase
      .from('adma_content')
      .select('data')
      .eq('id', inviteId)
      .eq('collection', 'duel_invites')
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: 'Erro ao buscar convite no banco.' });
    }

    if (!row || !row.data) {
      return res.status(404).json({ error: 'Convite não encontrado.' });
    }

    return res.status(200).json({ invite: row.data });
  } catch (err) {
    console.error('Erro ao processar status do duelo:', err);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
}
