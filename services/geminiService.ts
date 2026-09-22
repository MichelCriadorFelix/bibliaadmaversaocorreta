
/**
 * SERVIÇO GEMINI AI - ADMA EDITION
 * Adaptado para comunicação segura via proxy local.
 */

// Tipos de tarefas para seleção inteligente de modelo no servidor
export type TaskType = 'commentary' | 'dictionary' | 'devotional' | 'ebd' | 'metadata' | 'general' | 'teacher_ebd' | 'quiz_gen' | 'thematic_ebd' | 'assistente_chat' | 'upgrade_ebd' | 'upgrade_teacher_ebd' | 'upgrade_thematic_ebd' | 'get_bible_verses' | 'chapter_focus_suggestion' | 'thematic_focus_suggestion' | 'fetch_primary_source';

export interface GenerationProgress {
  percent: number;
  message: string;
  cycle?: number;
  attempt?: number;
  totalKeys?: number;
  stage?: 'connecting' | 'querying' | 'processing' | 'saving' | 'completed' | 'error';
}

export interface GenerationContext {
  book?: string;
  chapter?: number;
  verse?: number;
  depthLevel?: string;
  targetPages?: string;
  thinkingLevel?: string;
  themeTitle?: string;
  moduleTitle?: string;
  customInstructions?: string;
  existingContent?: string;
  relevanceWeight?: 'baixo' | 'medio' | 'alto';
}

// --- GERENCIAMENTO INTELIGENTE DE QUARENTENA DE CHAVES (LOCALSTORAGE) ---
// Evita que o aplicativo insista em chaves que acabaram de bater cota (429) em gerações anteriores
const EXHAUSTED_CACHE_KEY = 'adma_gemini_exhausted_hashes_cache_v1';

interface ExhaustedRecord {
    hash: string;
    expiresAt: number;
}

const getCachedExhaustedHashes = (): string[] => {
    try {
        const raw = localStorage.getItem(EXHAUSTED_CACHE_KEY);
        if (!raw) return [];
        const records: ExhaustedRecord[] = JSON.parse(raw);
        const now = Date.now();
        const valid = records.filter(r => r && r.expiresAt > now);
        if (valid.length !== records.length) {
            localStorage.setItem(EXHAUSTED_CACHE_KEY, JSON.stringify(valid));
        }
        return valid.map(r => r.hash);
    } catch {
        return [];
    }
};

const saveExhaustedHashesToCache = (hashes: string[], ttlMs: number = 75000) => {
    try {
        if (!hashes || !Array.isArray(hashes) || hashes.length === 0) return;
        const raw = localStorage.getItem(EXHAUSTED_CACHE_KEY);
        const existing: ExhaustedRecord[] = raw ? JSON.parse(raw) : [];
        const now = Date.now();
        const map = new Map<string, number>();
        
        for (const r of existing) {
            if (r.expiresAt > now) map.set(r.hash, r.expiresAt);
        }
        for (const h of hashes) {
            map.set(h, now + ttlMs);
        }

        const updated: ExhaustedRecord[] = Array.from(map.entries()).map(([hash, expiresAt]) => ({
            hash,
            expiresAt
        }));
        localStorage.setItem(EXHAUSTED_CACHE_KEY, JSON.stringify(updated));
    } catch {}
};

