import { GoogleGenAI } from "@google/genai";
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

export const config = {
  maxDuration: 60,
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ANON_KEY;
const supabaseAdmin = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

const KEY_STATE_TABLE = 'gemini_key_state';
const PROACTIVE_RPM_PER_KEY = Number(process.env.GEMINI_RPM_PER_KEY) || 8;
const PROACTIVE_TPM_PER_KEY = Number(process.env.GEMINI_TPM_PER_KEY) || 200000;

const keyHash = (apiKey) => crypto.createHash('sha256').update(apiKey).digest('hex');

/** Marca a chave como esgotada no estado compartilhado (mesma tabela usada por api/gemini.js). Best-effort. */
function markKeyExhaustedShared(apiKey, opts) {
  if (!supabaseAdmin) return Promise.resolve();
  const hash = keyHash(apiKey);
  const payload = { key_hash: hash, updated_at: new Date().toISOString() };
  if (opts.exhaustedUntil) payload.exhausted_until = new Date(opts.exhaustedUntil).toISOString();
  if (opts.daily) payload.daily_exhausted_date = new Date().toISOString().slice(0, 10);
  return supabaseAdmin.from(KEY_STATE_TABLE).upsert(payload, { onConflict: 'key_hash' });
}

/** Registra o teste bem-sucedido como uso real na janela proativa compartilhada. Best-effort. */
function recordKeyUsageShared(apiKey, windowCount, windowTokens, windowStart) {
  if (!supabaseAdmin) return Promise.resolve();
  const hash = keyHash(apiKey);
  return supabaseAdmin.from(KEY_STATE_TABLE).upsert({
    key_hash: hash,
    window_start: new Date(windowStart).toISOString(),
    window_count: windowCount,
    window_tokens: windowTokens,
    updated_at: new Date().toISOString()
  }, { onConflict: 'key_hash' });
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const allKeys = [];

    // 1. Busca por padrão (AIza)
    for (const [keyName, val] of Object.entries(process.env)) {
        if (typeof val === 'string' && val.trim().startsWith('AIza') && val.trim().length > 30) {
            allKeys.push({ name: keyName, key: val.trim() });
        }
    }

    // 2. Busca por nome (Fallback)
    const fallbackNames = ['API_KEY', 'Biblia_ADMA_API'];
    for (let i = 1; i <= 100; i++) fallbackNames.push(`API_KEY_${i}`);

    for (const keyName of fallbackNames) {
        const val = process.env[keyName];
        if (val && typeof val === 'string' && val.length > 20 && !val.startsWith('vck_')) {
            allKeys.push({ name: keyName, key: val.trim() });
        }
    }

    const uniqueKeys = [];
    const seen = new Set();
    for (const k of allKeys) {
        if (!seen.has(k.key)) {
            seen.add(k.key);
            uniqueKeys.push(k);
        }
    }

    if (uniqueKeys.length === 0) {
        return response.status(200).json({ keys: [], total: 0, healthy: 0 });
    }

    // --- Puxa o estado COMPARTILHADO (visto por todas as instâncias serverless,
    // não só a que está rodando este teste agora) antes de testar cada chave. ---
    const stateByHash = new Map();
    if (supabaseAdmin) {
        try {
            const hashes = uniqueKeys.map(k => keyHash(k.key));
            const { data } = await supabaseAdmin
                .from(KEY_STATE_TABLE)
                .select('key_hash, exhausted_until, daily_exhausted_date, window_start, window_count, window_tokens')
                .in('key_hash', hashes);
            for (const row of (data || [])) stateByHash.set(row.key_hash, row);
        } catch (e) {
            console.warn('[keys-status] Falha ao ler estado compartilhado:', e.message);
        }
    }

    const todayStr = new Date().toISOString().slice(0, 10);

    const checkKey = async (keyEntry) => {
        const start = Date.now();
        const usedModel = "gemini-3.7-flash";
        const hash = keyHash(keyEntry.key);
        const state = stateByHash.get(hash);
        const windowActive = state?.window_start ? (Date.now() - new Date(state.window_start).getTime()) < 60000 : false;
        const windowCount = windowActive ? (state?.window_count || 0) : 0;
        const windowTokens = windowActive ? (state?.window_tokens || 0) : 0;
        const windowStart = windowActive ? new Date(state.window_start).getTime() : Date.now();
        const dailyExhausted = state?.daily_exhausted_date === todayStr;
        const percentFreeWindow = Math.max(0, Math.round((1 - Math.max(windowCount / PROACTIVE_RPM_PER_KEY, windowTokens / PROACTIVE_TPM_PER_KEY)) * 100));

        const base = { name: keyEntry.name, mask: `...${keyEntry.key.slice(-4)}`, windowCount, windowLimit: PROACTIVE_RPM_PER_KEY, percentFreeWindow };

        // Estado compartilhado já sabe que essa chave está esgotada — nem gasta uma chamada real testando.
        if (dailyExhausted) {
            return { ...base, status: 'esgotada_diaria', latency: 0, msg: '📅 Esgotada (cota diária) — visto por outra instância', model: usedModel };
        }
        const remoteExhaustedUntil = state?.exhausted_until ? new Date(state.exhausted_until).getTime() : 0;
        if (remoteExhaustedUntil > Date.now()) {
            const secs = Math.ceil((remoteExhaustedUntil - Date.now()) / 1000);
            return { ...base, status: 'exhausted', latency: 0, msg: `⏳ Cota Excedida (Volta em ${secs}s) — visto por outra instância`, model: usedModel };
        }

        try {
            const ai = new GoogleGenAI({ apiKey: keyEntry.key });
            await ai.models.generateContent({
                model: usedModel,
                contents: [{ role: "user", parts: [{ text: "hi" }] }],
                // thinkingBudget (numérico), não thinkingLevel (string) — o modelo atual
                // rejeita "MINIMAL" com 400 INVALID_ARGUMENT, o que fazia o teste marcar
                // a CHAVE como inválida quando o problema era o formato do parâmetro.
                config: { maxOutputTokens: 1, thinkingConfig: { thinkingBudget: 0 } }
            });

            // Alimenta o estado compartilhado com este teste bem-sucedido, para que
            // api/gemini.js já saiba que esta chave está saudável e foi usada agora.
            await recordKeyUsageShared(keyEntry.key, windowCount + 1, windowTokens, windowStart);

            return {
                name: keyEntry.name,
                mask: `...${keyEntry.key.slice(-4)}`,
                status: 'active',
                latency: Date.now() - start,
                msg: 'OK',
                model: usedModel,
                windowCount: windowCount + 1,
                windowLimit: PROACTIVE_RPM_PER_KEY,
                percentFreeWindow
            };

        } catch (e) {
            const err = e.message || JSON.stringify(e);
            let status = 'error';
            let msg = err.substring(0, 60);

            if (err.includes('429') || err.includes('Quota') || err.includes('Exhausted') || err.includes('RESOURCE_EXHAUSTED')) {
                status = 'exhausted';
                let cooldownMs = 75000;

                const retryMatch = err.match(/retry in ([\d.]+)s/);
                if (retryMatch) {
                    const secs = parseFloat(retryMatch[1]);
                    if (!isNaN(secs)) cooldownMs = (secs * 1000) + 1000;
                    msg = `Cota Excedida (Tente em ${Math.round(secs)}s)`;
                } else {
                    msg = 'Cota Excedida (RPM)';
                }

                const isDaily = err.toLowerCase().includes('per day') || err.toLowerCase().includes('daily') || err.toLowerCase().includes('budget');
                if (isDaily) {
                    msg = 'Cota Diária Esgotada';
                    await markKeyExhaustedShared(keyEntry.key, { daily: true });
                } else {
                    await markKeyExhaustedShared(keyEntry.key, { exhaustedUntil: Date.now() + cooldownMs });
                }

            } else if (err.includes('API key not valid') || err.includes('API_KEY_INVALID') || err.includes('PERMISSION_DENIED') || err.includes('403')) {
                // Sinal específico de que a CHAVE é o problema (revogada/inválida/sem permissão).
                // Um 400 genérico (ex: parâmetro de requisição errado) NÃO significa chave
                // inválida — bloquear por 4h nesse caso já causou um falso positivo em massa
                // (43 chaves saudáveis marcadas como inválidas por causa de um parâmetro
                // errado no próprio teste, não da chave).
                status = 'invalid';
                msg = 'Chave Inválida';
                await markKeyExhaustedShared(keyEntry.key, { exhaustedUntil: Date.now() + (4 * 60 * 60 * 1000) });
            } else if (err.includes('400') || err.includes('INVALID_ARGUMENT')) {
                // 400 sem sinal de chave inválida = problema na requisição de teste em si
                // (parâmetro, schema, etc.), não na chave. Não bloqueia — só reporta.
                status = 'erro';
                msg = `Erro de requisição (não é a chave): ${err.substring(0, 80)}`;
            } else if (err.includes('503') || err.includes('Overloaded') || err.includes('high demand')) {
                // 503 = Google sobrecarregado, não é a chave que está com problema.
                status = 'active';
                msg = 'Ativa (Google Instável 503)';
            }

            return {
                name: keyEntry.name,
                mask: `...${keyEntry.key.slice(-4)}`,
                status,
                latency: Date.now() - start,
                msg,
                percentFreeWindow
            };
        }
    };

    const BATCH_SIZE = 3;
    const finalResults = [];

    for (let i = 0; i < uniqueKeys.length; i += BATCH_SIZE) {
        const batch = uniqueKeys.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(k => checkKey(k)));
        finalResults.push(...batchResults);

        if (i + BATCH_SIZE < uniqueKeys.length) {
            await new Promise(r => setTimeout(r, 600)); // Delay gentil para não engatilhar anti-spam
        }
    }

    const healthyCount = finalResults.filter(r => r.status === 'active').length;

    return response.status(200).json({
        keys: finalResults,
        total: finalResults.length,
        healthy: healthyCount,
        healthPercentage: finalResults.length > 0 ? Math.round((healthyCount / finalResults.length) * 100) : 0
    });

  } catch (error) {
    console.error("Monitor Error:", error);
    return response.status(500).json({ error: 'Erro crítico no monitoramento.' });
  }
}
