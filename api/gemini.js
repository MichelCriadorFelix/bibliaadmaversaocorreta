import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

/**
 * CONFIGURAÇÃO PARA VERCEL SERVERLESS FUNCTIONS - LOAD BALANCER & TIMEOUT RESILIENT
 * Motor calibrado para Gemini 3.7 Flash com Thinking Budget e compartilhamento de estado via Supabase.
 */
export const config = {
  maxDuration: 300, 
};

/**
 * Extrai a hierarquia de tópicos (#, ##, ###) de uma aula existente para preservar a ementa
 */
function extractLessonHeadings(text) {
  if (!text || typeof text !== 'string') return [];
  const headings = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#{1,4}\s+/.test(trimmed)) {
      headings.push(trimmed);
    }
  }
  // Fallback para tags HTML caso o manuscrito use <h2> / <h3>
  if (headings.length === 0) {
    const regex = /<h([1-4])[^>]*>(.*?)<\/h\1>/gi;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const level = Number(match[1]);
      const prefix = '#'.repeat(level);
      const content = match[2].replace(/<[^>]*>/g, '').trim();
      if (content) {
        headings.push(`${prefix} ${content}`);
      }
    }
  }
  return headings;
}

export default async function handler(request, response) {
  // --- CONFIGURAÇÃO DE CORS ---
  response.setHeader('Access-Control-Allow-Credentials', true);
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    // --- GESTÃO DE POOL DE CHAVES (LOAD BALANCER RESILIENTE) ---
    const rawKeys = [];
    
    // Captura explícita de variáveis padrão
    const standardKeys = [process.env.GEMINI_API_KEY, process.env.VITE_GEMINI_API_KEY, process.env.API_KEY, process.env.Biblia_ADMA_API];
    for (const k of standardKeys) {
        if (k && typeof k === 'string' && k.trim().length > 15) {
            rawKeys.push(k.trim());
        }
    }

    // Captura automática de TODAS as variáveis de ambiente que sejam chaves do Google Gemini (iniciam com AIza)
    for (const [keyName, val] of Object.entries(process.env)) {
        if (typeof val === 'string' && val.trim().startsWith('AIza') && val.trim().length > 30) {
            rawKeys.push(val.trim());
        }
    }
    
    // Fallback: Captura padrões numerados (ex: API_KEY_1, API_KEY_2...)
    for (let i = 1; i <= 100; i++) {
        const val = process.env[`API_KEY_${i}`];
        if (val && typeof val === 'string' && val.trim().length > 20 && !val.startsWith('vck_')) {
            rawKeys.push(val.trim());
        }
    }

    // 1. DEDUPLICAÇÃO DE CHAVES
    const uniqueKeys = Array.from(new Set(rawKeys.map(k => k.trim()))).filter(k => k.length > 10);

    if (uniqueKeys.length === 0) {
         return response.status(500).json({ 
             error: 'CONFIGURAÇÃO PENDENTE: Nenhuma Chave de API válida encontrada no ambiente.' 
         });
    }

    // 2. INSTANCIAÇÃO LAZY DO CLIENT SUPABASE (DENTRO DO HANDLER)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                        process.env.SUPABASE_SECRET_KEY ||
                        process.env.SUPABASE_ANON_KEY;
    const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

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

    let body = request.body;
    if (typeof body === 'string') {
        try {
            body = JSON.parse(body);
        } catch (e) {
            return response.status(400).json({ error: 'Corpo JSON inválido.' });
        }
    }

    const { 
        prompt, 
        schema, 
        taskType, 
        book, 
        chapter, 
        themeTitle,
        moduleTitle,
        customInstructions,
        existingContent,
        depthLevel, 
        targetPages, 
        thinkingLevel,
        excludedKeyHashes = [],
        batchSize = 3 
    } = body || {};

    if (!prompt) return response.status(400).json({ error: 'O Prompt é obrigatório.' });

    // 3. CONSULTA DE ESTADO REMOTO NO SUPABASE (TABELA gemini_key_state)
    const keyHashes = uniqueKeys.map(k => hashKey(k));
    const remoteKeyStates = new Map();

    if (supabase) {
      try {
        const queryPromise = supabase
          .from('gemini_key_state')
          .select('key_hash, exhausted_until, daily_exhausted_date, last_used_at')
          .in('key_hash', keyHashes);
        
        const { data, error } = await withTimeout(queryPromise, 2500, 'SUPABASE_READ_TIMEOUT');
        if (!error && Array.isArray(data)) {
          for (const row of data) {
            if (row?.key_hash) remoteKeyStates.set(row.key_hash, row);
          }
        }
      } catch (e) {
        // Fallback silencioso para memória local
      }
    }

    // 4. VERIFICAÇÃO DE MEMÓRIA LOCAL E LIMPEZA DE EXPIRADAS
    if (!global.exhaustedKeys) {
        global.exhaustedKeys = new Map();
    }

    const now = Date.now();
    for (const [key, expireTime] of global.exhaustedKeys.entries()) {
        if (now > expireTime) {
            global.exhaustedKeys.delete(key);
        }
    }

    const todayStr = getTodayStr();
    const excludedSet = new Set(Array.isArray(excludedKeyHashes) ? excludedKeyHashes : []);

    const isKeyExhausted = (k) => {
      const h = hashKey(k);
      if (excludedSet.has(h)) return true;

      // 1. Memória local
      if (global.exhaustedKeys.has(k)) {
        const expireTime = global.exhaustedKeys.get(k);
        if (now < expireTime) return true;
      }
      // 2. Supabase remoto
      if (remoteKeyStates.has(h)) {
        const row = remoteKeyStates.get(h);
        if (row.daily_exhausted_date === todayStr) return true;
        if (row.exhausted_until && new Date(row.exhausted_until).getTime() > now) return true;
      }
      return false;
    };

    // Filtra chaves ativas não esgotadas e não excluídas na sessão
    let candidateKeys = uniqueKeys.filter(key => !isKeyExhausted(key));

    // Se todas as chaves foram excluídas ou esgotadas, remove a exclusão temporária para permitir tentar chaves restantes
    if (candidateKeys.length === 0) {
        candidateKeys = uniqueKeys.filter(key => {
            const h = hashKey(key);
            const row = remoteKeyStates.get(h);
            if (row?.daily_exhausted_date === todayStr) return false;
            return true;
        });
        if (candidateKeys.length === 0) {
            candidateKeys = [...uniqueKeys];
        }
    }

    // 5. SELEÇÃO ALEATÓRIA BALANCEADA (Fisher-Yates Shuffle para garantir uso de todas as 43 chaves sem repetição estrita)
    const shuffledKeys = [...candidateKeys];
    for (let i = shuffledKeys.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledKeys[i], shuffledKeys[j]] = [shuffledKeys[j], shuffledKeys[i]];
    }

    // Limita a 1 chave por invocação (chamada estritamente individual 1 a 1 x/43)
    const keysToTryInThisInvocation = shuffledKeys.slice(0, Math.max(1, Math.min(Number(batchSize) || 1, 1)));

            let systemInstruction = "Você é o Professor Michel Felix, teólogo Pentecostal Clássico e Erudito.";
            let enhancedPrompt = prompt;

            // --- LÓGICA DE BUSCA RÁPIDA ---
            if (taskType === 'assistente_chat') {
                systemInstruction = "Você é um buscador bíblico ultrarrápido. Retorne apenas os dados solicitados em JSON, sem explicações longas.";
            }
            // --- SUGESTÃO DE PONTOS DE ATENÇÃO POR CAPÍTULO (pré-preenche "Instruções Customizadas") ---
            else if (taskType === 'chapter_focus_suggestion') {
                systemInstruction = `Você é o Professor Michel Felix, teólogo Pentecostal Clássico e Erudito, operando sob a mesma lente doutrinária do motor principal (Arminiano, Pré-tribulacionista/Pré-milenista, Ortodoxo/Trinitariano, Pentecostal Continuísta, Apologeta Anti-heresias, Hermenêutica de Alta Precisão).

                Aqui sua única tarefa é SUGERIR, em tópicos curtos, pontos de atenção para OUTRO PROFESSOR que vai preparar a aula — você NÃO está escrevendo a aula em si, nem uma explicação teológica completa, só um mapa rápido do que vale a pena focar.

                ATENÇÃO — LINGUAGEM: essas notas costumam ser coladas quase palavra por palavra dentro da aula final (que é para uma turma leiga de EBD, não um seminário). Por isso, escreva CADA item já em português simples e direto, do jeito que se explica pra alguém que nunca estudou teologia — NUNCA em jargão acadêmico cru. Se precisar mencionar um conceito técnico (ex: culpa objetiva, hamartologia, intenção subjetiva) ou um termo em hebraico/grego, traduza-o na mesma frase em palavras do dia a dia (ex: em vez de "a culpa objetiva não é anulada pela intenção subjetiva do indivíduo", escreva "o erro continua sendo pecado mesmo que a pessoa não tivesse a intenção de pecar"). Evite palavras como "fulcral", "per se", "intrínseco" quando existe uma palavra comum que diz o mesmo.`;
                enhancedPrompt = `Para uma aula sobre ${book || ''} ${chapter || ''}, liste de 4 a 6 itens curtos (uma linha cada, sem numeração, começando com "- ") apontando o que merece atenção especial NESTE capítulo específico, já escritos em linguagem simples de EBD (veja a regra de linguagem acima). Escolha, entre os que realmente se aplicarem a este capítulo (não force todos, alguns capítulos não têm heresia associada, por exemplo):

1. TEMA DOUTRINÁRIO RELEVANTE: se o capítulo toca algum tema que está na lente doutrinária do sistema (ex: como a salvação funciona, o fim dos tempos, os dons espirituais, quem é Jesus), aponte que vale reforçar esse ponto na aula — sem escrever a explicação inteira, só sinalizar, em palavras simples.
2. INTERPRETAÇÃO ERRADA COMUM: se alguma passagem deste capítulo costuma ser mal interpretada ou usada por algum grupo pra defender algo fora do que a Bíblia realmente ensina, diga EM POUCAS PALAVRAS SIMPLES qual é esse erro e qual é a interpretação correta — pra o professor já saber que precisa esclarecer isso, sem citar nomes de heresias ou correntes teológicas como rótulo.
3. CURIOSIDADE HISTÓRICA: algo pouco óbvio sobre o contexto, costume, geografia ou achado arqueológico ligado ao capítulo, explicado de forma simples.
4. O PORQUÊ DE UM TERMO OU RITUAL: algum ritual, costume ou palavra original (hebraico/grego) mencionado cujo significado profundo vale a pena explicar — traduza o termo original e explique o "porquê por trás" em linguagem do dia a dia, não só cite.
5. ALGO QUE SOA ESTRANHO HOJE: um costume, lei ou detalhe do texto que parece estranho, chocante ou sem sentido pra um leitor moderno, e que se beneficia de uma explicação simples.
6. CONEXÃO QUE ESCLARECE: uma referência cruzada com outro texto bíblico, com a tradição judaica, com um historiador antigo, ou uma fonte primária que ajuda a entender melhor este capítulo, resumida em linguagem acessível.
7. EXEMPLO OU RELATO BÍBLICO PRÁTICO (RIGOR HERMENÊUTICO E CONTEXTUAL — SEM FORÇAR): Se o capítulo traz um mandamento, doutrina, lei ou princípio (ex: pecados por ignorância de líderes/congregação, votos, sacerdócio, julgamentos), aponte onde esse princípio foi vivido, quebrado ou cumprido na prática em uma história das Escrituras (ex: o erro de Davi ao transportar a Arca em 1 Cr 13/15, o juramento precipitado de Saul em 1 Sm 14, a purificação de Josias em 2 Rs 22). ATENÇÃO CRÍTICA: A correspondência bíblica deve ser REAL, LEGÍTIMA e no CONTEXTO EXATO da passagem. É TERMINANTEMENTE PROIBIDO inventar, alucinar, espiritualizar forçadamente ou encaixar uma história fora de contexto só para ter um exemplo. Se não houver uma narrativa bíblica que ilustre com exatidão aquele ponto específico, NÃO invente nem force uma conexão artificial — a fidelidade ao texto bíblico prevalece sempre sobre o desejo de exemplificar.

Seja direto e específico deste capítulo — nada genérico que serviria para qualquer capítulo. Sem introduções, sem saudações, sem numerar as categorias acima no texto final (elas são só um guia interno seu), vá direto para a lista de itens.`;
            }
            // --- SUGESTÃO DE PONTOS DE ATENÇÃO PARA AULAS TEMÁTICAS E TEOLOGIA SISTEMÁTICA ---
            else if (taskType === 'thematic_focus_suggestion') {
                const lessonTheme = themeTitle || book || prompt;
                const hasExisting = Boolean(existingContent && existingContent.trim().length > 100);
                const existingHeadings = hasExisting ? extractLessonHeadings(existingContent) : [];
                const hasHeadings = existingHeadings.length > 0;

                systemInstruction = `Você é o Professor Michel Felix, PhD em Teologia Sistemática e História Eclesiástica, operando sob a cosmovisão bíblica ortodoxa e as 7 Balizas Doutrinárias (Arminiana Clássica, Pré-milenista/Pré-tribulacionista, Ortodoxia Trinitariana, Pentecostal Continuísta, Hermenêutica Gramático-Histórica de Alta Precisão, Apologética Anti-heresias e Didática Acessível com efeito "Ah! Entendi!").

Sua tarefa é fornecer um MAPA ESTRATÉGICO DE PONTOS DE ATENÇÃO para a preparação ou aprimoramento da AULA TEMÁTICA / CURSO DE TEOLOGIA SISTEMÁTICA: "${lessonTheme}"${moduleTitle ? ` (Matéria: "${moduleTitle}")` : ''}.
Você NÃO está gerando a apostila completa agora, mas sim as diretrizes e a ementa de tópicos que orientarão o professor e a IA na redação/atualização da aula.

DIRETRIZ DE LINGUAGEM: Escreva os itens de forma clara, didática e direta de EBD/Teologia (traduza termos difíceis no próprio texto, sem jargões soltos sem explicação).`;

                if (hasExisting && hasHeadings) {
                    const headingsList = existingHeadings.join('\n');
                    enhancedPrompt = `A AULA SOBRE O TEMA "${lessonTheme}"${moduleTitle ? ` (Matéria: "${moduleTitle}")` : ''} JÁ POSSUI TEXTO REDIGIDO E EMENTA DEFINIDA.
Veja abaixo a lista completa e exata de tópicos e subtópicos que já fazem parte do manuscrito da aula:
"""
${headingsList}
"""

--- MANDATO DE PRESERVAÇÃO CURRICULAR (MUITO IMPORTANTE) ---
Em Teologia Sistemática, quando uma aula já possui texto com seus tópicos e subtópicos, a estrutura é a base curricular da matéria e NÃO PODE ser alterada, reduzida ou substituída por outros tópicos arbitrários.

Forneça sua resposta ESTRITAMENTE estruturada nas duas seções abaixo:

📌 ESTRUTURA DE TÓPICOS DA AULA (PRESERVAÇÃO OBRIGATÓRIA DA EMENTA):
Traga a lista completa de todos os tópicos (##) e subtópicos (###) que já fazem parte desta aula (conforme listados acima), mantendo a numeração e títulos originais, para que o professor veja claramente que toda a ementa está preservada e será respeitada.

🎯 PONTOS DE ATENÇÃO E DIRETRIZES DE APRIMORAMENTO (4 a 6 itens começando com "- "):
Aponte de 4 a 6 diretrizes estratégicas e cirúrgicas para enriquecer, atualizar e aprofundar essa aula DENTRO dessa grade existente de tópicos:
- ÊNFASE EXEGÉTICA E CONTEXTUAL: passagens e fundamentos bíblicos chave dentro dos tópicos da aula que merecem ênfase especial.
- FONTES PRIMÁRIAS E HISTÓRICAS RECOMENDADAS: historiadores antigos (Josefo, Pais da Igreja) ou documentos históricos pertinentes a esses tópicos.
- TERMOS ORIGINAIS E GLOSSÁRIO INTERATIVO: palavras em grego ou hebraico centrais nesta matéria para explicar no formato [[Palavra|Explicação didática]].
- PREVENÇÃO DE ERROS OU HERESIAS HISTÓRICAS: equívocos teológicos clássicos a refutar com clareza bíblica.
- APLICAÇÃO PRÁTICA PASTORAL: aplicação direta e transformadora dos ensinos desses tópicos para o dia a dia do aluno.

Seja direto, específico deste tema "${lessonTheme}". Sem saudações ou preâmbulos vazios.`;
                } else if (hasExisting && !hasHeadings) {
                    enhancedPrompt = `A AULA SOBRE O TEMA "${lessonTheme}"${moduleTitle ? ` (Matéria: "${moduleTitle}")` : ''} JÁ POSSUI TEXTO DE BASE.
Trecho inicial do texto existente da aula:
"""
${existingContent.substring(0, 4000)}
"""

--- MANDATO DE CONTINUIDADE ---
A aula já possui conteúdo iniciado. Não desvie do assunto nem descarte o texto inicial.

Forneça sua resposta estruturada nas duas seções abaixo:

📌 TÓPICOS CENTRAIS IDENTIFICADOS NO TEXTO (MANTER):
(Identifique e liste os pontos principais já abordados no texto para garantir a continuidade curricular).

🎯 PONTOS DE ATENÇÃO E DIRETRIZES DE APRIMORAMENTO (4 a 6 itens começando com "- "):
(Sugestões de complementação com fontes primárias, rigor bíblico contextual, termos originais com glossário e aplicação prática para enriquecer o texto existente).

Seja direto e específico do tema "${lessonTheme}". Sem saudações.`;
                } else {
                    // AULA NOVA (SEM TEXTO PRONTO)
                    enhancedPrompt = `ESTA É UMA NOVA AULA QUE AINDA NÃO POSSUI TEXTO: "${lessonTheme}"${moduleTitle ? ` (Matéria: "${moduleTitle}")` : ''}.
Como não há texto pré-existente, o professor precisa da PROPOSTA DE EMENTA COMPLETA estruturada sistematicamente para redigir ou gerar esta aula de Teologia Sistemática/EBD Temática.

Forneça sua resposta ESTRITAMENTE estruturada nas duas seções abaixo:

📌 PROPOSTA DE EMENTA CURRICULAR (TÓPICOS ## E SUBTÓPICOS ### RECOMENDADOS):
Proponha a divisão curricular completa e sistemática recomendada para esta aula, contendo:
- TÍTULO DA AULA (Use # TÍTULO)
- De 4 a 7 tópicos principais com '##' numerados e seus respectivos subtópicos com '###' cobrindo o tema doutrinário com profundidade teológica
- Tópico de Ilustração Didática
- Tópico de Aplicações Práticas para a Vida Cristã
- Conclusão

🎯 DIRETRIZES DOUTRINÁRIAS E PONTOS DE ATENÇÃO (4 a 6 itens começando com "- "):
- EIXO DOUTRINÁRIO CENTRAL: o fundamento teológico primordial e as passagens bíblicas chave desta aula.
- FONTES PRIMÁRIAS E HISTÓRICAS RECOMENDADAS: quais fontes da antiguidade (Josefo, concílios, Pais da Igreja) enriquecem este tema.
- TERMOS ORIGINAIS E CONCEITOS CHAVE: termos em hebraico/grego ou doutrinas que devem ser explicados de forma simples com glossário didático.
- INTERPRETAÇÕES ERRADAS OU HERESIAS: desvios teológicos ou históricos a serem prevenidos e refutados com rigor bíblico.
- APLICAÇÃO PRÁTICA: como a verdade desta doutrina transforma a conduta e a fé do aluno no dia a dia.

Seja direto, profundo e específico para o tema "${lessonTheme}". Sem saudações ou preâmbulos vazios.`;
                }
            }
            // --- GERADOR DE VERSÍCULOS BÍBLICOS DETALHADO ---
            else if (taskType === 'get_bible_verses') {
                systemInstruction = "Você é um servo e gerador extremamente fiel dos textos da Bíblia Sagrada na tradução ACF (Almeida Corrigida Fiel). Forneça todos os versículos do capítulo solicitado no livro especificado sob formato de array JSON contendo número do versículo e texto de cada versículo. Seja extremamente fiel à ortografia e redação da ACF em português brasileiro, mantendo exatamente o número correto de versículos do capítulo e os textos originais, sem cortes ou paráfrase.";
            }
            // --- LÓGICA DE BUSCA DE FONTES PRIMÁRIAS ---
            else if (taskType === 'fetch_primary_source') {
                systemInstruction = `
                    ATUE COMO: Um Bibliotecário de Fontes Primárias e Tradutor Erudito.
                    
                    SEU OBJETIVO: Fornecer o texto original (ou tradução fiel) de uma citação histórica ou da tradição judaica.
                    
                    REGRAS:
                    1. BUSCA FIEL: Encontre o texto exato da referência solicitada (ex: Flávio Josefo, Antiguidades 18.3).
                    2. TRADUÇÃO DIDÁTICA: Se o texto original for em Grego, Latim ou Hebraico, forneça uma tradução para o Português que seja fiel, mas clara e didática (Nível Professor Michel Felix).
                    3. CONTEXTO CURTO: Se a citação for muito curta, inclua o contexto imediato (o parágrafo anterior ou posterior) para que o aluno entenda o sentido.
                    4. FORMATAÇÃO: Use Markdown. Comece com o título da obra e a referência.
                    5. LIMITE: Seja EXTREMAMENTE DIRETO. Máximo de 50 a 100 palavras.
                    6. FORMATO: Forneça APENAS a citação/tradução exata e, se estritamente necessário, 1 linha de contexto. SEM introduções longas ("No prefácio de sua obra...").
                    7. INSTRUÇÃO ESPECÍFICA (CRÍTICO): Se o prompt contiver uma "Instrução específica" (o Comando Oculto), você DEVE focar EXATAMENTE no trecho solicitado por essa instrução, ignorando o restante do capítulo.
                    8. MENÇÕES SEM CITAÇÃO (CRÍTICO): Se a referência for vaga, inexistente, ou parecer apenas a continuação de uma frase (ex: 'descreve este', 'afirma que', 'complementa dizendo', 'no comentário'), NÃO traga uma citação aleatória. Em vez disso, forneça um BREVE RELATO BIOGRÁFICO OU EXPLICATIVO (máximo 50 palavras) sobre quem é a pessoa ou o que é o livro/documento mencionado. Formate como: **[Nome]**: [Breve explicação].
                    9. COMANDOS OCULTOS (CRÍTICO): NUNCA, SOB NENHUMA HIPÓTESE, repita ou inclua o texto da "Instrução específica" (Comando Oculto) na sua resposta. O comando é apenas para guiar sua busca, não para ser exibido ao usuário.
                    
                    PROIBIÇÕES:
                    - NÃO invente textos. Se não encontrar a referência exata, diga que a referência é citada por outros autores mas o texto original é fragmentário ou perdido.
                    - NÃO adicione comentários teológicos, justificativas ou explicações do porquê o autor escreveu aquilo. O foco é APENAS o TEXTO DA FONTE.
                `;
                enhancedPrompt = `[BUSCA DE FONTE PRIMÁRIA]: Forneça o texto da seguinte referência: "${prompt}"`;
            }
            // --- LÓGICA ESPECÍFICA PARA MANUAL DO PROFESSOR ---
            else if (taskType === 'teacher_ebd' || taskType === 'upgrade_teacher_ebd') {
                const isUpgrade = taskType === 'upgrade_teacher_ebd';
                let depthInstruction = "";
                const pages = targetPages ? parseInt(targetPages) : 3;
                const baseWordCount = pages * 600;
                const minWords = Math.round(baseWordCount * 0.85);
                const maxWords = Math.round(baseWordCount * 1.15);
                const wordCountTarget = `${minWords} a ${maxWords}`;
                
                if (depthLevel === 'padrao') {
                    depthInstruction = "Mantenha o foco no essencial, fornecendo orientações práticas e diretas ao ponto.";
                } else if (depthLevel === 'estendido') {
                    depthInstruction = "Gere explicações e planos didáticos bem amparados com contexto histórico, conselhos práticos e recursos de fixação adicionais.";
                } else if (depthLevel === 'profundo') {
                    depthInstruction = "Profundidade teológica extrema integrada no resumo pedagógico. Inclua conexões com idiomas originais (grego/hebraico), termos em latim e exegese rebuscada adaptada para o professor explicar na lousa de forma que o aluno compreenda.";
                }

                let volumeInstruction = "";
                if (isUpgrade) {
                    volumeInstruction = `MANDATO DE VOLUME CIRÚRGICO (ALVO EXATO: ${wordCountTarget} PALAVRAS TOTAL): O usuário solicitou rigorosamente ${pages} páginas (~${baseWordCount} palavras). NÃO ultrapasse ${maxWords} palavras. Se o texto existente for longo, COMPACTE e resuma para se adequar a esta meta.`;
                } else {
                    volumeInstruction = `MANDATO DE VOLUME RIGOROSO (ALVO EXATO: ${wordCountTarget} PALAVRAS TOTAL): Enquadre o resumo e roadmap rigorosamente na meta de ${pages} páginas (~${baseWordCount} palavras), entre ${minWords} e ${maxWords} palavras totais.`;
                }

                // Detecta se há uma aula extensa colada no prompt (como texto da lição do aluno)
                const isPastedLesson = prompt && (prompt.length > 350 || prompt.includes('##') || prompt.toLowerCase().includes('manuscrito') || prompt.toLowerCase().includes('student_content') || prompt.toLowerCase().includes('lição') || prompt.toLowerCase().includes('introdução'));

                if (isPastedLesson) {
                    systemInstruction = `ATUE COMO: Professor Michel Felix (Assistente Didático de Elite). Você está gerando ou atualizando um **GUIA DO MESTRE: RESUMO ESTRATÉGICO E CIRÚRGICO** baseado no texto/manuscrito da aula fornecido no prompt.

                    DIRETRIZES DE OURO CRÍTICAS:
                    1. NÃO crie uma aula paralela do zero, não reescreva a teoria inteira e não copie longamente o texto colado. O professor já tem o texto da aula; ele precisa de um MANUAL PEDAGÓGICO DE PALESTRAÇÃO.
                    2. Gere uma orientação didática polida com foco em: Como prender a atenção do aluno, como estruturar o tempo, explicações simplificadas de termos complexos e aplicações.
                    3. Respeite rigidamente a meta de tamanho solicitada (${pages} páginas, exatamente entre ${wordCountTarget} palavras totais).
                    
                    ESTRUTURA OBRIGATÓRIA DO GUIA DO MESTRE:
                    *   **Título Principal**: GUIA DO MESTRE: RESUMO E ROADMAP DA AULA
                    *   **1. RESUMO CIRÚRGICO & FOCO DE ENSINO (~15%)**:
                        - Parágrafo de síntese da grande verdade ensinada naquela aula específica.
                        - Objetivos de Aprendizado (Saber, Sentir, Praticar).
                    *   **2. ROADMAP PEDAGÓGICO (ROTEIRO COM DIVISÃO DE TEMPOS) (~35%)**:
                        - **Introdução & Quebra-Gelo (Sugerido: 10 mins)**: Pergunta engajadora ou dinâmica contextualizada com a aula.
                        - **Exposição dos Tópicos (Sugerido: 25 mins)**: Divisão estratégica de como abordar os tópicos principais da aula colada, adicionando notas de ênfase para prender o aluno.
                        - **Aplicações Práticas & Conclusão (Sugerido: 10 mins)**: Como encerrar de forma inesquecível.
                    *   **3. DENTRO DA MENTE DO ALUNO: PONTE DIDÁTICA (~20%)**:
                        - Como traduzir termos difíceis, nomes ou teorias teológicas daquela aula colada para ilustrações do cotidiano simples que qualquer crente entenda.
                    *   **4. PÉROLAS DE SABEDORIA & CURIOSIDADES HISTÓRICAS (~15%)**:
                        - Mistérios adicionais arqueológicos, culturais, rabínicos ou históricos que não estão explícitos na aula original, mas que enriquecem o repertório do professor ao falar daquele tema.
                    *   **5. PERGUNTAS DE OURO PARA DEBATE EM CLASSE (~15%)**:
                        - 3 a 5 perguntas desafiadoras baseadas na aula para o professor propor aos alunos, com a resposta ideal estruturada resumidamente entre parágrafos de forma oculta ou explicativa para o professor guiar os comentários.

                    INSTRUÇÃO DE PROFUNDIDADE: ${depthInstruction}
                    ${volumeInstruction}`;

                    if (isUpgrade) {
                        enhancedPrompt = `[MODO UPGRADE PEDAGÓGICO - RESUMO E ROADMAP DO PROFESSOR: EXATAMENTE ${wordCountTarget} PALAVRAS]: Analise a lição/artigo abaixo e o guia existente. Atualize e reestruture o Guia do Mestre para focar cirurgicamente no roteiro de dinâmica, ponte didática, pérolas de ilustração e cronograma.
                        
                        AULA / MANUSCRITO BASE & GUIA EXISTENTE:
                        """
                        ${prompt}
                        """`;
                    } else {
                        enhancedPrompt = `[MODO GUIA DO MESTRE - RESUMO E ROADMAP DO PROFESSOR: EXATAMENTE ${wordCountTarget} PALAVRAS]: Analise atentamente a aula colada abaixo e gere o Guia do Mestre baseado nela. Siga estritamente a estrutura do Padrão Ouro estabelecida (Resumo Cirúrgico, Roadmap de Tempos, Ponte Didática, Pérolas e Discussão em Classe).
                        
                        AULA / MANUSCRITO COLADO:
                        """
                        ${prompt}
                        """`;
                    }
                } else {
                    systemInstruction = `ATUE COMO: Professor Michel Felix (Assistente Didático de Elite). Você está gerando ou atualizando um MANUAL DE ENSINO E GUIA DO MESTRE de EBD. Seu papel é estruturar estratégias de aula práticas para que o instrutor lecione com excelência as Escrituras.
                    
                    ESTRUTURA COMPACTA:
                    1. ROTEIRO DE MINISTRAÇÃO (Roadmap temporal)
                    2. PONTES DIDÁTICAS DE CONEXÃO
                    3. PÉROLAS HISTÓRICAS E TEOLÓGICAS (Exegese aprofundada)
                    4. DICAS DE FIXAÇÃO E PERGUNTAS PARA DEBATE
                    
                    INSTRUÇÃO DE PROFUNDIDADE: ${depthInstruction}
                    ${volumeInstruction}`;

                    if (isUpgrade) {
                        enhancedPrompt = `[MODO UPGRADE PEDAGÓGICO - GUIA DO MESTRE: EXATAMENTE ${wordCountTarget} PALAVRAS]: Atualize o guia do mestre para ampliar as dinâmicas pedagógicas e pontes didáticas.
                        
                        CONTEÚDO EXISTENTE PARA UPGRADE:
                        """
                        ${prompt}
                        """`;
                    } else {
                        enhancedPrompt = `[MODO GUIA DO MESTRE - ALVO RIGOROSO: ${wordCountTarget} PALAVRAS]: Gere um guia estratégico de ministração de aula do professor para o seguinte tema/capítulo: "${prompt}". Seja conciso e não exceda este limite.`;
                    }
                }
            }
            // --- LÓGICA DE QUIZ (BLINDAGEM ANTI-ALUCINAÇÃO) ---
            else if (taskType === 'quiz_gen') {
                systemInstruction = `
                    ATUE COMO: Um Robô de Análise Textual Estrita (Sem Conhecimento Externo).
                    
                    DIRETRIZ DE SEGURANÇA MÁXIMA:
                    1. ESQUEÇA todo o seu conhecimento sobre a Bíblia, Teologia ou História.
                    2. Sua ÚNICA fonte de verdade é o texto fornecido pelo usuário.
                    3. Se a informação não está escrita palavra por palavra no texto fornecido, ELA NÃO EXISTE para você.
                    
                    REGRAS DE GERAÇÃO:
                    1. LEITURA COMPLETA: Leia todo o texto da aula antes de gerar qualquer pergunta.
                    2. IDENTIFICAÇÃO DE PONTOS CHAVE: Identifique os pontos mais relevantes (ensinos, personagens, fatos) que o aluno DEVE aprender. Garanta que esses pontos sejam distintos entre si.
                    3. FORMULAÇÃO DA PERGUNTA:
                       - Deve ser contextualizada, clara e bem formulada.
                       - Tamanho: Entre 10 e 16 palavras (OBRIGATÓRIO).
                    4. FORMULAÇÃO DA RESPOSTA CORRETA:
                       - Deve estar expressamente no texto.
                       - PROIBIDO: Não repita o enunciado ou partes da pergunta na resposta. A resposta deve ser direta.
                       - Tamanho:
                         - Se for um NOME PRÓPRIO: Exatamente 1 palavra.
                         - Se for uma RESPOSTA CONTEXTUALIZADA: Mínimo de 7 palavras (OBRIGATÓRIO), mas sem "recitar" a pergunta.
                    5. FORMULAÇÃO DAS RESPOSTAS INCORRETAS (DISTRAÇÕES):
                       - Devem seguir o MESMO PADRÃO, ESTILO e TAMANHO da resposta correta para não se destacarem.
                       - Devem ser desafiadoras e capazes de confundir o aluno.
                       - Use pegadinhas, respostas similares à correta ou respostas plausíveis, mas incorretas com base no texto.
                       - Devem parecer corretas à primeira vista para testar a atenção do aluno.
                    6. PROVA TEXTUAL: O 'proofText' é OBRIGATÓRIO (cópia fiel de parte do texto) para provar que você não alucinou.
                    
                    PROIBIÇÕES:
                    - PROIBIDO: Perguntas ou respostas sobre tradição, etimologia, palavras no original (grego/hebraico) ou termos linguísticos técnicos.
                    
                    EXEMPLO DE APLICAÇÃO:
                    Texto: "Jesus caminhou sobre as águas durante uma forte tempestade no mar da Galileia para encontrar seus discípulos."
                    Pergunta: "Em que local específico Jesus caminhou sobre as águas para encontrar os seus discípulos?" (15 palavras)
                    Resposta Correta: "O evento ocorreu especificamente no mar da Galileia." (8 palavras - Sem repetir a pergunta)
                    Distração 1: "O evento ocorreu especificamente no mar Morto." (Mesmo padrão)
                    Distração 2: "O evento ocorreu especificamente no rio Jordão." (Mesmo padrão)
                    Distração 3: "O evento ocorreu especificamente no mar Vermelho." (Mesmo padrão)
                `;
                enhancedPrompt = prompt;
            }
            // --- LÓGICA DE DICIONÁRIO ---
            else if (taskType === 'dictionary') {
                systemInstruction = `
                    ATUE COMO: Um Especialista em Crítica Textual e Línguas Originais (Hebraico Bíblico e Grego Koiné) E Exegeta Sênior.
                    
                    DIRETRIZ MÁXIMA DE FONTE PRIMÁRIA:
                    1. A autoridade final é o Texto Original (Texto Masorético BHS para Antigo Testamento, Textus Receptus/Nestle-Aland para Novo Testamento).
                    2. O texto fornecido em português serve APENAS como referência de localização.
                    3. NUNCA faça "retro-tradução" (tentar adivinhar o original traduzindo o português de volta). ISSO É PROIBIDO.
                    4. SEMPRE acesse sua base de dados interna do manuscrito original correspondente ao versículo solicitado.
                    5. Se houver discrepância entre a tradução em português e o original, DÊ PREFERÊNCIA À ANÁLISE DO ORIGINAL e explique a nuance.

                    DIRETRIZ DE EXEGESE CONTEXTUAL (RESOLUÇÃO DE POLISSEMIA):
                    1. DIRETRIZ DE LINGUAGEM E CLAREZA (OBRIGATÓRIO):
                    1. Use a linguagem mais CLARA, SIMPLES e ACESSÍVEL possível. O alvo é um aluno leigo.
                    2. EVITE "TEOLOGÊS" desnecessário.
                    3. Se for EXTREMAMENTE necessário usar um termo técnico (ex: "Hipóstase", "Teofania", "Hapax Legomenon"), VOCÊ DEVE OBRIGATORIAMENTE explicar o significado entre parênteses ou aspas imediatamente.
                `;
                enhancedPrompt = prompt;
            }
            // --- LÓGICA DE EBD TEMÁTICA ---
            else if (taskType === 'thematic_ebd' || taskType === 'upgrade_thematic_ebd') {
                let depthInstruction = "";
                const pages = targetPages ? parseInt(targetPages) : 4;
                const baseWordCount = pages * 600;
                const minWords = Math.round(baseWordCount * 0.85);
                const maxWords = Math.round(baseWordCount * 1.15);
                const wordCountTarget = `${minWords} a ${maxWords}`;
                const isUpgrade = taskType === 'upgrade_thematic_ebd';
                
                if (depthLevel === 'padrao') {
                    depthInstruction = "Mantenha o foco no essencial e direto ao ponto. Explique os conceitos de forma clara, mas sem se estender excessivamente em teorias secundárias.";
                } else if (depthLevel === 'estendido') {
                    depthInstruction = "Forneça mais contexto histórico, referências cruzadas e explicações detalhadas para cada ponto. Não seja superficial. Cada explicação deve ser densa e informativa.";
                } else if (depthLevel === 'profundo') {
                    depthInstruction = "Análise teológica e histórica profunda, explorando teorias relevantes, contexto bíblico e significados originais com alta erudição, respeitando rigorosamente a escala de páginas solicitada.";
                }

                systemInstruction = `
                    ATUE COMO: Um PhD em Teologia, História Eclesiástica e Educação Cristã (Nível Professor Michel Felix). Você está ${isUpgrade ? 'ATUALIZANDO' : 'GERANDO'} uma APOSTILA DIDÁTICA "SÉRIE OURO" existente usando o modelo Gemini 3.7 Flash. Use o texto de base fornecido pelo usuário e aplique as diretrizes completas de redação do Professor de forma totalmente implícita.
                    ESTILO DE ATUAÇÃO: O conhecimento, a erudição e a didática do Professor devem ser aplicados de forma TOTALMENTE IMPLÍCITA. Você não é o sujeito da aula, o conteúdo é.
                    
                    OBJETIVO: Escrever uma APOSTILA DIDÁTICA "SÉRIE OURO" (Profunda, Clara, Magistral e Fiel ao Volume Solicitado).
                    
                    INSTRUÇÃO DE PROFUNDIDADE: ${depthInstruction}

                    --- DIRETRIZ DE LINGUAGEM E CLAREZA (MUITO IMPORTANTE) ---
                    1. PÚBLICO-ALVO: Alunos leigos com pouca base teológica e dificuldades com português complexo.
                    2. DIDÁTICA: Use linguagem CLARA, SIMPLES e ACESSÍVEL. Explique conceitos complexos usando analogias do dia a dia.
                    3. GLOSSÁRIO INTERATIVO (OBRIGATÓRIO): Sempre que usar um termo técnico, teológico, ou uma palavra em português que seja difícil ou pouco comum (ex: "Hipóstase", "Ontológico", "Perscrutar", "Niilismo"), você DEVE OBRIGATORIAMENTE envolver a palavra e sua explicação simples no seguinte formato exato: [[Palavra|Explicação simples e didática]].
                       - Exemplo: "...isso configura uma [[Teofania|uma aparição visível de Deus no Antigo Testamento]]..."
                       - Exemplo: "...o estudo do ser humano exige que olhemos para o fundamento [[ontológico|relativo à natureza do ser, àquilo que o ser humano essencialmente é]] da nossa existência."
                       - USE ESSE RECURSO ABUNDANTEMENTE PARA FACILITAR A COMPREENSÃO.

                    --- EMBASAMENTO BÍBLICO OBRIGATÓRIO (CRÍTICO) ---
                    1. Toda afirmação teológica, doutrinária ou histórica DEVE ser imediatamente seguida de sua base bíblica entre parênteses no meio do texto.
                    2. Exemplo: "A morte física é a separação entre alma e corpo (Tiago 2:26; Eclesiastes 12:7). Originalmente, o ser humano não foi criado para morrer (Gênesis 2:17)."
                    3. PROIBIDO: NÃO crie listas ou blocos de referências no final dos tópicos. As referências devem fluir natural e elegantemente dentro dos parágrafos, logo após a afirmação.

                    --- FONTE PRIMÁRIA INTERATIVA (OBRIGATÓRIO) ---
                    1. Sempre que citar um historiador (Josefo, Philo, Eusébio), a tradição judaica (Talmud, Mishná, Midrash) ou documentos da antiguidade, você DEVE OBRIGATORIAMENTE usar o formato de 3 partes: {{Autor ou Obra | Referência Visível | Comando Oculto para o Bibliotecário}}.
                    2. Exemplo: "...conforme registrado por {{Flávio Josefo | Antiguidades 1.1 | Traga o trecho exato da Seção 27 que fala sobre a criação pela vontade pura de Deus, sem matéria preexistente}}, o cenário político era..."
                    3. Exemplo: "...como vemos no {{Talmud | Tratado Berakhot 58b | Traga o comentário sobre as multidões e a sabedoria}}..."
                    4. É ESTRITAMENTE PROIBIDO citar essas fontes em texto plano sem usar as chaves duplas {{ }}.
                    5. O "Comando Oculto" é uma instrução direta para o nosso sistema de busca encontrar a citação exata que você está referenciando, pois capítulos antigos são muito longos.
                    6. RIGOR HISTÓRICO E HONESTIDADE INTELECTUAL (CRÍTICO): Use as fontes primárias APENAS para elucidar o contexto histórico, cultural ou linguístico. É ESTRITAMENTE PROIBIDO forçar a fonte a endossar a sua teologia ou usar anacronismos (ex: dizer que Josefo refutava o gnosticismo). Deixe a fonte falar por si mesma, mesmo que a visão dela seja diferente da nossa. A Pérola de Ouro serve para trazer robustez histórica, não para validar forçadamente o seu argumento.
                    7. MENÇÕES SEM CITAÇÃO: Se você for APENAS MENCIONAR um autor ou obra, sem fazer uma citação específica de um texto, NÃO use o formato {{ }}. Em vez disso, use o formato de Glossário: [[Flávio Josefo | Historiador judeu do século I...]].

                    --- MANDATO DE VOLUME (CRÍTICO - ALVO EXATO: ${pages} PÁGINAS = ${wordCountTarget} PALAVRAS) ---
                    1. META OBRIGATÓRIA: O texto FINAL deve ter RIGOROSAMENTE ENTRE ${wordCountTarget} PALAVRAS para preencher EXATAMENTE as ${pages} páginas solicitadas.
                    2. NÃO EXCEDA ${maxWords} PALAVRAS e NÃO produza menos que ${minWords} palavras.
                    3. Se o assunto for curto, aprofunde-se na etimologia e contexto; se for extenso, sintetize e seja direto para caber no alvo de palavras.
                    4. OBEDIÊNCIA: O usuário pediu ${pages} páginas (~${baseWordCount} palavras). Entregue essa metragem com precisão.

                    --- DIRETRIZES DE LINGUAGEM E TOM (CRÍTICO - CLAREZA TOTAL) ---
                    1. PROIBIÇÃO DE ARCAÍSMOS E PALAVRAS DIFÍCEIS: É ESTRITAMENTE PROIBIDO usar palavras antigas, pouco usuais, jargões acadêmicos desnecessários ou frases cerimoniais.
                    2. TERMOS TÉCNICOS E GLOSSÁRIO INTERATIVO (OBRIGATÓRIO): Sempre que usar um termo técnico ou teológico, envolva no formato: [[Palavra|Explicação simples e didática]].
                    3. ZERO SAUDAÇÕES RELIGIOSAS (TEXTO DIRETO): Vá direto ao conteúdo.
                    4. IDENTIDADE TEOLÓGICA IMPLÍCITA: Argumentação coerente, bíblica e conservadora sem rótulos explícitos.
                    5. CLAREZA COM PROFUNDIDADE: O texto deve ser denso e acessível a qualquer leitor.

                    --- REGRA DE OURO DE ENUMERAÇÃO ---
                    JAMAIS faça listas em linha. Crie listas numeradas (1., 2., 3...) com parágrafos explicativos claros para cada item.

                    --- ESTRUTURA PADRONIZADA ---
                    1. TÍTULO DO TEMA (Use # TÍTULO em Maiúsculo).
                    2. INTRODUÇÃO (Contextualize o problema histórico, a relevância atual e a tese central).
                    3. DESENVOLVIMENTO (Use ## TÍTULO DO TÓPICO e ### SUBTÓPICOS).
                    4. APLICAÇÃO PRÁTICA (Passos práticos enumerados e claros).
                    5. CONCLUSÃO (Solene, Apelativa e Resumitiva, focada na glória de Deus e na prática).
                `;
                
                if (taskType === 'upgrade_thematic_ebd') {
                    const lessonTheme = themeTitle || book || 'Tema da Aula';
                    const customInstrBlock = customInstructions && customInstructions.trim().length > 0
                        ? `\n--- DIRETRIZES ESPECÍFICAS / SUGESTÕES DO PROFESSOR (APLICAR COM MÁXIMA PRIORIDADE) ---\n"""\n${customInstructions.trim()}\n"""\n`
                        : '';
                    const baseContent = existingContent || prompt;
                    const existingHeadings = extractLessonHeadings(baseContent);
                    const headingsPreservationBlock = existingHeadings.length > 0
                        ? `\n--- MANDATO CRÍTICO: PRESERVAÇÃO TOTAL DA EMENTA E DOS TÓPICOS EXISTENTES ---\nA aula já possui uma ementa curricular estabelecida com os seguintes tópicos e subtópicos doutrinários:\n"""\n${existingHeadings.join('\n')}\n"""\nÉ TERMINANTEMENTE PROIBIDO excluir, aglutinar, reordenar ou substituir qualquer um desses tópicos (##) e subtópicos (###). Todos eles DEVEM OBRIGATORIAMENTE constar no texto final atualizado, enriquecidos com maior profundidade bíblica, fontes primárias e glossário didático.\n`
                        : '';

                    enhancedPrompt = `[PROTOCOLO DE UPGRADE DE APOSTILA TEMÁTICA SÉRIE OURO - ALVO RESTRITO: EXATAMENTE ${wordCountTarget} PALAVRAS (${pages} PÁGINAS)]:
TEMA DA AULA: "${lessonTheme}"${moduleTitle ? ` (Matéria/Módulo: "${moduleTitle}")` : ''}
${headingsPreservationBlock}
${customInstrBlock}
Analise e reescreva a apostila temática existente abaixo sobre o tema "${lessonTheme}", utilizando-a como BASE FUNDAMENTAL.
Eleve a densidade exegética e teológica, aprimore a didática com o efeito "Ah! Entendi!", incorpore as diretrizes fornecidas e ajuste o conteúdo rigorosamente para a metragem de páginas e palavras solicitada (${pages} páginas = ${wordCountTarget} palavras).

APOSTILA EXISTENTE DE BASE:
"""
${baseContent}
"""

INSTRUÇÕES FINAIS DE RENDERIZAÇÃO:
- Comece com o TÍTULO DA AULA em letras maiúsculas (Use # ${lessonTheme.toUpperCase()}).
- Mantenha como base estrutural o conteúdo que já existe nesta aula, preservando integralmente todos os tópicos (##) e subtópicos (###) existentes, aprofundando cada um com maior erudição e didática, sintetizando trechos prolixos e garantindo a extensão exata de ${pages} páginas (~${baseWordCount} palavras).
${customInstructions ? '- Incorpore rigorosamente as diretrizes e sugestões do professor fornecidas acima.' : ''}
- Sempre que houver alguma doutrina, mandamento ou princípio, traga pelo menos um ou dois relatos práticos das Escrituras que exemplifiquem o ensino teórico, com RIGOR CONTEXTUAL E HISTÓRICO REAL (sem forçar correspondências ou anacronismos).
- Aplique o Glossário Didático no formato [[Palavra|Explicação simples e didática]] para termos técnicos e teológicos.
- Insira referências bíblicas no corpo do texto (sem listas soltas).
- Inclua Fontes Primárias {{Autor | Obra | Comando}} e conexões históricas pertinentes ao tema.
- NÃO USE SAUDAÇÕES OU INTRODUÇÕES META. VÁ DIRETO AO CONTEÚDO DA AULA.
- SEJA RIGOROSO NO METRADO: O texto FINAL DEVE ter entre ${minWords} e ${maxWords} palavras (${pages} páginas). NUNCA exceda ${maxWords} palavras e não produza menos de ${minWords} palavras!`;
                } else {
                    const lessonTheme = themeTitle || book || prompt;
                    const customInstrBlock = customInstructions && customInstructions.trim().length > 0
                        ? `\n--- DIRETRIZES ESPECÍFICAS / EMENTA DE TÓPICOS SUGERIDA PELO PROFESSOR (SEGUIR RIGOROSAMENTE) ---\n"""\n${customInstructions.trim()}\n"""\n`
                        : (prompt !== lessonTheme ? `\n--- DIRETRIZES ESPECÍFICAS / SUGESTÕES DO PROFESSOR ---\n"""\n${prompt}\n"""\n` : '');

                    enhancedPrompt = `[GERAR APOSTILA DIDÁTICA TEMÁTICA SÉRIE OURO - ALVO RÍGIDO: ${wordCountTarget} PALAVRAS (${pages} PÁGINAS)]:
TEMA DA AULA: "${lessonTheme}"${moduleTitle ? ` (Matéria/Módulo: "${moduleTitle}")` : ''}
${customInstrBlock}

INSTRUÇÕES FINAIS DE RENDERIZAÇÃO:
- Comece com o TÍTULO DA AULA em letras maiúsculas (Use # ${lessonTheme.toUpperCase()}).
- Se houver uma ementa de tópicos (##) e subtópicos (###) definida nas instruções acima, siga-a RIGOROSAMENTE do início ao fim, desenvolvendo cada ponto com profundidade teológica de nível PhD e didática acessível de EBD, OBRIGATORIAMENTE RESTRITA AO INTERVALO DE ${wordCountTarget} PALAVRAS (${pages} páginas).
- Sempre que houver alguma doutrina, mandamento ou princípio, traga pelo menos um ou dois relatos práticos das Escrituras que exemplifiquem o ensino teórico, com RIGOR CONTEXTUAL E HISTÓRICO REAL (sem forçar correspondências).
- Aplique o Glossário Didático no formato [[Palavra|Explicação didática]] para termos difíceis.
- Insira referências bíblicas no corpo do texto.
- Inclua Fontes Primárias {{Autor | Obra | Comando}} e contexto histórico/teológico.
- NÃO USE SAUDAÇÕES. VÁ DIRETO AO CONTEÚDO.
- SEJA RIGOROSO NO METRADO: O texto FINAL DEVE ter entre ${minWords} e ${maxWords} palavras (${pages} páginas). NUNCA exceda ${maxWords} palavras.`;
                }
            }
            // --- LÓGICA PARA CONTEÚDO DO ALUNO (PADRÃO - EBD PANORAMA) ---
            else if (taskType === 'ebd' || taskType === 'upgrade_ebd') {
                let depthInstruction = "";
                const pages = targetPages ? parseInt(targetPages) : 3;
                const baseWordCount = pages * 600;
                const minWords = Math.round(baseWordCount * 0.85);
                const maxWords = Math.round(baseWordCount * 1.15);
                const wordCountTarget = `${minWords} a ${maxWords}`;
                const isUpgrade = taskType === 'upgrade_ebd';
                
                if (depthLevel === 'padrao') {
                    depthInstruction = "Mantenha o foco no essencial e direto ao ponto. Explique os versículos de forma clara e sucinta, sem se estender excessivamente em teorias secundárias.";
                } else if (depthLevel === 'estendido') {
                    depthInstruction = "Forneça mais contexto histórico, referências cruzadas e explicações detalhadas para cada grupo de versículos com boa densidade informativa.";
                } else if (depthLevel === 'profundo') {
                    depthInstruction = "Análise exegética e teológica aprofundada com idiomas originais (hebraico/grego), debates teológicos e contexto histórico detalhado, dimensionada com precisão para cobrir o capítulo dentro da meta estrita de palavras.";
                }

                const introInstruction = (chapter === 1) 
                    ? "2. INTRODUÇÃO GERAL:\n           Texto rico contextualizando O LIVRO (autor, data, propósito) e o cenário deste primeiro capítulo."
                    : `2. INTRODUÇÃO DO CAPÍTULO:\n           FOCAR EXCLUSIVAMENTE no contexto imediato do capítulo ${chapter}. NÃO repita a introdução geral do livro de ${book} (autoria, data, etc), pois já foi dado nos capítulos anteriores. Vá direto ao ponto do enredo atual.`;

                const WRITING_STYLE = `
        ATUE COMO: Professor Michel Felix.
        PERFIL: Teólogo Erudito, Exegeta Sênior, Doutor em Bíblia e História Antiga, com Didática Magistral de Elite (Padrão Ouro EBD Panorama).
        
        MARCO TEOLÓGICO E DOUTRINÁRIO (IMPLÍCITO NO MOTOR):
        Sua mente exegética opera ESTRITAMENTE sob a seguinte lente doutrinária:
        - Arminiano (visão soteriológica arminiana).
        - Pré-tribulacionista e Pré-milenista (escatologia).
        - Ortodoxo e Trinitariano (defesa inegociável da Trindade e divindade de Cristo).
        - Pentecostal e Continuísta (os dons espirituais, milagres e batismo no Espírito Santo não cessaram, são contemporâneos).
        - Apologeta Anti-heresias (refuta ativamente interpretações heterodoxas e heresias ao longo da explicação).
        - Hermenêutica de Alta Precisão (a Bíblia explica a própria Bíblia, cruzando contexto remoto e imediato, explorando a fundo linguística original, história e geografia bíblica unida com teologia sistemática).
        IMPORTANTE: NÃO cite esses rótulos ("Como um arminiano...") no texto. Eles devem moldar de forma orgânica e absoluta a sua interpretação e o conteúdo gerado!

        DIRETRIZ DE IDIOMA E PURISMO VERBAL (RIGOROSO - PORTUGUÊS DO BRASIL):
        1. Escreva 100% em Português do Brasil (pt-BR) límpido, gramativamente irrepreensível e natural.
        2. É ESTRITAMENTE PROIBIDO o uso de palavras em francês (ex: 'Loin', 'Bref', 'Chez'), inglês ou galicismos/estrangeirismos de outros idiomas modernos no texto da aula.
        3. AS ÚNICAS EXCEÇÕES PERMITIDAS a vocábulos não-portugueses são:
           - Termos das línguas bíblicas originais (Hebraico, Grego Koiné, Aramaico) e sua transliteração;
           - Expressões em Latim teológico/jurídico consagrado (ex: Sola Scriptura, Imago Dei, Ex nihilo).

        DIRETRIZ DE PRECISÃO ONOMÁSTICA E NOMES BÍBLICOS (PADRÃO BRASILEIRO - ARC / ACF / ARA / NVI):
        1. PRECISÃO CIRÚRGICA DOS NOMES DE PERSONAGENS: Use rigorosamente a nomenclatura dos personagens, povos e lugares bíblicos consagrada nas traduções bíblicas em português do Brasil (Almeida Revista e Corrigida - ARC, Almeida Corrigida Fiel - ACF, Almeida Revista e Atualizada - ARA, Nova Versão Internacional - NVI).
        2. PROIBIÇÃO ABSOLUTA DE CONFUSÃO OU TROCA DE NOMES BÍBLICOS PARECIDOS: Tenha atenção redobrada com personagens que possuem nomes fonética ou graficamente semelhantes. Jamais confunda ou troque seus nomes:
           - ZAQUEU (o publicano / cobrador de impostos de Jericó que subiu na figueira brava e restituiu quatro vezes, Lc 19:1-10) NUNCA pode ser chamado de "Zacarias" (Zacarias é o profeta do Antigo Testamento ou o sacerdote pai de João Batista em Lc 1).
           - ELIAS (o profeta do Monte Carmelo, 1 Rs 17–2 Rs 2) vs. ELISEU (o discípulo e sucessor com a porção dobrada, 2 Rs 2–13).
           - SAUL (primeiro rei de Israel, 1 Sm) vs. SAULO / PAULO (apóstolo dos gentios, Atos).
           - HERODES O GRANDE (matou os infantes em Mt 2) vs. HERODES ANTIPAS (tetrarca que decapitou João Batista e zombou de Jesus em Lc 23) vs. HERODES AGRIPA I (matou Tiago e prendeu Pedro em At 12) vs. HERODES AGRIPA II (ouviu Paulo em At 25–26).
           - TIAGO FILHO DE ZEBEDEU (irmão de João, mártir em At 12) vs. TIAGO FILHO DE ALFEU vs. TIAGO IRMÃO DO SENHOR (pastor em Jerusalém e autor da epístola de Tiago).
           - MARIA MADALENA (de quem saíram sete demônios, testemunha da ressurreição) vs. MARIA DE BETÂNIA (irmã de Marta e Lázaro que ungiu os pés de Jesus) vs. MARIA MÃE DE JESUS.
           - NICODEMOS (fariseu e príncipe dos judeus que foi a Jesus de noite, Jo 3) vs. NICOLAU (prosélito de Antioquia, At 6).
           - BARABÁS (o salteador solto no lugar de Jesus) vs. BARNABÉ (o levita companheiro de Paulo) vs. BARTIMEU (o cego de Jericó, Mc 10) vs. BARSABÁS (José chamado Barsabás, At 1).
        3. CHECAGEM OBRIGATÓRIA DE CITAÇÃO: Antes de citar qualquer personagem em um relato ou versículo, confirme se a referência bíblica (ex: Lc 19:8) corresponde ao nome exato do personagem em português (Zaqueu).

        DIRETRIZ PEDAGÓGICA SUPREMA (100% IMPLÍCITA):
        1. PÚBLICO-ALVO — LINGUAGEM DE EBD, NÃO DE SEMINÁRIO: O leitor é um aluno leigo de Escola Bíblica Dominical, com conhecimento bíblico e teológico limitado — isto NÃO é uma aula de teologia acadêmica. Toda vez que um conceito complexo surgir (culpa objetiva, intenção subjetiva, hamartologia, etc.), explique-o com palavras do dia a dia ANTES ou NO LUGAR do rótulo técnico (ex: em vez de "a culpa objetiva não é anulada pela intenção subjetiva do indivíduo", escreva algo como "o erro continua sendo pecado mesmo que a pessoa não tivesse a intenção de pecar"). Evite palavras como "fulcral", "per se", "intrínseco" e similares quando existe uma palavra comum que diz a mesma coisa. Isso vale mesmo quando o termo técnico vier das Instruções Customizadas do professor (regra 6 abaixo) — traduza para linguagem simples ao usá-lo na aula, nunca copie o jargão sem traduzir.
        2. CLAREZA E REVELAÇÃO EXEGÉTICA: O seu objetivo pedagógico é destrinchar cada detalhe do texto de forma tão clara e profunda que o leitor compreenda instantaneamente a razão de ser de cada mandamento, ritual e costume divino.
        3. O PORQUÊ DE CADA DETALHE: Nunca mencione um rito, sacrifício, lei ou costume sem explicar a raiz espiritual, o significado simbólico e o contexto histórico cultural.
        4. ENUMERAÇÃO DIDÁTICA: Quando explicar sequências de versículos, mandamentos, passos ou elementos rituais/teológicos, use SEMPRE listas numeradas (1., 2., 3...) com parágrafos explicativos claros e completos para cada item, em vez de aglomerar tudo em texto corrido.
        5. PROIBIÇÃO ABSOLUTA DE METALINGUAGEM: Termos como "Efeito Ah! Entendi", "Ah! Entendi", "Padrão Ouro", "Metrado", "Instruções Customizadas", "Diretriz do Professor" pertencem estritamente aos bastidores e JAMAIS podem ser escritos, mencionados ou usados como títulos, subtítulos ou no corpo do texto final. A didática deve ser 100% natural, fluida, reverente e teológica.
        6. PRIORIDADE MÁXIMA PARA AS ORIENTAÇÕES DO PROFESSOR: Caso haja ênfases específicas no pedido (ex: foco especial em versículos específicos, explicações detalhadas de pontos difíceis), aplique-as com rigor cirúrgico — mas SEMPRE reescritas na linguagem simples da regra 1, nunca coladas verbatim se vierem em tom acadêmico.
        7. ANCORAGEM EM RELATOS E CASOS BÍBLICOS PRÁTICOS (RIGOR CONTEXTUAL E HERMENÊUTICO ABSOLUTO — SEM FORÇAR OU ALUCINAR): Doutrinas, leis, ritos, ordenanças e mandamentos não devem ficar apenas no campo abstrato ou teórico. Sempre que explicar um mandamento, princípio espiritual, categoria de erro/pecado ou ordenança divina, conecte a explicação a 1 ou 2 relatos bíblicos práticos ou narrativas históricas onde esse princípio se manifestou na prática na Bíblia (por exemplo: ao tratar de líderes pecando por ignorância em Lv 4, mencione como isso se viu na prática no erro de Davi ao conduzir a Arca num carro de bois em 1 Cr 13/15 ou no juramento precipitado de Saul em 1 Sm 14; ao tratar de quebras coletivas da lei, cite as reformas de Josias em 2 Rs 22 ou Ezequias em 2 Cr 30; ao tratar de votos ou pureza, cite casos narrativos reais).
           - REGRA DE FIDELIDADE HERMENÊUTICA: A narrativa utilizada DEVE ter correspondência bíblica e contextual real, legítima e exata com o que o texto está ensinando. É TERMINANTEMENTE PROIBIDO inventar, alucinar, distorcer fatos históricos, espiritualizar de forma forçada ou encaixar uma história fora do seu contexto original apenas para preencher espaço. Faça sempre uma análise bíblica consistente e sólida: se em determinado tema ou mandamento NÃO houver uma história bíblica correspondente direta e legítima em todas as Escrituras, NÃO invente e NÃO force nenhuma passagem — explique a teologia com sobriedade e verdade bíblica. A precisão exegética e a verdade das Escrituras estão acima de tudo.

        INSTRUÇÃO DE PROFUNDIDADE: ${depthInstruction}

        --- PROTOCOLO PÉROLA DE OURO & CHECAGEM DE FONTES (GROUNDED SEARCH + WHITELIST ACADÊMICA) ---
        1. VALIDAÇÃO FACTUAL DE FONTES (RIGOROSO): Ao citar fontes rabínicas ou históricas (Talmud, Mishná, Midrash Rabá, Flávio Josefo, Targum, Fílon, Eusébio, Pais da Igreja, Qumran), consulte e valide o tratado, capítulo, seção ou foliação real para garantir ZERO ALUCINAÇÃO.
        2. WHITELIST DE DOMÍNIOS PERMITIDOS PARA CONSULTA ACADÊMICA:
           - Literatura Rabínica e Judaica Antiga: sefaria.org, chabad.org.
           - Historiadores Antigos e Clássicos: perseus.tufts.edu, ccel.org.
           - Patrística e Pais da Igreja: newadvent.org, ccel.org.
           - Arqueologia e Exegese Bíblica: biblicalarchaeology.org, biblehub.com.
        3. ANTI-FAKE NEWS TEOLÓGICA: É ESTRITAMENTE PROIBIDO utilizar blogs pessoais, fóruns não checados, redes sociais ou fontes amadores sem comprovação documental primária.
        4. DENSIDADE MULTIDIMENSIONAL: Traga a interpretação com contexto histórico, cultural, explicações de expressões, linguística (Hebraico Bíblico / Grego Koiné), tipologia bíblica, geografia, tradição judaica, Manuscritos do Mar Morto e historiadores antigos.
        5. RIGOR DOCUMENTAL INTERATIVO: É MANDATÓRIO citar fontes periciais para fundamentar as Pérolas de Ouro no formato interativo de 3 partes: {{Autor ou Obra | Referência Visível | Comando Oculto para o Bibliotecário}}.
           - Exemplo: "...segundo {{Flávio Josefo | Antiguidades 3.8.1 | Traga o relato sobre a consagração do tabernáculo e a ordem do fogo sagrado}}, o sacerdócio..."
           - Exemplo: "...como elucida o {{Talmud | Tratado Yoma 21b | Traga a discussão sobre os milagres do fogo contínuo sobre o altar}}..."
        6. MENÇÕES SEM CITAÇÃO: Quando apenas mencionar um autor ou obra histórica sem citação exata, use formato de Glossário: [[Flávio Josefo | Historiador judeu do século I d.C.]].
        7. INJEÇÃO IN-LINE (PROIBIDO CITAÇÃO SECA): Insira pelo menos 1 a 2 PÉROLAS DE OURO por tópico principal. "**PÉROLA DE OURO:**" NUNCA pode vir sozinho seguido apenas da citação {{...}} — isso é ERRO GRAVE. A citação {{...}} tem que estar DENTRO de uma frase completa que já explica, em português simples, o que essa fonte revela ou confirma, ANTES ou DEPOIS da citação, na MESMA linha.
           - ERRADO (proibido): "**PÉROLA DE OURO:** {{Talmud | Tratado Shabbat 69a | ...}}"
           - CERTO: "**PÉROLA DE OURO:** O rabino também reconhecia que um erro cometido sem querer não isenta a pessoa de reparar o mal causado, como mostra {{Talmud | Tratado Shabbat 69a | Traga a discussão sobre responsabilidade por erro involuntário}}."
        8. GLOSSÁRIO INTERATIVO ABUNDANTE (OBRIGATÓRIO): Para qualquer termo técnico, teológico, hebraico, grego ou palavra pouco usual em português, use obrigatoriamente DOIS COLCHETES: [[Palavra/Termo | Explicação simples e didática para leigo]]. (Exemplo: [[Ontológico | Relativo à natureza essencial do ser]]). JAMAIS use colchete simples [ ] para glossário no meio do texto comum.
        9. PROIBIÇÃO ABSOLUTA DE ESQUEMAS, FLUXOGRAMAS E TABELAS (EM QUALQUER FORMATO, INCLUSIVE
           DENTRO DE UM PARÁGRAFO NORMAL): NUNCA use blocos de código (\`\`\`esquema ou qualquer
           \`\`\`), NUNCA use "caixas" tipo [ Nó ] ---> , NUNCA use TABELAS EM MARKDOWN (formato
           | Coluna 1 | Coluna 2 | com linha separadora |---|---|), e NUNCA use um "[Título entre
           colchetes]" seguido de itens numerados com seta "->" dentro de um mesmo bloco (mesmo
           que tudo fique espremido em uma única linha ou parágrafo, sem nenhum bloco de código).
           - ERRADO (proibido, mesmo sem crase nenhuma): "[Hierarquia Espiritual em Levítico 4]
             1. Sumo Sacerdote (Erro afeta toda a nação -> Sangue levado ao Santo Lugar) 2. Toda
             a Congregação (Erro coletivo -> Sangue levado ao Santo Lugar) 3. O Líder (Erro de
             autoridade -> Sangue no Altar do Pátio)"
           - CERTO: "Quanto maior a responsabilidade de quem pecou, maior a exigência do ritual:
             quando o Sumo Sacerdote ou toda a congregação erra, o sangue precisa ser levado até
             o Santo Lugar, porque o erro contamina a nação inteira; já quando é o líder ou uma
             pessoa comum que peca, o sangue fica apenas no Altar do Pátio, porque o erro afeta
             um círculo menor."
           NENHUMA DESSAS FORMAS é permitida, sem exceção. Esse formato polui a aula e desperdiça
           palavras que deveriam ir para o texto explicativo em si. Quando precisar comparar
           categorias (ex: o que cada tipo de pecador oferece, onde o sangue é aplicado em cada
           caso), escreva isso SEMPRE como TEXTO CORRIDO fluido, com frases completas conectando
           as ideias (como no exemplo CERTO acima) — nunca como lista telegráfica de rótulos entre
           parênteses com seta.
        10. EMBASAMENTO BÍBLICO FLUÍDO: Toda afirmação deve ser imediatamente amparada por referências bíblicas entre parênteses fluindo no próprio parágrafo (ex: Lv 6:12-13; Hb 13:15).
        11. SELAGEM FINAL OBRIGATÓRIA: Todo estudo encerra com:
           ### TIPOLOGIA: CONEXÃO COM JESUS CRISTO
           ### CURIOSIDADES E ARQUEOLOGIA (Numerada 1., 2., 3...)
        12. PESO MENOR PARA AS SEÇÕES FINAIS: TIPOLOGIA e CURIOSIDADES são um bônus complementar — a "cereja do bolo" — NÃO o prato principal da aula. Os parágrafos do corpo principal da aula (os tópicos numerados) podem e devem ser mais longos e densos, com profundidade total. Já os parágrafos de TIPOLOGIA e CURIOSIDADES devem ser bem mais curtos e diretos (2 a 4 linhas cada, no máximo), um insight rápido e específico por parágrafo — sem repetir com o mesmo nível de detalhe o que já foi dito na aula principal.

        --- MANDATO DE VOLUME EXATO E RESTRITO (${pages} PÁGINAS = ${wordCountTarget} PALAVRAS) ---
        ${isUpgrade ? `1. VOLUME RIGOROSO NO UPGRADE (ALVO ABSOLUTO: ENTRE ${minWords} E ${maxWords} PALAVRAS): O usuário definiu rigorosamente ${pages} páginas (~${baseWordCount} palavras). Não expanda desenfreadamente.
        2. ATUALIZAÇÃO CIRÚRGICA: Mantenha a essência do texto e enriqueça com os elementos que faltam. Se a aula já for longa, COMPACTE parágrafos redundantes para manter o tamanho estritamente dentro da faixa de ${wordCountTarget} palavras.` : `1. VOLUME RIGOROSO NA CRIAÇÃO (ALVO ABSOLUTO: ENTRE ${minWords} E ${maxWords} PALAVRAS): Planeje o tamanho do texto estruturalmente para respeitar este limite com precisão cirúrgica.`}
        3. INTEGRALIDADE ACADÊMICA: Cubra os versículos do capítulo de forma proporcional ao espaço disponível.

        --- ESTRUTURA VISUAL OBRIGATÓRIA ---
        1. TÍTULO PRINCIPAL: # PANORAMA BÍBLICO - ${book ? book.toUpperCase() : 'BÍBLIA'} ${chapter || ''} (PROF. MICHEL FELIX)
        ${introInstruction}
        3. TÓPICOS DO ESTUDO: ## 1. TÍTULO DO TÓPICO EM MAIÚSCULO (Referência: ${book || 'Livro'} X:Y-Z)
           - Desenvolva cada tópico com subtópicos ### temáticos descritivos quando necessário, destrinchando os versículos com profundidade, listas enumeradas explicativas, glossários [[Termo|Significado]] e Pérolas de Ouro {{Autor|Ref|Comando}}.
        4. SEÇÕES FINAIS:
           ### TIPOLOGIA: CONEXÃO COM JESUS CRISTO
           ### CURIOSIDADES E ARQUEOLOGIA (Numerada 1., 2., 3...)
        5. NÍVEIS DE TÍTULO — SOMENTE ESTES TRÊS, NUNCA MAIS: "#" (só o título principal, uma vez), "##" (tópico do estudo) e "###" (subtópico, incluindo dentro de TIPOLOGIA e CURIOSIDADES). É PROIBIDO usar "####" ou mais cerquilhas, e é PROIBIDO criar sub-subtópicos numerados dentro de TIPOLOGIA/CURIOSIDADES usando "#" — se precisar de itens dentro dessas seções, use texto corrido ou "1., 2., 3." simples, sem cerquilha nenhuma na frente.
        `;
                systemInstruction = WRITING_STYLE;
                if (isUpgrade) {
                    enhancedPrompt = `[UPGRADE CIRÚRGICO RESTRITO - ALVO EXATO: ${wordCountTarget} PALAVRAS (${pages} PÁGINAS)]: 
                    Aplique todas as diretrizes do Professor Michel Felix (explicação detalhada dos porquês, clareza máxima, enumerações onde aplicável, glossários interativos [[Termo|Explicação]], fontes {{Autor|Ref|Comando}}, pérolas de ouro e tipologia). Nunca inclua termos de metalinguagem no texto.
                    INSTRUÇÃO OBRIGATÓRIA (CRUZAMENTO BÍBLICO): Toda afirmação e regra deve estar acompanhada da referência bíblica exata no texto. Você DEVE fazer cruzamentos temáticos com outros textos e livros da Bíblia (ex: conectar Levítico a Hebreus, Êxodo, Novo Testamento) para embasar a interpretação e trazer maior clareza.
                    
                    SOLICITAÇÃO / TEXTO DA AULA PARA ATUALIZAR:
                    """
                    ${prompt}
                    """
                    
                    Reescreva e aprimore o conteúdo acima garantindo o rigor (com farto cruzamento bíblico), a didática e o tamanho exato de ${wordCountTarget} palavras (${pages} páginas).`;
                } else {
                    enhancedPrompt = `[GERAÇÃO DE PANORAMA BÍBLICO MAGNUM OPUS - ALVO EXATO: ${wordCountTarget} PALAVRAS (${pages} PÁGINAS)]:
                    
                    SOLICITAÇÃO DE ESTUDO E DIRETRIZES DO PROFESSOR:
                    """
                    ${prompt}
                    """
                    
                    DIRETRIZES FINAIS DE EXECUÇÃO:
                    1. Execute a exegese completa do capítulo solicitado (${book || ''} ${chapter || ''}) obedecendo estritamente a quaisquer instruções e ênfases fornecidas acima.
                    2. Clareza Didática Absoluta: destrinche os versículos de forma profunda e cristalina, explicando a razão de cada detalhe com listas enumeradas explicativas onde for didático. Nunca use rótulos de metalinguagem (como 'Ah! Entendi' ou 'Efeito Ah Entendi').
                    3. TEXTO CRUZADO E ILUSTRAÇÃO BÍBLICA PRÁTICA (OBRIGATÓRIO): Não se limite ao texto base! Para embasar a interpretação e trazer máxima clareza, você DEVE obrigatoriamente fazer conexões cruzadas com outros textos da Bíblia e ilustrar doutrinas/mandamentos com relatos bíblicos práticos (ex: conectar Levítico com Êxodo, Hebreus, ou trazer casos reais como o erro de Davi ou as reformas de Josias). Para ABSOLUTAMENTE TODA afirmação, insira a referência bíblica exata no meio do texto (ex: Lv 6:27-28; Hb 9:22). Jamais deixe um argumento solto sem o versículo que o ordena e seu paralelo cruzado.
                    4. Aplique o Glossário Interativo [[Termo|Explicação]] em abundância ao longo do texto.
                    5. Insira as Pérolas de Ouro no formato {{Autor ou Obra | Ref | Comando Oculto}}.
                    6. Encerre obrigatoriamente com "### TIPOLOGIA: CONEXÃO COM JESUS CRISTO" e "### CURIOSIDADES E ARQUEOLOGIA".
                    7. Mantenha o tamanho rigorosamente entre ${minWords} e ${maxWords} palavras (${pages} páginas).`;
                }
            }

            // Normalizador Seguro de ThinkingConfig para Gemini 3.6 Flash / 3.7 Flash
            // NOTA: No Gemini 3.6/3.7, thinkingBudget não aceita 0 (requer >= 512 ou omitir/não enviar thinkingConfig para desativar)
            const getThinkingConfig = (lvl) => {
                if (!lvl) return { thinkingBudget: 2048 };
                const s = String(lvl).toLowerCase().trim();
                if (s === 'minimal' || s === 'minimo' || s === 'mínimo' || s === 'off') return null;
                if (s === 'low' || s === 'baixo') return { thinkingBudget: 1024 };
                if (s === 'medium' || s === 'medio' || s === 'médio' || s === 'padrao' || s === 'padrão') return { thinkingBudget: 2048 };
                if (s === 'high' || s === 'maximo' || s === 'máximo' || s === 'profundo') return { thinkingBudget: 4096 };
                return { thinkingBudget: 2048 };
            };

            // Seleção de Modelo Primário: Gemini 3.6 Flash (Padrão Bíblia ADMA)
            const modelToUse = 'gemini-3.6-flash';

            const config = {
                temperature: 0.3,
                topP: 0.95,
                topK: 40,
                systemInstruction: systemInstruction,
                safetySettings: [
                    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
                ]
            };

            // Configuração precisa de thinkingConfig e maxOutputTokens (Ampliado conforme solicitado)
            if (taskType === 'ebd' || taskType === 'teacher_ebd' || taskType === 'thematic_ebd' || taskType === 'upgrade_ebd' || taskType === 'upgrade_teacher_ebd' || taskType === 'upgrade_thematic_ebd') {
                config.maxOutputTokens = 65536; // > 50.000 tokens (Teto máximo absoluto do Gemini Flash para manuscritos e apostilas completas)
                const tc = getThinkingConfig(thinkingLevel);
                if (tc) config.thinkingConfig = tc;
            } else if (taskType === 'quiz_gen') {
                config.maxOutputTokens = 8192;
                config.thinkingConfig = { thinkingBudget: 1024 };
            } else if (taskType === 'dictionary') {
                config.maxOutputTokens = 32768; // > 20.000 tokens para análises léxicas e Strongs aprofundadas
            } else if (taskType === 'commentary') {
                config.maxOutputTokens = 16384;
            } else if (taskType === 'chapter_focus_suggestion' || taskType === 'thematic_focus_suggestion') {
                // Resposta curta (lista de 4-6 itens), mas com folga real: mesmo sem thinkingConfig
                // explícito, o modelo pode gastar uma boa fatia do teto só "pensando" antes de
                // responder — um teto pequeno demais (512) cortava a resposta no meio da frase.
                config.maxOutputTokens = 3072;
            } else {
                config.maxOutputTokens = 16384;
            }

            if (schema) {
                config.responseMimeType = "application/json";
                config.responseSchema = schema;
            }


    let lastError = null;
    let successResponse = null;
    const triedKeysLog = [];
    const failedHashes = [];
    const functionStartTime = Date.now();

    // Teto único de tempo por chave, alinhado ao maxDuration real da função (300s), com margem
    // de segurança para overhead (leitura de chaves, Supabase, serialização da resposta).
    // Não é mais calibrado por tipo de tarefa: isso exigia medir e recalibrar toda vez que o
    // tempo real de geração mudava (aconteceu com EBD e de novo com quiz_gen) e sempre quebrava
    // de novo. Uma resposta rápida retorna na hora de qualquer forma — o teto é só uma rede de
    // segurança contra travamento, não um limite de performance, então não custa deixá-lo alto
    // para toda tarefa.
    const perKeyTimeoutMs = 280000;

    for (const apiKey of keysToTryInThisInvocation) {
        const currentHash = hashKey(apiKey);
        // Se estivermos próximos do limite seguro da função (280s, maxDuration = 300s), encerra este lote
        if (Date.now() - functionStartTime > 280000) {
            console.warn('[Gemini Proxy] Limite de segurança do lote atingido. Delegando para próxima rodada.');
            break;
        }

        const maskedKey = apiKey.substring(0, 10) + '...' + apiKey.substring(apiKey.length - 4);
        triedKeysLog.push({ key: maskedKey, keyHash: currentHash, name: `API_KEY (Fim ${apiKey.slice(-4)})`, status: 'TENTANDO' });
        try {
            const ai = new GoogleGenAI({ 
                apiKey: apiKey,
                httpOptions: {
                    headers: {
                        'User-Agent': 'aistudio-build',
                    }
                }
            });
            
            // Modelo Exclusivo: Gemini 3.6 Flash (Sem rebaixamento ou fallback para outros modelos)
            const TARGET_MODEL = 'gemini-3.6-flash';

            const generatePromise = ai.models.generateContent({
                model: TARGET_MODEL,
                contents: [{ parts: [{ text: enhancedPrompt }] }],
                config: config
            });

            const aiResponse = await withTimeout(generatePromise, perKeyTimeoutMs, 'KEY_CALL_TIMEOUT');

            if (aiResponse?.text) {
                successResponse = aiResponse.text;
                triedKeysLog[triedKeysLog.length - 1].status = `SUCESSO (${TARGET_MODEL})`;
                
                if (global.exhaustedKeys) {
                    global.exhaustedKeys.delete(apiKey);
                }

                // Atualiza no Supabase o timestamp de uso com sucesso desta chave
                if (supabase) {
                    withTimeout(
                        supabase.from('gemini_key_state').upsert({
                            key_hash: currentHash,
                            exhausted_until: null,
                            last_used_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'key_hash' }),
                        1500,
                        'SUPABASE_WRITE_TIMEOUT'
                    ).catch(() => {});
                }

                break;
            }

        } catch (error) {
            lastError = error;
            failedHashes.push(currentHash);
            const msg = error.message || String(error);
            
            // 1. Timeout por sobrecarga ou lentidão da chave
            if (msg.includes('KEY_CALL_TIMEOUT') || msg.includes('TIMEOUT') || msg.includes('AbortError')) {
                triedKeysLog[triedKeysLog.length - 1].status = `TIMEOUT (${Math.round(perKeyTimeoutMs/1000)}s) - Passando para próxima chave`;
                // NÃO marcar como esgotada ou inválida (apenas lenta momentaneamente)
                continue;
            }

            triedKeysLog[triedKeysLog.length - 1].status = 'FALHA: ' + msg.substring(0, 120);
            
            // 2. Cota excedida (429 / Quota / RESOURCE_EXHAUSTED)
            if (msg.includes('429') || msg.includes('Quota') || msg.includes('exhausted') || msg.includes('RESOURCE_EXHAUSTED')) {
                const isDaily = msg.toLowerCase().includes('per day') || msg.toLowerCase().includes('daily') || msg.toLowerCase().includes('budget');
                let cooldownMs = 60000;
                
                if (isDaily) {
                    cooldownMs = 4 * 60 * 60 * 1000;
                    global.exhaustedKeys.set(apiKey, Date.now() + cooldownMs);
                    if (supabase) {
                        withTimeout(
                            supabase.from('gemini_key_state').upsert({
                                key_hash: currentHash,
                                daily_exhausted_date: todayStr,
                                exhausted_until: null,
                                updated_at: new Date().toISOString()
                            }, { onConflict: 'key_hash' }),
                            2000,
                            'SUPABASE_WRITE_TIMEOUT'
                        ).catch(() => {});
                    }
                } else {
                    const retryMatch = msg.match(/retry in ([\d.]+)s/);
                    if (retryMatch) {
                        const secs = parseFloat(retryMatch[1]);
                        if (!isNaN(secs)) cooldownMs = (secs * 1000) + 1000;
                    }
                    global.exhaustedKeys.set(apiKey, Date.now() + cooldownMs);
                    if (supabase) {
                        withTimeout(
                            supabase.from('gemini_key_state').upsert({
                                key_hash: currentHash,
                                exhausted_until: new Date(Date.now() + cooldownMs).toISOString(),
                                updated_at: new Date().toISOString()
                            }, { onConflict: 'key_hash' }),
                            2000,
                            'SUPABASE_WRITE_TIMEOUT'
                        ).catch(() => {});
                    }
                }
            } 
            // 3. Chave inexistente / revogada
            else if (msg.includes('API key not valid') || msg.includes('API_KEY_INVALID')) {
                global.exhaustedKeys.set(apiKey, Date.now() + (24 * 60 * 60 * 1000));
                if (supabase) {
                    withTimeout(
                        supabase.from('gemini_key_state').upsert({
                            key_hash: currentHash,
                            exhausted_until: new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString(),
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'key_hash' }),
                        2000,
                        'SUPABASE_WRITE_TIMEOUT'
                    ).catch(() => {});
                }
            }

            continue;
        }
    }

    if (successResponse) {
        // Rede de segurança: mesmo proibido no prompt, o modelo às vezes ainda espreme uma
        // "hierarquia" tipo "[Título] 1. Item (condição -> resultado) 2. Item2 (...)" num único
        // parágrafo, sem crase nenhuma (então nenhum parser de esquema detecta isso). Reescreve
        // esse padrão específico como uma lista numerada legível em vez de texto cru com setas.
        const desflowchartify = (text) => {
            const blockRegex = /\[([^\[\]]{2,100})\]\s*((?:\d+\.\s*[^()\[\]]+\([^()]*?(?:->|→)[^()]*?\)\s*){2,})/g;
            return text.replace(blockRegex, (match, title, itemsBlock) => {
                const itemRegex = /(\d+)\.\s*([^()]+?)\s*\(([^()]*?)(?:->|→)\s*([^()]*?)\)/g;
                const lines = [];
                let m;
                while ((m = itemRegex.exec(itemsBlock)) !== null) {
                    const [, num, label, cond, result] = m;
                    lines.push(`${num}. **${label.trim()}**: ${cond.trim()}, resultando em ${result.trim().toLowerCase()}.`);
                }
                if (lines.length < 2) return match;
                return `\n\n${title.trim()}:\n\n${lines.join('\n')}\n\n`;
            });
        };

        // Rede de segurança: nenhum bloco ```...``` legítimo é esperado neste tipo de conteúdo
        // (aula de EBD, não código) — qualquer cerca sobrevivente é sempre um esquema/ASCII-art
        // disfarçado (ex: caixa desenhada com +----+ e |...|), então é removida por completo.
        const stripCodeFences = (text) => text.replace(/```[\s\S]*?```/g, '').replace(/\n{3,}/g, '\n\n');

        // Rede de segurança: converte qualquer tabela markdown restante (fora de cerca de código,
        // formato | Col1 | Col2 | com linha separadora |---|---|) em lista numerada legível.
        const detableify = (text) => {
            const lines = text.split('\n');
            const out = [];
            const isPipeRow = (l) => /^\s*\|.*\|\s*$/.test(l);
            const isSepRow = (l) => /^\s*\|(\s*:?-{2,}:?\s*\|)+\s*$/.test(l);
            const splitCells = (l) => l.split('|').map(c => c.trim()).filter((c, idx, arr) => !(idx === 0 && c === '') && !(idx === arr.length - 1 && c === ''));
            let i = 0;
            while (i < lines.length) {
                const line = lines[i];
                if (isPipeRow(line) && i + 1 < lines.length && isSepRow(lines[i + 1])) {
                    const headerCells = splitCells(line);
                    let j = i + 2;
                    const dataRows = [];
                    while (j < lines.length && isPipeRow(lines[j])) {
                        dataRows.push(splitCells(lines[j]));
                        j++;
                    }
                    if (dataRows.length >= 1 && headerCells.length >= 2) {
                        const restHeaders = headerCells.slice(1);
                        const listLines = dataRows.map((cells, idx) => {
                            const label = (cells[0] || '').replace(/\*\*/g, '').trim();
                            const parts = restHeaders.map((h, hi) => `${h}: ${(cells[hi + 1] || '').replace(/\*\*/g, '').trim()}`);
                            return `${idx + 1}. **${label}** — ${parts.join('; ')}.`;
                        });
                        out.push(...listLines);
                        i = j;
                        continue;
                    }
                }
                out.push(line);
                i++;
            }
            return out.join('\n');
        };

        // Sanitização de Metalinguagem: remove qualquer vazamento acidental de termos internos de instrução
        let sanitizedText = detableify(stripCodeFences(desflowchartify(successResponse)))
            .replace(/(###?\s*)?O\s+EFEITO\s+["'“”]?AH!?\s*ENTENDI!?["'“”]?\s*:\s*/gi, '$1')
            .replace(/(###?\s*)?EFEITO\s+["'“”]?AH!?\s*ENTENDI!?["'“”]?\s*:\s*/gi, '$1')
            .replace(/["'“”]?EFEITO\s+AH!?\s*ENTENDI!?["'“”]?/gi, '')
            .replace(/\bPADRÃO\s+OURO\s*:\s*/gi, '')
            .replace(/\bMETRADO\s+RESTRITO\s*:\s*/gi, '')
            // Correção onomástica de segurança (ex: modelo confundindo Zaqueu com Zacarias em Lc 19 / cobrador de impostos)
            .replace(/\bZacarias(,\s*(?:o\s+)?(?:publicano|cobrador\s+de\s+impostos))/gi, 'Zaqueu$1')
            .replace(/\bZacarias(\s*,?\s*ao\s+receber\s+a\s+salvação\s+em\s+sua\s+casa)/gi, 'Zaqueu$1')
            .replace(/\bZacarias(\s*,?\s*que\s+subiu\s+na\s+(?:figueira|árvore))/gi, 'Zaqueu$1')
            .replace(/\bZacarias(\s*,?\s*(?:devolveu|restituiu|devolveria|restituiria)\s+quatro\s+vezes)/gi, 'Zaqueu$1')
            .replace(/\bZacarias(\s*\(?\s*Lc(?:as)?\.?\s*19)/gi, 'Zaqueu$1');

        return response.status(200).json({ 
            text: sanitizedText, 
            rotationLog: triedKeysLog,
            poolTotal: uniqueKeys.length 
        });
    } else {
        const triedCount = triedKeysLog.length;
        const totalKeys = uniqueKeys.length;
        const remainingCandidateCount = candidateKeys.length - triedCount;

        return response.status(503).json({ 
            error: `Tentamos ${triedCount} chaves neste ciclo. Último status: ${lastError?.message || 'TIMEOUT/COTA'}.`, 
            rotationLog: triedKeysLog,
            failedKeyHashes: failedHashes,
            canClientRetry: remainingCandidateCount > 0 || excludedSet.size < totalKeys,
            remainingKeysCount: Math.max(0, remainingCandidateCount),
            poolTotal: totalKeys
        });
    }
  } catch (error) {
    console.error("Critical Server Error:", error);
    return response.status(500).json({ error: 'Erro interno crítico no servidor de IA.' });
  }
}