export const generateContent = async (
  prompt: string, 
  jsonSchema?: any,
  isLongOutput: boolean = false,
  taskType: TaskType = 'general',
  context?: GenerationContext,
  onProgress?: (progress: GenerationProgress) => void
) => {
    // 1. Carrega de antemão as chaves que bateram limite recentemente (em cooldown)
    const cachedExhausted = getCachedExhaustedHashes();
    const attemptedHashes = new Set<string>(cachedExhausted);
    const allRotationLogs: any[] = [];
    
    // Com failover inteligente no servidor (5 chaves por ciclo), 10 ciclos cobrem com folga até 50 tentativas
    const maxClientCycles = 10;
    let lastErrorMessage = "Falha na comunicação com o Professor Virtual.";

    onProgress?.({
        percent: 6,
        message: "Sorteando chave ativa no pool inteligente de IA...",
        stage: 'connecting',
        totalKeys: 43
    });

    for (let cycle = 1; cycle <= maxClientCycles; cycle++) {
        let progressTimer: any = null;
        try {
            const attemptedCount = allRotationLogs.length;
            const startPct = Math.min(8 + Math.floor((attemptedCount / 43) * 72), 32);
            
            const subjectLabel = context?.themeTitle 
                ? `tema "${context.themeTitle}"` 
                : (context?.book ? `${context.book} ${context.chapter || ''}`.trim() : 'Passagem');

            const stageMessages = [
                `Conectando ao modelo neural e acervo teológico...`,
                `Analisando textos e fundamentação teológica de ${subjectLabel}...`,
                `Executando exegese profunda e aplicando diretrizes do professor...`,
                `Destrinchando os tópicos e formulando o efeito "Ah! Entendi!"...`,
                `Injetando Pérolas de Ouro e Fontes Primárias (Josefo, Talmud, Pais da Igreja)...`,
                `Inserindo Glossários Interativos e Tipologia Cristocêntrica...`,
                `Validando Arqueologia, Hermenêutica, Teologia e Metrado de Páginas...`
            ];

            let msgIdx = 0;
            let currentPct = startPct;

            onProgress?.({
                percent: currentPct,
                message: cycle > 1 
                    ? `Balanceando carga para novo lote de IA... Analisando ${subjectLabel}` 
                    : stageMessages[0],
                stage: 'querying',
                cycle,
                attempt: cycle,
                totalKeys: 43
            });

            // Ticker dinâmico que atualiza a cada 3.5s enquanto o modelo reflete
            progressTimer = setInterval(() => {
                msgIdx = (msgIdx + 1) % stageMessages.length;
                currentPct = Math.min(currentPct + 8, 85);
                onProgress?.({
                    percent: currentPct,
                    message: stageMessages[msgIdx],
                    stage: 'processing',
                    cycle,
                    attempt: cycle,
                    totalKeys: 43
                });
            }, 3500);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 295000); // 295s
            
            // Enviamos batchSize: 5 para o servidor testar em lote internamente com failover instantâneo
            const response = await fetch('/api/gemini', {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt,
                    schema: jsonSchema,
                    taskType,
                    book: context?.book,
                    chapter: context?.chapter,
                    verse: context?.verse,
                    themeTitle: context?.themeTitle,
                    moduleTitle: context?.moduleTitle,
                    customInstructions: context?.customInstructions,
                    existingContent: context?.existingContent,
                    depthLevel: context?.depthLevel,
                    targetPages: context?.targetPages,
                    thinkingLevel: context?.thinkingLevel,
                    relevanceWeight: context?.relevanceWeight,
                    excludedKeyHashes: Array.from(attemptedHashes),
                    batchSize: 5
                })
            });
            clearTimeout(timeoutId);
            if (progressTimer) clearInterval(progressTimer);

            const contentType = response.headers.get("content-type");
            let data: any = null;
            if (contentType && contentType.includes("application/json")) {
                data = await response.json();
            }

            if (data?.rotationLog && Array.isArray(data.rotationLog)) {
                allRotationLogs.push(...data.rotationLog);
            }

            if (data?.failedKeyHashes && Array.isArray(data.failedKeyHashes)) {
                data.failedKeyHashes.forEach((h: string) => attemptedHashes.add(h));
                saveExhaustedHashesToCache(data.failedKeyHashes, 75000); // Salva na quarentena por 75s
            }

            if (response.ok && data?.text) {
                onProgress?.({
                    percent: 88,
                    message: "Resposta recebida! Estruturando exegese e validando manuscrito...",
                    stage: 'processing',
                    cycle,
                    attempt: allRotationLogs.length,
                    totalKeys: 43
                });

                // Sucesso! Log consolidado de todas as rodadas
                console.groupCollapsed(`🔄 ⚡ [Gemini Pool 43 Chaves - SUCESSO NA RODADA #${cycle}]`);
                allRotationLogs.forEach((logEntry: any, index: number) => {
                    const isSuccess = logEntry.status?.includes('SUCESSO');
                    const style = isSuccess 
                        ? "color: #33ff33; font-weight: bold; background: #002200; padding: 2px 4px; border-radius: 4px;"
                        : "color: #ffaa00; font-style: italic; background: #221100; padding: 2px 4px; border-radius: 4px;";
                    console.log(
                        `%c[Tentativa #${index + 1}] Chave: ${logEntry.key || logEntry.name} -> Status: ${logEntry.status}`,
                        style
                    );
                });
                console.groupEnd();

                const text = data.text;
                if (jsonSchema) {
                    try {
                        const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
                        const parsed = JSON.parse(cleanJson);
                        onProgress?.({
                            percent: 100,
                            message: "Conteúdo estruturado com sucesso!",
                            stage: 'completed'
                        });
                        return parsed;
                    } catch (e) {
                        console.error("Erro ao processar JSON da IA:", text);
                        throw new Error("Erro de formatação na resposta da IA.");
                    }
                }

                onProgress?.({
                    percent: 100,
                    message: "Manuscrito concluído com sucesso!",
                    stage: 'completed'
                });
                return text;
            }

            // Se a resposta não foi OK, registra o erro e verifica se devemos tentar o próximo lote de chaves
            lastErrorMessage = data?.error || `Erro HTTP ${response.status}`;
            console.warn(`[Gemini Router] Ciclo #${cycle} concluído sem sucesso (${data?.rotationLog?.length || 0} chaves tentadas). Buscando próximo lote do pool...`);

            if (data?.canClientRetry === false || (data?.remainingKeysCount === 0 && cycle > 2)) {
                // Se o servidor avisar que não há mais chaves disponíveis no pool, encerra
                break;
            }

            // Pequeno intervalo antes do próximo ciclo para evitar rajada
            await new Promise(resolve => setTimeout(resolve, 250));

        } catch (error: any) {
            if (progressTimer) clearInterval(progressTimer);
            console.warn(`[Gemini Router] Exceção no ciclo #${cycle}:`, error.message);
            lastErrorMessage = error.message || lastErrorMessage;
            if (error.name === 'AbortError') {
                lastErrorMessage = "Tempo de resposta excedido para este lote de chaves.";
            }
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    }

    // Se saiu do loop sem sucesso, exibe o log completo de todas as chaves testadas
    if (allRotationLogs.length > 0) {
        console.groupCollapsed(`🔄 ❌ [Gemini API Key Router - FALHA EM ${allRotationLogs.length} CHAVES TESTADAS]`);
        allRotationLogs.forEach((logEntry: any, index: number) => {
            console.log(
                `%c[Tentativa #${index + 1}] Chave: ${logEntry.key || logEntry.name} -> Status: ${logEntry.status}`,
                "color: #ff3333; font-weight: bold; background: #220000; padding: 2px 4px; border-radius: 4px;"
            );
        });
        console.groupEnd();
    }

    throw new Error(`Falha após testar ${allRotationLogs.length} chaves no pool: ${lastErrorMessage}`);
};

