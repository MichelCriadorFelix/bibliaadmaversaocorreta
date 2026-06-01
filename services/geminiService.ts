
/**
 * SERVIÇO GEMINI AI - ADMA EDITION
 * Adaptado para comunicação segura via proxy local.
 */

// Tipos de tarefas para seleção inteligente de modelo no servidor
export type TaskType = 'commentary' | 'dictionary' | 'devotional' | 'ebd' | 'metadata' | 'general' | 'teacher_ebd' | 'quiz_gen' | 'thematic_ebd' | 'assistente_chat' | 'upgrade_ebd' | 'upgrade_teacher_ebd' | 'upgrade_thematic_ebd';

export const generateContent = async (
  prompt: string, 
  jsonSchema?: any,
  isLongOutput: boolean = false,
  taskType: TaskType = 'general',
  context?: { book?: string; chapter?: number; depthLevel?: string; targetPages?: string; thinkingLevel?: string } // Novo parâmetro opcional
) => {
    try {
        // Envia a requisição para o endpoint local da Vercel
        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt,
                schema: jsonSchema,
                taskType,
                book: context?.book,      // Envia o livro
                chapter: context?.chapter, // Envia o capítulo
                depthLevel: context?.depthLevel, // Envia o nível de profundidade
                targetPages: context?.targetPages, // Envia o número de páginas
                thinkingLevel: context?.thinkingLevel // Envia o nível de pensamento do Gemini 3.5
            })
        });

        if (!response.ok) {
            const contentType = response.headers.get("content-type");
            let errorMessage = "Erro na comunicação com o servidor de IA. Status: " + response.status;
            let rotationLog: any[] | null = null;
            if (contentType && contentType.includes("application/json")) {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;
                rotationLog = errorData.rotationLog;
            } else {
                const textError = await response.text();
                // We substring to avoid dumping massive HTML in the console
                console.error("Non-JSON error response from proxy:", textError.substring(0, 500));
            }

            if (rotationLog && Array.isArray(rotationLog)) {
                console.groupCollapsed("🔄 ❌ [Gemini API Key Router - FALHA EM TODAS AS CHAVES]");
                rotationLog.forEach((logEntry: any, index: number) => {
                    console.log(
                        `%c[Tentativa #${index + 1}] Chave Mapeada: ${logEntry.key} -> Status: ${logEntry.status}`,
                        "color: #ff3333; font-weight: bold; background: #220000; padding: 2px 4px; border-radius: 4px;"
                    );
                });
                console.groupEnd();
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();

        // Exibe o trace elegante no console F12
        if (data.rotationLog && Array.isArray(data.rotationLog)) {
            console.groupCollapsed("🔄 ⚡ [Gemini API Key Router - ROTAÇÃO INTELIGENTE ATIVA]");
            data.rotationLog.forEach((logEntry: any, index: number) => {
                const isSuccess = logEntry.status === 'SUCESSO';
                const style = isSuccess 
                    ? "color: #33ff33; font-weight: bold; background: #002200; padding: 2px 4px; border-radius: 4px;"
                    : "color: #ffaa00; font-style: italic; background: #221100; padding: 2px 4px; border-radius: 4px;";
                console.log(
                    `%c[Tentativa #${index + 1}] Chave Mapeada: ${logEntry.key} -> Status: ${logEntry.status}`,
                    style
                );
            });
            console.groupEnd();
        }

        const text = data.text;

        if (!text) throw new Error("A IA retornou uma resposta vazia.");

        if (jsonSchema) {
            try {
                const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
                return JSON.parse(cleanJson);
            } catch (e) {
                console.error("Erro ao processar JSON da IA:", text);
                throw new Error("Erro de formatação na resposta da IA.");
            }
        }

        return text;

    } catch (error: any) {
        console.error("Gemini Proxy Error:", error);
        throw new Error(error.message || "Falha na comunicação com o Professor Virtual.");
    }
};

export const getStoredApiKey = (): string | null => "internal_proxy";
export const setStoredApiKey = (key: string) => {}; 
export const clearStoredApiKey = () => {};
