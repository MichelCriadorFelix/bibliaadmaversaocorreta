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
    // 1. Validação de Credenciais
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    // Tenta usar a chave de serviço (Admin) primeiro para ignorar RLS, se disponível
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                        process.env.SUPABASE_SECRET_KEY ||
                        process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error("Storage Error: Credenciais Supabase ausentes.");
        return response.status(500).json({ error: "Erro de Configuração do Servidor (Credenciais)." });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 2. Parse do Body com Segurança
    let body = request.body;
    if (typeof body === 'string') {
        try {
            body = JSON.parse(body);
        } catch (e) {
            return response.status(400).json({ error: 'JSON inválido no corpo da requisição.' });
        }
    }
    
    const { action, collection, id, item, criteria } = body || {};

    // 3. Ações
    if (action === 'filter') {
        console.log(`[Storage] Filtering ${collection} with criteria:`, criteria);
        let query = supabase.from('adma_content').select('id, data').eq('collection', collection).limit(10000); // Aumento de limite padrão do Supabase de 1000 para 10000 para evitar truncamento em livros populosos como Gênesis
        if (criteria) {
            Object.entries(criteria).forEach(([key, value]) => {
                if (key === 'user_email' && typeof value === 'string') {
                    query = query.ilike(`data->>${key}`, value);
                } else {
                    query = query.eq(`data->>${key}`, value);
                }
            });
        }
        const { data, error } = await query;
        if (error) {
            console.error(`[Storage] Filter error for ${collection}:`, error);
            throw error;
        }
        console.log(`[Storage] Filter result for ${collection}: ${data?.length || 0} items`);
        // Retorna mapeado com ID para garantir integridade
        return response.status(200).json(data ? data.map(row => ({...row.data, id: row.id || row.data.id})) : []);
    }

    if (action === 'list') {
        const { data, error } = await supabase
            .from('adma_content')
            .select('id, data')
            .eq('collection', collection)
            .limit(10000); // Aumento de limite para 10000

        if (error) throw error;
        return response.status(200).json(data ? data.map(row => ({...row.data, id: row.id})) : []);
    }

    if (action === 'get') {
        const { data, error } = await supabase
            .from('adma_content')
            .select('id, data')
            .eq('collection', collection)
            .eq('id', String(id)) // Força string
            .maybeSingle();

        if (error) throw error;
        if (!data) return response.status(200).json(null);
        return response.status(200).json({ ...data.data, id: data.id });
    }

    if (action === 'save') {
        if (!item) return response.status(400).json({ error: "Item inválido ou vazio." });
        
        // Normalização de ID: Garante que seja String para compatibilidade com coluna text ou uuid
        let finalId = item.id ? String(item.id) : null;
        
        // --- RECUPERAÇÃO DE IDENTIDADE PÓS-RESET ---
        if (collection === 'reading_progress' && item.user_email) {
            // Busca pelo e-mail para ver se o usuário já existe com OUTRO ID
            // Usamos .limit(1) em vez de .maybeSingle() para evitar erro se houver duplicatas
            const { data: existingUsers, error: searchError } = await supabase
                .from('adma_content')
                .select('id, data')
                .eq('collection', collection)
                .ilike('data->>user_email', item.user_email)
                .order('id', { ascending: false }) // Tenta pegar o mais recente ou estável
                .limit(1);

            if (!searchError && existingUsers && existingUsers.length > 0) {
                // Se achou, USA O ID DO BANCO (Ignora o ID local antigo)
                finalId = existingUsers[0].id;
                console.log(`[Storage] Usuário encontrado via e-mail. Vinculando ao ID ${finalId}`);
            }
        }

        // Se ainda não tem ID, gera um timestamp string (seguro para colunas text)
        if (!finalId) {
            finalId = Date.now().toString();
        }

        item.id = finalId; // Atualiza o objeto item com o ID definitivo

        // --- OPERAÇÃO DE UPSERT ---
        const { data, error } = await supabase
            .from('adma_content')
            .upsert({ 
                id: finalId,
                collection: collection, 
                data: item
            }, { onConflict: 'id' })
            .select();

        if (error) {
            console.error("[Storage] Erro no Upsert:", error);
            // Retorna o erro exato do Postgres/Supabase para ajudar no debug
            return response.status(500).json({ 
                error: `Erro ao salvar no banco: ${error.message || error.code}`, 
                details: error 
            });
        }
        
        const savedItem = data?.[0]?.data || item;
        savedItem.id = data?.[0]?.id || finalId;

        return response.status(200).json({ success: true, item: savedItem });
    }

    if (action === 'delete') {
        const { error } = await supabase
            .from('adma_content')
            .delete()
            .eq('id', String(id));

        if (error) throw error;
        return response.status(200).json({ success: true });
    }

    return response.status(400).json({ error: 'Ação desconhecida.' });

  } catch (error) {
    console.error("[Storage] Critical Error:", error);
    return response.status(500).json({ error: error.message || "Erro interno do servidor." });
  }
}
