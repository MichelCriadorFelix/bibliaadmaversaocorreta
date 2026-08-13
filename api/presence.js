import { createClient } from '@supabase/supabase-js';

export default async function handler(request, response) {
  // --- HEADERS CORS PADRÃO ---
  response.setHeader('Access-Control-Allow-Credentials', true);
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
  response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                        process.env.SUPABASE_SECRET_KEY ||
                        process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error("Presence Error: Credenciais Supabase ausentes.");
        return response.status(200).json({ onlineUsers: [], totalOnline: 0 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const COLLECTION = 'user_presence';
    const TTL_MS = 60 * 1000; // 60 segundos de tolerância

    // 1. POST - Heartbeat do usuário
    if (request.method === 'POST') {
        let body = request.body;
        if (typeof body === 'string') {
            try {
                body = JSON.parse(body);
            } catch (e) {
                return response.status(400).json({ error: 'JSON inválido' });
            }
        }

        const { email, name, level, rankTitle, activity } = body || {};
        if (!email) {
            return response.status(400).json({ error: 'Email é obrigatório' });
        }

        const cleanEmail = String(email).toLowerCase().trim();
        const safeId = 'pres_' + cleanEmail.replace(/[^a-zA-Z0-9_-]/g, '_');
        const now = Date.now();

        const presenceData = {
            email: cleanEmail,
            name: name || cleanEmail.split('@')[0],
            level: Number(level) || 1,
            rankTitle: rankTitle || 'Estudante da Bíblia',
            activity: activity || 'Com a Bíblia Aberta',
            lastHeartbeat: now,
            updatedAt: new Date(now).toISOString()
        };

        const { error } = await supabase
            .from('adma_content')
            .upsert({
                id: safeId,
                collection: COLLECTION,
                data: presenceData
            }, { onConflict: 'id,collection' });

        if (error) {
            console.error("Erro ao salvar presença no Supabase:", error);
        }

        return response.status(200).json({ status: 'ok', email: cleanEmail });
    }

    // 2. GET - Listar usuários online
    if (request.method === 'GET') {
        const { data, error } = await supabase
            .from('adma_content')
            .select('id, data')
            .eq('collection', COLLECTION);

        if (error) {
            console.error("Erro ao buscar presenças no Supabase:", error);
            return response.status(200).json({ onlineUsers: [], totalOnline: 0 });
        }

        const now = Date.now();
        const onlineUsers = [];
        const expiredIds = [];

        (data || []).forEach(row => {
            const user = row.data;
            if (user && user.lastHeartbeat && (now - user.lastHeartbeat <= TTL_MS)) {
                onlineUsers.push({
                    email: user.email,
                    name: user.name,
                    level: user.level,
                    rankTitle: user.rankTitle,
                    activity: user.activity || 'Com a Bíblia Aberta',
                    lastSeen: 'Online agora',
                    isAvailable: true
                });
            } else if (row.id) {
                expiredIds.push(row.id);
            }
        });

        // Limpeza assíncrona de presenças expiradas
        if (expiredIds.length > 0) {
            supabase
                .from('adma_content')
                .delete()
                .in('id', expiredIds)
                .eq('collection', COLLECTION)
                .then(() => {});
        }

        return response.status(200).json({
            onlineUsers,
            totalOnline: onlineUsers.length
        });
    }

    // 3. DELETE - Logout / Saída do app
    if (request.method === 'DELETE') {
        let body = request.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch (e) {}
        }
        const { email } = body || {};
        if (email) {
            const cleanEmail = String(email).toLowerCase().trim();
            const safeId = 'pres_' + cleanEmail.replace(/[^a-zA-Z0-9_-]/g, '_');
            await supabase
                .from('adma_content')
                .delete()
                .eq('id', safeId)
                .eq('collection', COLLECTION);
        }
        return response.status(200).json({ status: 'logged_out' });
    }

    return response.status(405).json({ error: 'Método não permitido' });

  } catch (err) {
    console.error("Exceção na rota de presença:", err);
    return response.status(500).json({ error: 'Erro interno ao processar presença' });
  }
}