export const getStoredApiKey = (): string | null => "internal_proxy";
export const setStoredApiKey = (key: string) => {}; 
export const clearStoredApiKey = () => {};

/**
 * Busca de Fontes Primárias com tolerância a falhas, rotação de chaves e retry dinâmico.
 */
export const fetchPrimarySourceText = async (
    source: string,
    reference: string,
    hiddenCommand?: string
): Promise<string> => {
    const promptText = hiddenCommand 
        ? `Referência: ${source}, ${reference}. Instrução específica: ${hiddenCommand}` 
        : `${source}, ${reference}`;

    const cachedExhausted = getCachedExhaustedHashes();
    const attemptedHashes = new Set<string>(cachedExhausted);
    let lastError = "Falha ao consultar fonte primária no momento.";
    const maxCycles = 3; // Até 3 ciclos com rotação automática de chaves

    for (let cycle = 1; cycle <= maxCycles; cycle++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 35000); // 35s para absorver latência de rede com folga

            const response = await fetch('/api/gemini', {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    taskType: 'fetch_primary_source',
                    prompt: promptText,
                    excludedKeyHashes: Array.from(attemptedHashes),
                    batchSize: 4
                })
            });
            clearTimeout(timeoutId);

            const contentType = response.headers.get("content-type");
            let data: any = null;
            if (contentType && contentType.includes("application/json")) {
                data = await response.json();
            }

            if (data?.failedKeyHashes && Array.isArray(data.failedKeyHashes)) {
                data.failedKeyHashes.forEach((h: string) => attemptedHashes.add(h));
                saveExhaustedHashesToCache(data.failedKeyHashes, 75000);
            }

            if (response.ok && data?.text) {
                return data.text;
            }

            lastError = data?.error || `Erro HTTP ${response.status}`;
            if (data?.canClientRetry === false) {
                break;
            }

            // Pausa breve antes do próximo ciclo
            await new Promise(r => setTimeout(r, 200));
        } catch (e: any) {
            console.warn(`[PrimarySource] Falha na tentativa #${cycle}:`, e?.message);
            lastError = e?.message || 'Falha de conexão';
            await new Promise(r => setTimeout(r, 200));
        }
    }

    throw new Error(lastError);
};

