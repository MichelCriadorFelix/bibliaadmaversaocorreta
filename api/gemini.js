import { GoogleGenAI } from "@google/genai";

/**
 * CONFIGURAÇÃO PARA VERCEL SERVERLESS FUNCTIONS - v118.0 LOAD BALANCER EDITION
 * Motor calibrado para Gemini 3 Flash Preview com Thinking Budget máximo (24k).
 * Versão v118.0: Implementação de Rotação Aleatória (Shuffle) para suporte a múltiplas abas simultâneas.
 */
export const config = {
  maxDuration: 300, 
};

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
    // --- GESTÃO DE POOL DE CHAVES (LOAD BALANCER v125 - RESILIENTE) ---
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

    // 1. DEDUPLICAÇÃO CIRÚRGICA DE CHAVES
    const uniqueKeys = Array.from(new Set(rawKeys.map(k => k.trim()))).filter(k => k.length > 10);

    if (uniqueKeys.length === 0) {
         return response.status(500).json({ 
             error: 'CONFIGURAÇÃO PENDENTE: Nenhuma Chave de API válida encontrada no ambiente.' 
         });
    }

    // 2. CIRCUITO BREAKER AUTO-RECUPERÁVEL
    if (!global.exhaustedKeys) {
        global.exhaustedKeys = new Map();
    }

    // Limpeza de expirações passadas
    const now = Date.now();
    for (const [key, expireTime] of global.exhaustedKeys.entries()) {
        if (now > expireTime) {
            global.exhaustedKeys.delete(key);
        }
    }

    // Se todas foram marcadas como esgotadas no passado, reseta para não travar a aplicação
    let healthyActiveKeys = uniqueKeys.filter(key => !global.exhaustedKeys.has(key));
    if (healthyActiveKeys.length === 0) {
        global.exhaustedKeys.clear();
        healthyActiveKeys = [...uniqueKeys];
    }

    // 3. SHUFFLE ROTATION (Garante distribuição de carga em multi-abas e restarts Vercel)
    const shuffledHealthy = [...healthyActiveKeys];
    for (let i = shuffledHealthy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledHealthy[i], shuffledHealthy[j]] = [shuffledHealthy[j], shuffledHealthy[i]];
    }

    const orderedKeysToTry = [...shuffledHealthy];

    let body = request.body;
    if (typeof body === 'string') {
        try {
            body = JSON.parse(body);
        } catch (e) {
            return response.status(400).json({ error: 'Corpo JSON inválido.' });
        }
    }

    const { prompt, schema, taskType, book, chapter, depthLevel, targetPages, thinkingLevel } = body || {};
    if (!prompt) return response.status(400).json({ error: 'O Prompt é obrigatório.' });

    let lastError = null;
    let successResponse = null;
    const triedKeysLog = [];

    // Tenta as chaves na ordem escalonada (Round-Robin) para esta requisição específica
    for (const apiKey of orderedKeysToTry) {
        const maskedKey = apiKey.substring(0, 10) + '...' + apiKey.substring(apiKey.length - 4);
        triedKeysLog.push({ key: maskedKey, name: `API_KEY (Fim ${apiKey.slice(-4)})`, status: 'TENTANDO' });
        try {
            const ai = new GoogleGenAI({ 
                apiKey: apiKey,
                httpOptions: {
                    headers: {
                        'User-Agent': 'aistudio-build',
                    }
                }
            });
            
            let systemInstruction = "Você é o Professor Michel Felix, teólogo Pentecostal Clássico e Erudito.";
            let enhancedPrompt = prompt;

            // --- LÓGICA DE BUSCA RÁPIDA (NOVO v119.0) ---
            if (taskType === 'assistente_chat') {
                systemInstruction = "Você é um buscador bíblico ultrarrápido. Retorne apenas os dados solicitados em JSON, sem explicações longas.";
            }
            // --- GERADOR DE VERSÍCULOS BÍBLICOS DETALHADO (NOVO v124.0) ---
            else if (taskType === 'get_bible_verses') {
                systemInstruction = "Você é um servo e gerador extremamente fiel dos textos da Bíblia Sagrada na tradução ACF (Almeida Corrigida Fiel). Forneça todos os versículos do capítulo solicitado no livro especificado sob formato de array JSON contendo número do versículo e texto de cada versículo. Seja extremamente fiel à ortografia e redação da ACF em português brasileiro, mantendo exatamente o número correto de versículos do capítulo e os textos originais, sem cortes ou paráfrase.";
            }
            // --- LÓGICA DE BUSCA DE FONTES PRIMÁRIAS (NOVO v120.0) ---
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
            // --- LÓGICA ESPECÍFICA PARA MANUAL DO PROFESSOR (NOVO v123.0 - CIRÚRGICO) ---
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
            // --- LÓGICA DE QUIZ (NOVO v105 - BLINDAGEM ANTI-ALUCINAÇÃO) ---
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
            // --- LÓGICA DE DICIONÁRIO (FONTE PRIMÁRIA + EXEGESE CONTEXTUAL + LINGUAGEM CLARA) ---
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
            // --- LÓGICA DE EBD TEMÁTICA (SÉRIE OURO - APOSTILA DIDÁTICA PREMIUM v117.0 PhD IMPLÍCITO) ---
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

                    --- DIRETRIZES DE LINGUAGEM E TOM (CRÍTICO v117.0 - CLAREZA TOTAL) ---
                    1. PROIBIÇÃO DE ARCAÍSMOS E PALAVRAS DIFÍCEIS: É ESTRITAMENTE PROIBIDO usar palavras antigas, pouco usuais, jargões acadêmicos desnecessários ou frases cerimoniais. Nossos alunos são humildes e precisam de clareza absoluta.
                       - PROIBIDO: "Inefável", "Outrossim", "Destarte", "Profundo temor e reverência", "Exórdio", "Conspícuo", "Nesta magna ocasião", "Perscrutar", "Idiossincrasia", "Escatológico" (sem explicar).
                       - PERMITIDO: Português claro, moderno, direto, robusto, universitário porém acessível (Nível B2 máximo). Se uma palavra for difícil até para um professor ler em voz alta, NÃO A USE. Substitua por um sinônimo simples.
                    
                    2. TERMOS TÉCNICOS E GLOSSÁRIO INTERATIVO (OBRIGATÓRIO): Sempre que usar um termo técnico, teológico, ou uma palavra em português que seja difícil ou pouco comum (ex: "Hipóstase", "Ontológico", "Perscrutar", "Niilismo"), você DEVE OBRIGATORIAMENTE envolver a palavra e sua explicação simples no seguinte formato exato: [[Palavra|Explicação simples e didática]].
                       - Exemplo: "...isso configura uma [[Teofania|uma aparição visível de Deus no Antigo Testamento]]..."
                       - Exemplo: "...o estudo do ser humano exige que olhemos para o fundamento [[ontológico|relativo à natureza do ser, àquilo que o ser humano essencialmente é]] da nossa existência."
                       - USE ESSE RECURSO ABUNDANTEMENTE PARA FACILITAR A COMPREENSÃO.

                    3. ZERO SAUDAÇÕES RELIGIOSAS (TEXTO DIRETO): 
                       - NÃO comece com "A Paz do Senhor", "Saudações", "Amados irmãos", "É com prazer" ou introduções solenes longas. 
                       - Vá direto ao assunto acadêmico/histórico/teológico do primeiro tópico. O aluno quer aprender conteúdo bruto e profundo.

                    4. IDENTIDADE TEOLÓGICA IMPLÍCITA (CÉREBRO PhD PENTECOSTAL): 
                       - Pense, estruture e argumente como um Pentecostal Clássico e Arminiano Erudito (PhD).
                       - MAS JAMAIS escreva "Nós pentecostais", "Como arminianos", "Nossa denominação", "Nossa teologia", "Como PhD", "Minha tese" or use esses rótulos explicitamente. 
                       - A teologia deve ser a base invisível e natural do argumento, percebida pela força da exposição bíblica (Sola Scriptura).
                       - O aluno deve sentir a firmeza doutrinária sem precisar ler o rótulo da doutrina.

                    5. CLAREZA COM PROFUNDIDADE (EFEITO "AH! ENTENDI!"): 
                       - O texto deve ser denso e detalhado (nível doutorado).
                       - MAS explicado de forma que qualquer aluno (do jovem ao idoso) entenda perfeitamente. 
                       - Evite o academicismo estéril. O objetivo é a compreensão total.

                    --- DIRETRIZES DE COMANDO DO USUÁRIO (O QUE ENSINAR) ---
                    O prompt do usuário contém a EMENTA OBRIGATÓRIA ou a aula atual a ser atualizada. Siga rigorosamente os tópicos existentes, adaptando o tamanho para atingir exatamente a meta de ${baseWordCount} palavras (${pages} páginas).

                    --- REGRA DE OURO DE ENUMERAÇÃO (CRÍTICO) ---
                    JAMAIS faça listas em linha (ex: "A, B e C"). 
                    Crie listas numeradas (1., 2., 3...) com parágrafos explicativos claros para cada item.

                    --- ESTRUTURA PADRONIZADA ---
                    
                    1. TÍTULO DO TEMA (Use # TÍTULO em Maiúsculo).
                    2. INTRODUÇÃO (Contextualize o problema histórico, a relevância atual e a tese central).
                    3. DESENVOLVIMENTO (Use ## TÍTULO DO TÓPICO e ### SUBTÓPICOS).
                    4. APLICAÇÃO PRÁTICA (Passos práticos enumerados e claros).
                    5. CONCLUSÃO (Solene, Apelativa e Resumitiva, focada na glória de Deus e na prática).
                `;
                
                if (taskType === 'upgrade_thematic_ebd') {
                    enhancedPrompt = `[PROTOCOLO DE UPGRADE DE APOSTILA TEMÁTICA SÉRIE OURO - ALVO RESTRITO: EXATAMENTE ${wordCountTarget} PALAVRAS (${pages} PÁGINAS)]:
                    Analise e reescreva a seguinte apostila existente, elevando sua densidade acadêmica e enriquecendo a explicação.
                    CRÍTICO: Você DEVE aplicar rigorosamente as regras de Glossário, Tradição e Fontes Primárias, MANTENDO O TEXTO RIGOROSAMENTE DENTRO DA META DE ${wordCountTarget} PALAVRAS. Compacte o que já existe se for necessário, enxugue prolixidades.
                    
                    APOSTILA ATUAL:
                    """
                    ${prompt}
                    """
                    
                    INSTRUÇÕES FINAIS DE RENDERIZAÇÃO:
                    - Comece com o TÍTULO em letras maiúsculas (Use #).
                    - Atualize o conteúdo existente. COMPACTE as partes redundantes ou prolixas OBRIGATORIAMENTE para garantir que o tamanho final fique entre ${minWords} e ${maxWords} palavras.
                    - NÃO USE SAUDAÇÕES. VÁ DIRETO AO CONTEÚDO.
                    - CITE A BÍBLIA CONSTANTEMENTE.
                    - SEJA RIGOROSO NO METRADO: O texto FINAL DEVE ter entre ${minWords} e ${maxWords} palavras. NUNCA exceda ${maxWords} palavras!`;
                } else {
                    enhancedPrompt = `[GERAR APOSTILA DIDÁTICA SÉRIE OURO - ALVO RÍGIDO: ${wordCountTarget} PALAVRAS (${pages} PÁGINAS)]:
                    
                    EMENTA/TÓPICOS OBRIGATÓRIOS DEFINIDOS PELO RESPONSÁVEL:
                    "${prompt}"
                    
                    INSTRUÇÕES FINAIS DE RENDERIZAÇÃO:
                    - Comece com o TÍTULO em letras maiúsculas (Use #).
                    - Siga rigorosamente a ementa acima, gerando uma aula completa de nível PhD, MAS OBRIGATORIAMENTE RESTRITA AO INTERVALO DE ${wordCountTarget} PALAVRAS.
                    - NÃO USE SAUDAÇÕES. VÁ DIRETO AO CONTEÚDO.
                    - CITE A BÍBLIA CONSTANTEMENTE.
                    - SEJA RIGOROSO NO METRADO: O texto FINAL DEVE ter entre ${minWords} e ${maxWords} palavras. NUNCA exceda ${maxWords} palavras.`;
                }
            }
            // --- LÓGICA PARA CONTEÚDO DO ALUNO (PADRÃO - EBD PANORAMA) ---
            else if (taskType === 'ebd' || taskType === 'upgrade_ebd') {
                let depthInstruction = "";
                const pages = targetPages ? parseInt(targetPages) : 3;
                const baseWordCount = pages * 600; // 600 palavras por página real (padrão de diagramação)
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

                // --- LÓGICA DE INTRODUÇÃO SELETIVA (100% FIEL AO PEDIDO DO ADMIN) ---
                const introInstruction = (chapter === 1) 
                    ? "2. INTRODUÇÃO GERAL:\n           Texto rico contextualizando O LIVRO (autor, data, propósito) e o cenário deste primeiro capítulo."
                    : `2. INTRODUÇÃO DO CAPÍTULO:\n           FOCAR EXCLUSIVAMENTE no contexto imediato do capítulo ${chapter}. NÃO repita a introdução geral do livro de ${book} (autoria, data, etc), pois já foi dado nos capítulos anteriores. Vá direto ao ponto do enredo atual.`;

                // --- WRITING STYLE PROFESSOR MICHEL FELIX (ESTRUTURA SUPREMA ADMA v81.0 + v82.0 / v113.0 INJECTION) ---
                const WRITING_STYLE = `
        ATUE COMO: Professor Michel Felix.
        PERFIL: Teólogo Erudito, Acadêmico, Profundo e Conservador.
        
        INSTRUÇÃO DE PROFUNDIDADE: ${depthInstruction}

                    --- PROTOCOLO PÉROLA DE OURO (v113.0 ATUALIZADO - IMPERIAL GOLD) ---
                    1. DENSIDADE MULTIDIMENSIONAL: Traga a interpretação com contexto histórico, cultural, explicações de expressões, linguística, tipologia textual, geográfico, tradição judaica (Torá SheBeal Pe, Midrash, Talmud, e outros), documentos históricos contemporâneos, medidas e moedas. Se houver paralelos detalhados com essas interpretações, traga-os de forma elencada.
                    2. RIGOR DOCUMENTAL (v113.0): É MANDATÓRIO e OBRIGATÓRIO citar fontes periciais para fundamentar as Pérolas de Ouro. SEMPRE que citar qualquer historiador (Josefo, Philo, Eusébio), a tradição judaica (Talmud, Mishná, Midrash), ou documentos da antiguidade, você DEVE OBRIGATORIAMENTE usar o formato interativo de 3 partes: {{Autor ou Obra | Referência Visível | Comando Oculto para o Bibliotecário}}. 
                       - Exemplo Correto: {{Flávio Josefo | Antiguidades 18.3 | Traga o trecho exato que descreve Pôncio Pilatos introduzindo os estandartes em Jerusalém}}.
                       - Exemplo Correto: {{Talmud | Tratado Hagigah 12a | Traga o comentário sobre a criação e os céus}}.
                       - Exemplo Correto: {{Midrash Tanhuma | Bereshit 1 | Traga o comentário sobre a luz da criação}}.
                       - É ESTRITAMENTE PROIBIDO citar essas fontes em texto plano sem usar as chaves duplas {{ }}.
                    3. RIGOR HISTÓRICO E HONESTIDADE INTELECTUAL (CRÍTICO): Use as fontes primárias APENAS para elucidar o contexto histórico, cultural ou linguístico. É ESTRITAMENTE PROIBIDO forçar a fonte a endossar a sua teologia ou usar anacronismos (ex: dizer que Josefo refutava o gnosticismo). Deixe a fonte falar por si mesma, mesmo que a visão dela seja diferente da nossa. A Pérola de Ouro serve para trazer robustez histórica, não para validar forçadamente o seu argumento.
                    4. MENÇÕES SEM CITAÇÃO: Se você for APENAS MENCIONAR um autor ou obra, sem fazer uma citação específica de um texto, NÃO use o formato {{ }}. Em vez disso, use o formato de Glossário: [[Flávio Josefo | Historiador judeu do século I...]].
                    5. INTEGRAÇÃO CONTEXTUAL (v113.0): O termo anteriormente chamado de "EXEGESE MICROSCÓPICA E EXPANSÃO DO CONTEXTO" agora deve ser referenciado como "PÉROLA DE OURO" para identificar insights periciais profundos. 
                    6. INJEÇÃO IN-LINE (v113.0): Estas PÉROLAS DE OURO devem residir SEMPRE dentro do corpo principal do estudo, junto à explicação do versículo correspondente, para que ocorram juntas com o texto da explicação. Inicie o insight com o prefix "**PÉROLA DE OURO:**" em negrito para destaque.
                    7. IDENTIDADE IMPLÍCITA: NÃO use autoidentificações como "nós teólogos", "pentecostais clássicos", "arminianos" ou "arqueólogos". Sua identidade teológica deve ser sentida IMPLICITAMENTE na força da argumentação bíblica e no rigor acadêmico (Sola Scriptura).
        6. FILTRAGEM DE REPETIÇÃO: Não fique mencionando o episódio de 1 Samuel 28 a menos que o versículo seja sobre o tema ou indispensável para a doutrina.
        7. SELAGEM FINAL: As seções "### TIPOLOGIA: CONEXÃO COM JESUS CRISTO" e "### CURIOSIDADES E ARQUEOLOGIA" são o encerramento absoluto. Nada deve ser escrito após elas.
        8. EMBASAMENTO BÍBLICO OBRIGATÓRIO (CRÍTICO): Toda afirmação teológica, doutrinária ou histórica DEVE ser imediatamente seguida de sua base bíblica entre parênteses no meio do texto. Exemplo: "A morte física é a separação entre alma e corpo (Tiago 2:26; Eclesiastes 12:7)." NÃO crie listas de referências no final dos tópicos. As referências devem fluir natural e elegantemente dentro dos parágrafos, logo após a afirmação.

        --- MANDATO DE VOLUME EXATO E RESTRITO (${pages} PÁGINAS = ${wordCountTarget} PALAVRAS) ---
        ${isUpgrade ? `1. VOLUME RIGOROSO NO UPGRADE (ALVO ABSOLUTO: ENTRE ${minWords} E ${maxWords} PALAVRAS): O usuário definiu rigorosamente ${pages} páginas (~${baseWordCount} palavras). Não expanda desenfreadamente.
        2. ATUALIZAÇÃO CIRÚRGICA: Mantenha o texto existente e aplique atualizações pontuais (glossários [[Termo|Explicação]], referências {{Autor|Ref|Busca}} e pérolas de ouro). Se a aula já for longa, COMPACTE e enxugue parágrafos redundantes para manter o tamanho estritamente dentro da faixa de ${wordCountTarget} palavras.
        3. QUOTA FINAL PERMITIDA: O texto final NUNCA deve ultrapassar ${maxWords} palavras totais e nem ficar abaixo de ${minWords} palavras.` : `1. VOLUME RIGOROSO NA CRIAÇÃO (ALVO ABSOLUTO: ENTRE ${minWords} E ${maxWords} PALAVRAS): O usuário selecionou ${pages} páginas (~${baseWordCount} palavras). Planeje o tamanho do texto estruturalmente para respeitar este limite com precisão cirúrgica.
        2. QUOTA FINAL PERMITIDA: O texto final completo NUNCA deve ultrapassar ${maxWords} palavras totais e nem ficar abaixo de ${minWords} palavras.`}
        3. INTEGRALIDADE ACADÊMICA: Cubra os versículos do capítulo de forma proporcional ao espaço disponível. Não omita a conclusão nem deixe seções cortadas.

        --- BLINDAGEM ANTI-HERESIA SUPREMA (100% OBRIGATÓRIO) ---
        - 1 SAMUEL 28 (NECROMANCIA): Samuel NÃO voltou pelo poder da médium. Ensine que ou foi uma personificação demoníaca permitida por Deus ou uma intervenção soberana direta para juízo, NUNCA validando a consulta aos mortos.
        - LUCAS 16:26 (O GRANDE ABISMO): Mantenha a separação intransponível entre o mundo dos mortos e dos vivos. O mundo espiritual é inacessível para consultas humanas.
        - Defenda a Ortodoxia Conservadora e Pentecostal Clássica sem usar esses rótulos.

        --- OBJETIVO SUPREMO: O EFEITO "AH! ENTENDI!" (CLAREZA E PROFUNDIDADE) ---
        1. LINGUAGEM: O texto deve ser PROFUNDO, mas EXTREMAMENTE CLARO. O aluno (seja jovem ou idoso) deve ler e entender instantaneamente. Nossos alunos são humildes e precisam de clareza absoluta.
        2. VOCABULÁRIO: É ESTRITAMENTE PROIBIDO usar palavras antigas, pouco usuais, jargões acadêmicos desnecessários ou frases cerimoniais. 
           - PROIBIDO: "Inefável", "Outrossim", "Destarte", "Profundo temor e reverência", "Exórdio", "Conspícuo", "Nesta magna ocasião", "Perscrutar", "Idiossincrasia", "Escatológico" (sem explicar).
           - PERMITIDO: Português claro, moderno, direto, robusto, universitário porém acessível (Nível B2 máximo). Se uma palavra for difícil até para um professor ler em voz alta, NÃO A USE. Substitua por um sinônimo simples.
        3. TERMOS TÉCNICOS E GLOSSÁRIO INTERATIVO (OBRIGATÓRIO): Sempre que usar um termo técnico, teológico, ou uma palavra em português que seja difícil ou pouco comum (ex: "Hipóstase", "Ontológico", "Perscrutar", "Niilismo"), você DEVE OBRIGATORIAMENTE envolver a palavra e sua explicação simples no seguinte formato exato: [[Palavra|Explicação simples e didática]].
           - Exemplo: "...isso configura uma [[Teofania|uma aparição visível de Deus no Antigo Testamento]]..."
           - Exemplo: "...o estudo do ser humano exige que olhemos para o fundamento [[ontológico|relativo à natureza do ser, àquilo que o ser humano essencialmente é]] da nossa existência."
           - USE ESSE RECURSO ABUNDANTEMENTE PARA FACILITAR A COMPREENSÃO.

        --- PROTOCOLO DE SEGURANÇA TEOLÓGICA E DIDÁTICA (NÍVEL MÁXIMO - IMPLÍCITO) ---
        1. A BÍBLIA EXPLICA A BÍBLIA: Antes de formular o comentário, verifique MENTALMENTE e RIGOROSAMENTE o CONTEXTO IMEDIATO (capítulo) e o CONTEXTO REMOTO (livros históricos paralelos, profetas contemporâneos, Novo Testamento) para garantir a coerência.
        2. PRECISÃO CRONOLÓGICA E CONTEXTUAL: Ao explicar, evite anacronismos (ex: confundir reis, datas ou eventos que ainda não ocorreram na narrativa).

        3. DIDÁTICA DOS TEXTOS POLÊMICOS E DIFÍCEIS:
           - É EXCELENTE, DIDÁTICO e RECOMENDADO citar as principais correntes interpretativas divergentes para enriquecer a cultura do aluno (ex: "Alguns teólogos históricos interpretam como X, outros como Y...").
           - CONTUDO, você deve OBRIGATORIAMENTE concluir defendendo a interpretação Ortodoxa e Biblicamente coerente.
        
        --- METODOLOGIA DE ENSINO ---
        1. EXPLICAÇÃO CONTEXTUALIZADA: Agrupe os versículos em blocos temáticos claros e explique-os com profundidade proporcional ao tamanho de páginas solicitado.
        2. PROIBIDO TRANSCREVER O TEXTO BÍBLICO: O aluno já tem a Bíblia. NÃO escreva o versículo por extenso. Cite apenas a referência e vá direto para a EXPLICAÇÃO.

        --- IDIOMAS ORIGINAIS E ETIMOLOGIA (INDISPENSÁVEL) ---
        1. PALAVRAS-CHAVE: Cite os termos originais (Hebraico no AT / Grego no NT) transliterados quando enriquecer o texto.
        2. SIGNIFICADOS DE NOMES: Traga o significado etimológico de nomes de pessoas e lugares chave.

        --- ESTRUTURA VISUAL OBRIGATÓRIA (BASEADA NO MODELO ADMA VIA MARKDOWN) ---
        1. TÍTULO PRINCIPAL (OBRIGATÓRIO O USO DE HEADER NÍVEL 1 '# '):
           # PANORÂMA BÍBLICO - ${book ? book.toUpperCase() : 'BÍBLIA'} ${chapter || ''} (PROF. MICHEL FELIX)

        ${introInstruction}

        3. TÓPICOS DO ESTUDO (OBRIGATÓRIO USO DE Numeração 1., 2., 3... E HEADER NÍVEL 2 '## '):
           Exemplo:
           ## 1. TÍTULO DO TÓPICO EM MAIÚSCULO (Referência: Gn X:Y-Z)
           (Aqui entra a explicação detalhada do bloco de versículos. NÃO COPIE O TEXTO BÍBLICO, APENAS EXPLIQUE).
           (INTEGRE AQUI A **PÉROLA DE OURO:** PARA ESTE TRECHO - PROTOCOLO v113.0 INTEGRADO CONTEXTUALMENTE COM FONTES RASTREÁVEIS).

        4. SEÇÕES FINAIS OBRIGATÓRIAS (SELAGEM ABSOLUTA):
           ### TIPOLOGIA: CONEXÃO COM JESUS CRISTO
           (Liste de forma enumerada se houver múltiplos pontos, ou texto corrido).

           ### CURIOSIDADES E ARQUEOLOGIA
           (OBRIGATÓRIO: Liste todos os itens de forma numerada 1., 2., 3., etc).

        --- INSTRUÇÕES DE PAGINAÇÃO ---
        1. Volume Total: EXATAMENTE ${pages} páginas (~${baseWordCount} palavras, intervalo: ${wordCountTarget} palavras).
        2. Insira <hr class="page-break"> entre os tópicos principais para dividir as páginas.
        `;
                systemInstruction = WRITING_STYLE;
                if (isUpgrade) {
                    enhancedPrompt = `[UPGRADE CIRÚRGICO RESTRITO - ALVO EXATO: ${wordCountTarget} PALAVRAS (${pages} PÁGINAS)]: 
                    Antes de emitir o texto, use seu raciocínio para checar:
                    1. A estrutura da aula já existe. Mantenha os acertos do conteúdo existente e ATUALIZE pontualmente (formatação, glossários [[Termo|Definição]], fontes {{Autor|Ref|Comando}} e pérolas de ouro).
                    2. NÃO FAÇA UM TEXTO NOVO DO ZERO NEM EXPANDA DESMEDIDAMENTE! O objetivo é atualizar, enriquecer e formatar.
                    3. O volume total É RIGOROSAMENTE LIMITADO a ${wordCountTarget} palavras (${pages} páginas). Se a aula original for longa, ENXUGUE o texto e compacte prolixidades para que o total final permaneça estritamente entre ${minWords} e ${maxWords} palavras.
                    4. Injetou o Glossário interativo em formato [[Palavra|Explicação didática]]?
                    5. Injetou a Pérola de Ouro (Josefo, Talmud, etc) DENTRO de cada tópico?
                    6. As curiosidades estão numeradas e a selagem final está presente?
                    
                    Reescreva e aprimore a seguinte aula existente do aluno. ATENÇÃO: SEJA PRECISO NO METRADO E NÃO EXCEDA ${maxWords} PALAVRAS!
                    
                    AULA ATUAL (REESCREVA MANTENDO CONCISÃO E ADEQUAÇÃO AO TAMANHO):
                    """
                    ${prompt}
                    """`;
                } else {
                    enhancedPrompt = `[MANDATO DE VOLUME RIGOROSO - ALVO EXATO: ${wordCountTarget} PALAVRAS (${pages} PÁGINAS)]: 
                    Antes de emitir o texto, use seu raciocínio para calibrar o volume:
                    1. O volume total é RIGOROSAMENTE limitado ao intervalo de ${wordCountTarget} palavras. Pare a geração de detalhes excessivos e sintetize se perceber que vai ultrapassar ${maxWords} palavras.
                    2. Cubra os versículos do capítulo de forma proporcional dentro da meta exata de ${pages} páginas.
                    3. Injetou a Pérola de Ouro (Josefo, Talmud, etc) DENTRO de cada tópico?
                    4. Injetou referências bíblicas no meio dos parágrafos?
                    5. As curiosidades estão numeradas?
                    6. A selagem final (Tipologia/Arqueologia) está presente no fim do texto?`;
                }
            }

            // Normalizador Seguro de ThinkingConfig para Gemini 3.7 Flash (thinkingBudget em tokens)
            const getThinkingConfig = (lvl) => {
                if (!lvl) return { thinkingBudget: 2048 };
                const s = String(lvl).toLowerCase().trim();
                if (s === 'minimal' || s === 'minimo' || s === 'mínimo') return { thinkingBudget: 0 };
                if (s === 'low' || s === 'baixo') return { thinkingBudget: 1024 };
                if (s === 'medium' || s === 'medio' || s === 'médio' || s === 'padrao' || s === 'padrão') return { thinkingBudget: 2048 };
                if (s === 'high' || s === 'maximo' || s === 'máximo' || s === 'profundo') return { thinkingBudget: 4096 };
                return { thinkingBudget: 2048 };
            };

            // Seleção de Modelo Unificada: Gemini 3.7 Flash em 100% das tarefas
            const modelToUse = 'gemini-3.7-flash';

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

            // Configuração precisa de thinkingConfig e maxOutputTokens com budget controlado
            if (taskType === 'ebd' || taskType === 'teacher_ebd' || taskType === 'thematic_ebd' || taskType === 'upgrade_ebd' || taskType === 'upgrade_teacher_ebd' || taskType === 'upgrade_thematic_ebd') {
                config.maxOutputTokens = 16384;
                config.thinkingConfig = getThinkingConfig(thinkingLevel);
            } else if (taskType === 'quiz_gen') {
                config.maxOutputTokens = 4096;
                config.thinkingConfig = { thinkingBudget: 1024 };
            } else if (taskType === 'dictionary' || taskType === 'commentary') {
                config.maxOutputTokens = 8192;
                config.thinkingConfig = { thinkingBudget: 1024 };
            } else {
                config.maxOutputTokens = 8192;
                config.thinkingConfig = { thinkingBudget: 0 };
            }

            if (schema) {
                config.responseMimeType = "application/json";
                config.responseSchema = schema;
            }

            const aiResponse = await ai.models.generateContent({
                model: modelToUse,
                contents: [{ parts: [{ text: enhancedPrompt }] }],
                config: config
            });

            if (!aiResponse.text) {
                throw new Error("A IA retornou uma resposta vazia.");
            }

            successResponse = aiResponse.text;
            triedKeysLog[triedKeysLog.length - 1].status = 'SUCESSO';
            break; 

        } catch (error) {
            lastError = error;
            const msg = error.message || '';
            triedKeysLog[triedKeysLog.length - 1].status = 'FALHA: ' + msg.substring(0, 120);
            
            // Registra cota atingida no Circuito com cooldown curto de 45 segundos
            if (msg.includes('429') || msg.includes('Quota') || msg.includes('exhausted') || msg.includes('RESOURCE_EXHAUSTED')) {
                let cooldownMs = 45000;
                const retryMatch = msg.match(/retry in ([\d.]+)s/);
                if (retryMatch) {
                    const secs = parseFloat(retryMatch[1]);
                    if (!isNaN(secs)) cooldownMs = (secs * 1000) + 1000;
                }
                global.exhaustedKeys.set(apiKey, Date.now() + cooldownMs);
            } else if (msg.includes('API key not valid')) {
                // Apenas chave inexistente/revogada
                global.exhaustedKeys.set(apiKey, Date.now() + (30 * 60 * 1000));
            }

            continue;
        }
    }

    if (successResponse) {
        return response.status(200).json({ text: successResponse, rotationLog: triedKeysLog });
    } else {
        const triedCount = triedKeysLog.length;
        const totalKeys = uniqueKeys.length;
        return response.status(500).json({ 
            error: `Falha na geração v118.0: Tentamos ${triedCount} de ${totalKeys} chaves disponíveis, mas todas falharam. Último erro: ${lastError?.message || 'Erro desconhecido.'}`, 
            rotationLog: triedKeysLog 
        });
    }
  } catch (error) {
    console.error("Critical Server Error:", error);
    return response.status(500).json({ error: 'Erro interno crítico no servidor de IA v118.0.' });
  }
}
