import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const config = {
  maxDuration: 300,
};

export default async function handler(request, response) {
  // CORS
  response.setHeader('Access-Control-Allow-Credentials', true);
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const allKeys = [];
    
    // 1. Padrões diretos
    const directNames = ['GEMINI_API_KEY', 'VITE_GEMINI_API_KEY', 'API_KEY', 'Biblia_ADMA_API'];
    for (const name of directNames) {
        const val = process.env[name];
        if (val && typeof val === 'string' && val.trim().length > 15) {
            allKeys.push({ name, key: val.trim() });
        }
    }

    // 2. Busca por valor (iniciam com AIza)
    for (const [keyName, val] of Object.entries(process.env)) {
        if (typeof val === 'string' && val.trim().startsWith('AIza') && val.trim().length > 30) {
            allKeys.push({ name: keyName, key: val.trim() });
        }
    }
    
    // 3. Busca por nome numerado (Fallback)
    for (let i = 1; i <= 100; i++) {
        const keyName = `API_KEY_${i}`;
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
        return response.status(200).json({ keys: [], total: 0, healthy: 0, healthPercentage: 0 });
    }

    // 4. Instanciação Lazy do Supabase Client DENTRO da função handler
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                        process.env.SUPABASE_SECRET_KEY ||
                        process.env.SUPABASE_ANON_KEY;
    const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

    // Helpers de Hashing e Timeout Seguro
    const hashKey = (k) => crypto.createHash('sha256').update(k.trim()).digest('hex');
    const getTodayStr = () => new Date().toISOString().split('T')[0];

    const withTimeout = async (promise, ms, timeoutMsg = 'TIMEOUT') => {
      let timer;
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutMsg)), ms);
      });
      try {
        return await Promise.race([promise, timeoutPromise]);
      } finally {
        clearTimeout(timer);
      }
    };

    // 5. Consulta de estados remotos em lote no Supabase
    const keyHashes = uniqueKeys.map(k => hashKey(k.key));
    const remoteKeyStates = new Map();

    if (supabase) {
      try {
        const queryPromise = supabase
          .from('gemini_key_state')
          .select('key_hash, exhausted_until, daily_exhausted_date')
          .in('key_hash', keyHashes);
        
        const { data, error } = await withTimeout(queryPromise, 2500, 'SUPABASE_READ_TIMEOUT');
        if (!error && Array.isArray(data)) {
          for (const row of data) {
            if (row?.key_hash) remoteKeyStates.set(row.key_hash, row);
          }
        }
      } catch (e) {
        // Fallback silencioso
      }
    }

    const todayStr = getTodayStr();

    const checkKey = async (keyEntry) => {
        const start = Date.now();
        const keyHash = hashKey(keyEntry.key);

        // A) Verifica memória local
        if (global.exhaustedKeys && global.exhaustedKeys.has(keyEntry.key)) {
            const retryTime = global.exhaustedKeys.get(keyEntry.key);
            if (Date.now() < retryTime) {
                const secs = Math.ceil((retryTime - Date.now()) / 1000);
                return {
                    name: keyEntry.name,
                    mask: `...${keyEntry.key.slice(-4)}`,
                    status: 'exhausted',
                    latency: 0,
                    msg: `Cota Excedida (Volta em ${secs}s)`,
                    model: "gemini-3.6-flash"
                };
            } else {
                global.exhaustedKeys.delete(keyEntry.key);
            }
        }

        // B) Verifica estado remoto no Supabase
        if (remoteKeyStates.has(keyHash)) {
            const remoteRow = remoteKeyStates.get(keyHash);
            if (remoteRow.daily_exhausted_date === todayStr) {
                return {
                    name: keyEntry.name,
                    mask: `...${keyEntry.key.slice(-4)}`,
                    status: 'exhausted',
                    latency: 0,
                    msg: 'Cota Diária Esgotada',
                    model: "gemini-3.6-flash"
                };
            }
            if (remoteRow.exhausted_until && new Date(remoteRow.exhausted_until).getTime() > Date.now()) {
                const secs = Math.ceil((new Date(remoteRow.exhausted_until).getTime() - Date.now()) / 1000);
                return {
                    name: keyEntry.name,
                    mask: `...${keyEntry.key.slice(-4)}`,
                    status: 'exhausted',
                    latency: 0,
                    msg: `Cota Excedida (Volta em ${secs}s)`,
                    model: "gemini-3.6-flash"
                };
            }
        }

        try {
            const ai = new GoogleGenAI({ 
                apiKey: keyEntry.key,
                httpOptions: {
                    headers: {
                        'User-Agent': 'aistudio-build',
                    }
                }
            });
            
            // Teste exclusivo: Gemini 3.6 Flash (Sem rebaixamento ou fallback)
            const TARGET_MODEL = 'gemini-3.6-flash';
            let testPassed = false;
            let successModel = TARGET_MODEL;

            const testConfig = { maxOutputTokens: 1 };

            const callPromise = ai.models.generateContent({
                model: TARGET_MODEL,
                contents: [{ role: "user", parts: [{ text: "ping" }] }],
                config: testConfig
            });

            await withTimeout(callPromise, 12000, 'KEY_TEST_TIMEOUT');
            testPassed = true;

            // Sucesso: limpa bloqueios prévios
            if (global.exhaustedKeys) {
                global.exhaustedKeys.delete(keyEntry.key);
            }

            return {
                name: keyEntry.name,
                mask: `...${keyEntry.key.slice(-4)}`,
                status: 'active',
                latency: Date.now() - start,
                msg: 'OK',
                model: successModel
            };

        } catch (e) {
            const err = e.message || String(e);
            let status = 'error';
            let msg = err.substring(0, 60);

            // 1. Timeout (>12s) - Google sobrecarregado ou lenta
            if (err.includes('KEY_TEST_TIMEOUT') || err.includes('TIMEOUT') || err.includes('AbortError')) {
                status = 'timeout';
                msg = 'Lenta / Timeout (>12s)';
                // NÃO marcar como esgotada ou inválida
            }
            // 2. Chave inválida / excluída do console
            else if (err.includes('API key not valid') || err.includes('API_KEY_INVALID')) {
                status = 'invalid';
                msg = 'Chave Inválida / Revogada';
                
                global.exhaustedKeys = global.exhaustedKeys || new Map();
                global.exhaustedKeys.set(keyEntry.key, Date.now() + (24 * 60 * 60 * 1000));
                
                if (supabase) {
                    withTimeout(
                        supabase.from('gemini_key_state').upsert({
                            key_hash: keyHash,
                            exhausted_until: new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString(),
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'key_hash' }),
                        2000,
                        'SUPABASE_WRITE_TIMEOUT'
                    ).catch(() => {});
                }
            }
            // 3. Bloqueada / Sem permissão no GCP (403)
            else if (err.includes('PERMISSION_DENIED') || err.includes('403')) {
                status = 'blocked';
                msg = 'Bloqueada (Permissão GCP / 403)';
                // Chave existe mas projeto GCP não tem permissão da API GenAI
            }
            // 4. Cota esgotada (429 / Quota / RESOURCE_EXHAUSTED)
            else if (err.includes('429') || err.includes('Quota') || err.includes('Exhausted') || err.includes('RESOURCE_EXHAUSTED')) {
                status = 'exhausted';
                const isDaily = err.toLowerCase().includes('per day') || err.toLowerCase().includes('daily') || err.toLowerCase().includes('budget');
                let cooldownMs = 60000;
                
                if (isDaily) {
                    cooldownMs = 4 * 60 * 60 * 1000;
                    msg = 'Cota Diária Esgotada';
                    
                    global.exhaustedKeys = global.exhaustedKeys || new Map();
                    global.exhaustedKeys.set(keyEntry.key, Date.now() + cooldownMs);
                    
                    if (supabase) {
                        withTimeout(
                            supabase.from('gemini_key_state').upsert({
                                key_hash: keyHash,
                                daily_exhausted_date: todayStr,
                                exhausted_until: null,
                                updated_at: new Date().toISOString()
                            }, { onConflict: 'key_hash' }),
                            2000,
                            'SUPABASE_WRITE_TIMEOUT'
                        ).catch(() => {});
                    }
                } else {
                    const retryMatch = err.match(/retry in ([\d.]+)s/);
                    if (retryMatch) {
                        const secs = parseFloat(retryMatch[1]);
                        if (!isNaN(secs)) cooldownMs = (secs * 1000) + 1000;
                        msg = `Cota Excedida (Tente em ${Math.round(secs)}s)`;
                    } else {
                        msg = 'Cota Excedida (RPM)';
                    }

                    global.exhaustedKeys = global.exhaustedKeys || new Map();
                    global.exhaustedKeys.set(keyEntry.key, Date.now() + cooldownMs);
                    
                    if (supabase) {
                        withTimeout(
                            supabase.from('gemini_key_state').upsert({
                                key_hash: keyHash,
                                exhausted_until: new Date(Date.now() + cooldownMs).toISOString(),
                                updated_at: new Date().toISOString()
                            }, { onConflict: 'key_hash' }),
                            2000,
                            'SUPABASE_WRITE_TIMEOUT'
                        ).catch(() => {});
                    }
                }
            }
            // 5. 503 / High Demand / Overloaded
            else if (err.includes('503') || err.includes('Overloaded') || err.includes('high demand') || err.includes('UNAVAILABLE')) {
                status = 'slow';
                msg = 'Ativa (Google Instável 503)';
            }
            // 6. 400 Genérico (Parâmetro inválido, não da chave)
            else if (err.includes('400')) {
                status = 'error';
                msg = 'Erro na Requisição (400)';
            }

            return {
                name: keyEntry.name,
                mask: `...${keyEntry.key.slice(-4)}`,
                status,
                latency: Date.now() - start,
                msg
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
            await new Promise(r => setTimeout(r, 600)); // Intervalo entre lotes
        }
    }

    // Contagem de chaves disponíveis/saudáveis (ativas, lentas ou em timeout transitório)
    const healthyCount = finalResults.filter(r => r.status === 'active' || r.status === 'slow' || r.status === 'timeout').length;

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
