import { GoogleGenAI } from "@google/genai";

export const config = {
  maxDuration: 60,
};

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const allKeys = [];
    
    // 1. Busca por padrão (Aiza)
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

    const checkKey = async (keyEntry) => {
        const start = Date.now();
        let usedModel = "gemini-3.5-flash";

        // Verifica na memória global se esta chave já está marcada como bloqueada pela aplicação (gemini.js)
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
                    model: usedModel
                };
            } else {
                global.exhaustedKeys.delete(keyEntry.key);
            }
        }

        try {
            const ai = new GoogleGenAI({ apiKey: keyEntry.key });
            
            const performCall = async () => {
                // O teste real DEVE usar generateContent pois o models.get() não gasta a quota de geração
                // e gera um falso positivo de que a chave está "ativa".
                // Usamos gemini-1.5-flash pois é muito rápido e gasta pouquíssima quota no teste
                const res = await ai.models.generateContent({
                    model: "gemini-1.5-flash",
                    contents: [{ role: "user", parts: [{ text: "hi" }] }],
                    config: { maxOutputTokens: 1 }
                });
                return res;
            };

            let result;
            try {
                result = await performCall();
            } catch (errPrimary) {
                throw errPrimary;
            }

            return {
                name: keyEntry.name,
                mask: `...${keyEntry.key.slice(-4)}`,
                status: 'active',
                latency: Date.now() - start,
                msg: 'OK',
                model: "gemini-1.5-flash"
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

                // Limite Verdadeiro de Quota (Daily/Total) -> Descanso de 4 Horas
                if (err.toLowerCase().includes('per day') || err.toLowerCase().includes('daily') || err.toLowerCase().includes('budget')) {
                    cooldownMs = 4 * 60 * 60 * 1000;
                    msg = 'Cota Diária Esgotada (Espera 4h)';
                }

                global.exhaustedKeys = global.exhaustedKeys || new Map();
                global.exhaustedKeys.set(keyEntry.key, Date.now() + cooldownMs);
                
            } else if (err.includes('API key not valid') || err.includes('400')) {
                status = 'invalid';
                msg = 'Chave Inválida';
                
                global.exhaustedKeys = global.exhaustedKeys || new Map();
                global.exhaustedKeys.set(keyEntry.key, Date.now() + (4 * 60 * 60 * 1000)); // Bloqueia chaves inválidas p/ não atrasar
            } else if (err.includes('503') || err.includes('Overloaded') || err.includes('high demand')) {
                // Trata o 503 como ativa mas Instável. Uma chave com 503 não significa que está esgotada ou inválida,
                // significa que o Google negou o request por carga. Podemos considerá-la ativa para propósitos do monitor,
                // já que o esgotamento (Quota) retornaria 429.
                status = 'active'; 
                msg = 'Ativa (Google Instável 503)';
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
            await new Promise(r => setTimeout(r, 600)); // Delay mais gentil para não engatilhar anti-spam
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