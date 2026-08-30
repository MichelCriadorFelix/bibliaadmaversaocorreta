
/**
 * SERVIÇO GEMINI AI - ADMA EDITION
 * Adaptado para comunicação segura via proxy local.
 */

// Tipos de tarefas para seleção inteligente de modelo no servidor
export type TaskType = 'commentary' | 'dictionary' | 'devotional' | 'ebd' | 'metadata' | 'general' | 'teacher_ebd' | 'quiz_gen' | 'thematic_ebd' | 'assistente_chat' | 'upgrade_ebd' | 'upgrade_teacher_ebd' | 'upgrade_thematic_ebd' | 'get_bible_verses';

export interface GenerationProgress {
  percent: number;
  message: string;
  cycle?: number;
  attempt?: number;
  totalKeys?: number;
  stage?: 'connecting' | 'querying' | 'processing' | 'saving' | 'completed' | 'error';
}

export const generateContent = async (
  prompt: string, 
  jsonSchema?: any,
  isLongOutput: boolean = false,
  taskType: TaskType = 'general',
  context?: { book?: string; chapter?: number; depthLevel?: string; targetPages?: string; thinkingLevel?: string },
  onProgress?: (progress: GenerationProgress) => void
) => {
    const attemptedHashes = new Set<string>();
    const allRotationLogs: any[] = [];
    const maxClientCycles = 43; // Rotação individual precisa: 1 a 1 passando pelas 43 chaves
    let lastErrorMessage = "Falha na comunicação com o Professor Virtual.";

    onProgress?.({
        percent: 5,
        message: "Conectando ao pool de 43 Chaves ADMA...",
        stage: 'connecting',
        totalKeys: 43
    });

    for (let cycle = 1; cycle <= maxClientCycles; cycle++) {
        let progressTimer: any = null;
        try {
            const attemptedCount = allRotationLogs.length;
            const startPct = Math.min(8 + Math.floor((attemptedCount / 43) * 72), 30);
            
            const stageMessages = [
                `Conectando ao pool e acervo teológico (Chave #${cycle})...`,
                `Analisando textos originais (Hebraico / Grego) de ${context?.book || 'Passagem'} ${context?.chapter || ''}...`,
                `Executando exegese profunda e aplicando instruções do professor...`,
                `Destrinchando versículos e formulando o efeito "Ah! Entendi!"...`,
                `Injetando Pérolas de Ouro e Fontes Primárias (Josefo, Talmud, etc.)...`,
                `Inserindo Glossários Interativos e Tipologia Cristocêntrica...`,
                `Validando Curiosidades, Arqueologia e Metrado de Páginas...`
            ];

            let msgIdx = 0;
            let currentPct = startPct;

            onProgress?.({
                percent: currentPct,
                message: cycle > 1 
                    ? `Alternando Chave (${cycle}/43)... Analisando ${context?.book || 'Livro'} ${context?.chapter || ''}` 
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
            const timeoutId = setTimeout(() => controller.abort(), 250000); // 250s dedicados (Para acompanhar o timeout expandido do backend de 180s+)
            
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
                    depthLevel: context?.depthLevel,
                    targetPages: context?.targetPages,
                    thinkingLevel: context?.thinkingLevel,
                    excludedKeyHashes: Array.from(attemptedHashes),
                    batchSize: 1
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

            if (data?.canClientRetry === false || (data?.remainingKeysCount === 0 && cycle > 3)) {
                // Se o servidor avisar que não há mais chaves disponíveis no pool, encerra
                break;
            }

            // Pequeno intervalo antes do próximo ciclo para evitar rajada
            await new Promise(resolve => setTimeout(resolve, 400));

        } catch (error: any) {
            if (progressTimer) clearInterval(progressTimer);
            console.warn(`[Gemini Router] Exceção no ciclo #${cycle}:`, error.message);
            lastErrorMessage = error.message || lastErrorMessage;
            if (error.name === 'AbortError') {
                lastErrorMessage = "Tempo de resposta excedido para este lote de chaves.";
            }
            await new Promise(resolve => setTimeout(resolve, 500));
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
