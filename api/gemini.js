import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

/**
 * CONFIGURAÇÃO PARA VERCEL SERVERLESS FUNCTIONS - LOAD BALANCER & TIMEOUT RESILIENT
 * Motor calibrado para Gemini 3.7 Flash com Thinking Budget e compartilhamento de estado via Supabase.
 */
export const config = {
  maxDuration: 300,
};

// Os 27 livros do Novo Testamento (grego) — usado para decidir se é seguro reduzir o
// thinkingLevel do dicionário (só é seguro no Antigo Testamento, onde não existe a divergência
// Textus Receptus x Nestle-Aland que existe no Novo Testamento grego).
const NEW_TESTAMENT_BOOKS = new Set([
    'mateus', 'marcos', 'lucas', 'joão', 'joao', 'atos', 'romanos',
    '1 coríntios', '1 corintios', '2 coríntios', '2 corintios',
    'gálatas', 'galatas', 'efésios', 'efesios', 'filipenses', 'colossenses',
    '1 tessalonicenses', '2 tessalonicenses', '1 timóteo', '1 timoteo', '2 timóteo', '2 timoteo',
    'tito', 'filemom', 'hebreus', 'tiago',
    '1 pedro', '2 pedro', '1 joão', '1 joao', '2 joão', '2 joao', '3 joão', '3 joao',
    'judas', 'apocalipse',
]);

function isNewTestamentBook(book) {
    if (!book) return true; // sem informação -> assume o caso mais seguro (NT, thinking completo)
    return NEW_TESTAMENT_BOOKS.has(String(book).toLowerCase().trim());
}

/**
 * INTEGRAÇÃO BOLLS.LIFE (bolls.life): busca o texto original REAL e verificado — Textus Receptus
 * (grego, Novo Testamento) e Westminster Leningrad Codex/Texto Masorético (hebraico, Antigo
 * Testamento) — antes de pedir pra IA "lembrar" o versículo de cabeça. API pública, gratuita, sem
 * chave. Resolve o problema descoberto no dicionário: pedir pra IA reconstruir o texto original de
 * memória é inconsistente (às vezes traz o Texto Majoritário certo, às vezes o texto crítico
 * errado, em qualquer nível de raciocínio) — buscar o texto real elimina essa loteria.
 */
const BOLLS_BASE = 'https://bolls.life';

// Ordem canônica dos 66 livros = bookid da bolls.life (índice 0 = bookid 1 = Gênesis).
const BOLLS_BOOK_ORDER = [
    'Gênesis', 'Êxodo', 'Levítico', 'Números', 'Deuteronômio', 'Josué', 'Juízes', 'Rute',
    '1 Samuel', '2 Samuel', '1 Reis', '2 Reis', '1 Crônicas', '2 Crônicas', 'Esdras', 'Neemias',
    'Ester', 'Jó', 'Salmos', 'Provérbios', 'Eclesiastes', 'Cantares', 'Isaías', 'Jeremias',
    'Lamentações', 'Ezequiel', 'Daniel', 'Oséias', 'Joel', 'Amós', 'Obadias', 'Jonas', 'Miquéias',
    'Naum', 'Habacuque', 'Sofonias', 'Ageu', 'Zacarias', 'Malaquias',
    'Mateus', 'Marcos', 'Lucas', 'João', 'Atos', 'Romanos', '1 Coríntios', '2 Coríntios',
    'Gálatas', 'Efésios', 'Filipenses', 'Colossenses', '1 Tessalonicenses', '2 Tessalonicenses',
    '1 Timóteo', '2 Timóteo', 'Tito', 'Filemom', 'Hebreus', 'Tiago', '1 Pedro', '2 Pedro',
    '1 João', '2 João', '3 João', 'Judas', 'Apocalipse',
];
const BOLLS_BOOK_ID_MAP = new Map(
    BOLLS_BOOK_ORDER.map((name, idx) => [
        name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''),
        idx + 1,
    ])
);

function getBollsBookId(book) {
    if (!book) return null;
    const key = String(book).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    return BOLLS_BOOK_ID_MAP.get(key) || null;
}

async function fetchOriginalVerseText(book, chapter, verse) {
    const bookId = getBollsBookId(book);
    if (!bookId || !chapter || !verse) return null;
    const translation = isNewTestamentBook(book) ? 'TR' : 'WLC';
    try {
        const res = await fetch(`${BOLLS_BASE}/get-text/${translation}/${bookId}/${chapter}/?verses=${verse}`, { signal: AbortSignal.timeout(3000) });
        if (!res.ok) return null;
        const arr = await res.json();
        const match = Array.isArray(arr) ? arr.find(v => v.verse === Number(verse)) : null;
        const text = match?.text ? String(match.text).trim() : '';
        if (!text) return null;
        return { translation, text };
    } catch (e) {
        console.warn('[bolls.life] Falha na busca:', e.message);
        return null;
    }
}

/**
 * INTEGRAÇÃO SEFARIA (sefaria.org): busca o texto REAL e autêntico de fontes rabínicas/judaicas
 * (Talmud, Mishná, Midrash Rabbá, Fílon de Alexandria, Zohar) antes de pedir pra IA "lembrar" a
 * citação de memória — reduz o risco de citação inventada (referência errada ou conteúdo que não
 * bate com o que foi citado). API pública, gratuita, sem chave. Cobre a maioria das fontes mais
 * citadas nas Pérolas de Ouro do app (Talmud, Mishná, Midrash, Fílon); Josefo, Pais da Igreja e
 * historiadores clássicos não são cobertos pelo Sefaria e continuam usando o fluxo antigo (a IA
 * busca/lembra por conta própria).
 */
const SEFARIA_BASE = 'https://www.sefaria.org/api';

function parseSourceReferenceFromPrompt(promptText) {
    let text = (promptText || '').trim();
    let hiddenCommand = '';
    const refMatch = text.match(/Refer[êe]ncia:\s*(.+?)(?:\.\s*Instru[çc][ãa]o espec[íi]fica:\s*(.+))?$/i);
    if (refMatch) {
        text = refMatch[1].trim();
        if (refMatch[2]) hiddenCommand = refMatch[2].trim();
    }
    const commaIdx = text.indexOf(',');
    if (commaIdx === -1) return null;
    const source = text.slice(0, commaIdx).trim();
    const reference = text.slice(commaIdx + 1).trim();
    if (!source || !reference) return null;
    return { source, reference, hiddenCommand };
}

function buildSefariaQuery(source, reference) {
    const src = (source || '').toLowerCase();
    const ref = (reference || '').trim();
    if (!ref) return null;

    if (src.includes('talmud') && src.includes('jerusal')) {
        return `Jerusalem Talmud ${ref.replace(/^Tratado\s+/i, '')}`;
    }
    if (src.includes('talmud')) {
        return ref.replace(/^Tratado\s+/i, '');
    }
    if (src.includes('mishná') || src.includes('mishna')) {
        return `Mishnah ${ref.replace(/^Tratado\s+/i, '')}`;
    }
    if (src.includes('midrash') && /tan[hḥ]uma/i.test(src)) {
        // Formato já vem como "ParashaName N" (ex: "Bereshit 1", "Vayishlach 8")
        return `Tanhuma, ${ref}`;
    }
    if (src.includes('midrash') && /rabb?[áa]/i.test(src + ' ' + ref)) {
        const bookMap = {
            'gênesis': 'Bereshit', 'genesis': 'Bereshit',
            'êxodo': 'Shemot', 'exodo': 'Shemot',
            'levítico': 'Vayikra', 'levitico': 'Vayikra',
            'números': 'Bamidbar', 'numeros': 'Bamidbar',
            'deuteronômio': 'Devarim', 'deuteronomio': 'Devarim',
        };
        let clean = ref.replace(/Rabb?[áa]h?/i, '').trim();
        for (const [pt, he] of Object.entries(bookMap)) {
            const re = new RegExp(pt, 'i');
            if (re.test(clean)) { clean = clean.replace(re, he).trim(); break; }
        }
        return `${clean} Rabbah`.replace(/\s+/g, ' ').trim();
    }
    if (src.includes('fílon') || src.includes('filo de') || src.includes('philo')) {
        // Sefaria só reconhece o número do "Book" em algarismo romano (ex: "Book I"), não arábico.
        const toRoman = (n) => ({ 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI' })[n] || String(n);
        const workMap = [
            [/sobre as leis especiais/i, 'On the Special Laws, Book'],
            [/sobre a vida de moisés/i, 'On the Life of Moses, Book'],
            [/sobre a cria[çc][ãa]o/i, 'On the Creation'],
        ];
        for (const [rx, en] of workMap) {
            if (rx.test(ref)) {
                const m = ref.match(/(\d+)[.,:](\d+)/);
                if (!m) return null;
                const needsBookNumber = /Book$/.test(en);
                return needsBookNumber ? `${en} ${toRoman(Number(m[1]))}.${m[2]}` : `${en} ${m[2]}`;
            }
        }
        return null;
    }
    if (src.includes('zohar')) {
        // O Zohar no Sefaria é endereçado por parashá (ex: "Zohar, Emor"), não por volume/fólio —
        // extrai o nome da parashá da referência, ignorando "Volume N," ou números de fólio soltos.
        const parashaMatch = ref.match(/Parashat\s+([A-Za-zÀ-ÿ']+)/i) || ref.match(/^([A-Za-zÀ-ÿ']+)\b/);
        if (!parashaMatch) return null;
        return `Zohar, ${parashaMatch[1]}`;
    }
    if (src.includes('maimônides') || src.includes('maimonides')) {
        // Só cobrimos "Guia dos Perplexos" por enquanto — "Mishneh Torah" usa nomes de seção em
        // hebraico transliterado (ex: "Hilchot Klei HaMikdash") que não batem com os nomes em
        // inglês do Sefaria (ex: "Vessels"), precisaria de um dicionário grande pra mapear direito.
        if (/guia dos perplexos/i.test(ref)) {
            const m = ref.match(/(\d+)[.,:](\d+)/);
            return m ? `Guide for the Perplexed, Part ${m[1]}.${m[2]}` : null;
        }
        return null;
    }
    return null;
}

async function fetchFromSefaria(source, reference) {
    const query = buildSefariaQuery(source, reference);
    if (!query) return null;
    try {
        const nameRes = await fetch(`${SEFARIA_BASE}/name/${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(2000) });
        if (!nameRes.ok) return null;
        const nameData = await nameRes.json();
        if (!nameData.is_ref || !nameData.ref) return null;
        const resolvedRef = nameData.ref;

        const fetchText = async (ref) => {
            const textRes = await fetch(`${SEFARIA_BASE}/v3/texts/${encodeURIComponent(ref)}?version=english`, { signal: AbortSignal.timeout(2000) });
            if (!textRes.ok) return null;
            const textData = await textRes.json();
            return textData?.versions?.[0]?.text || null;
        };

        let raw = await fetchText(resolvedRef);
        // Se o segmento exato não existir, tenta subir um nível (ex: livro/capítulo inteiro).
        // O Sefaria separa o último segmento com "." (Talmud/Mishná) ou espaço (Fílon/Josefo-like).
        if (!raw && /[.\s]\d+$/.test(resolvedRef)) {
            raw = await fetchText(resolvedRef.replace(/[.\s]\d+$/, ''));
        }
        if (!raw) return null;

        const flatten = (t) => Array.isArray(t) ? t.map(flatten).join('\n\n') : (typeof t === 'string' ? t.replace(/<[^>]+>/g, '') : '');
        const text = flatten(raw).trim();
        if (!text || text.length < 20) return null;

        return { ref: resolvedRef, text: text.slice(0, 6000) };
    } catch (e) {
        console.warn('[Sefaria] Falha na busca:', e.message);
        return null;
    }
}

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
        verse,
        themeTitle,
        moduleTitle,
        customInstructions,
        existingContent,
        depthLevel,
        targetPages,
        thinkingLevel,
        relevanceWeight,
        excludedKeyHashes = [],
        batchSize: requestedBatchSize 
    } = body || {};

    const batchSize = requestedBatchSize !== undefined ? requestedBatchSize : (taskType === 'fetch_primary_source' ? 6 : 3);

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

    // 5. SELEÇÃO ALEATÓRIA INTELIGENTE E BALANCEADA (SMART HEALTH ROUTER)
    // Classifica as chaves em camadas para NUNCA insistir em chaves que bateram limite:
    
    // Tier 1: Chaves totalmente saudáveis (sem cooldown ativo, não esgotadas e não tentadas recentemente)
    const tier1HealthyKeys = uniqueKeys.filter(key => !isKeyExhausted(key));

    // Tier 2: Chaves cujo cooldown por minuto expirou ou que não têm bloqueio diário registrado
    const tier2RecoveringKeys = uniqueKeys.filter(key => {
        const h = hashKey(key);
        const row = remoteKeyStates.get(h);
        if (row?.daily_exhausted_date === todayStr) return false; // Bloqueio diário estrito
        if (global.exhaustedKeys.has(key)) {
            const exp = global.exhaustedKeys.get(key);
            if (now < exp) return false; // Ainda em cooldown local
        }
        return !tier1HealthyKeys.includes(key);
    });

    // Algoritmo de embaralhamento estocástico Fisher-Yates (aleatoriedade uniforme verdadeira)
    const shuffleArray = (arr) => {
        const copy = [...arr];
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    };

    // Monta a fila de candidatos priorizando 100% as chaves saudáveis sorteadas aleatoriamente
    let candidateKeys = [
        ...shuffleArray(tier1HealthyKeys),
        ...shuffleArray(tier2RecoveringKeys)
    ];

    // Fallback absoluto: se todas as chaves estiverem sob restrição, sorteia aleatoriamente de todo o pool
    if (candidateKeys.length === 0) {
        candidateKeys = shuffleArray(uniqueKeys);
    }

    // FAST-FAILOVER INTELIGENTE NO SERVIDOR (ROTAÇÃO DE TODO O POOL):
    // Percorre todas as chaves disponíveis na fila de candidatos (ou o batchSize solicitado),
    // garantindo que nenhuma chave saudável do pool deixe de ser utilizada caso as primeiras falhem.
    const defaultBatchSize = candidateKeys.length;
    const maxKeysInBatch = requestedBatchSize !== undefined 
        ? Math.max(1, Math.min(Number(requestedBatchSize) || defaultBatchSize, candidateKeys.length))
        : candidateKeys.length;
    const keysToTryInThisInvocation = candidateKeys.slice(0, maxKeysInBatch);

            let systemInstruction = "Você é o Professor Michel Felix, teólogo Pentecostal Clássico e Erudito.";
            let enhancedPrompt = prompt;
            let dictionaryGrounded = false; // true quando o texto original real (bolls.life) foi injetado no prompt

            // --- LÓGICA DE BUSCA RÁPIDA ---
            if (taskType === 'assistente_chat') {
                systemInstruction = "Você é um buscador bíblico ultrarrápido. Retorne apenas os dados solicitados em JSON, sem explicações longas.";
            }
            // --- SUGESTÃO DE PONTOS DE ATENÇÃO POR CAPÍTULO (pré-preenche "Instruções Customizadas") ---
            else if (taskType === 'chapter_focus_suggestion') {
                // Quantidade de itens: se o professor já classificou o peso/relevância do capítulo
                // (botão Baixo/Médio/Alto na tela), respeitamos essa faixa fixa. Sem classificação,
                // deixamos a própria IA avaliar a densidade real do capítulo em vez de forçar sempre
                // "4 a 6" — um capítulo como Gênesis 1 ou Romanos 8 comporta muito mais do que uma
                // genealogia de transição.
                const itemCountInstruction = relevanceWeight === 'baixo'
                    ? 'liste de 2 a 3 itens curtos'
                    : relevanceWeight === 'alto'
                        ? 'liste de 6 a 10 itens curtos, aproveitando a riqueza real deste capítulo — não resuma demais, capítulos densos merecem mais pontos'
                        : relevanceWeight === 'medio'
                            ? 'liste de 4 a 6 itens curtos'
                            : 'avalie a densidade doutrinária/histórica/narrativa REAL deste capítulo específico antes de decidir quantos itens listar: se for um capítulo denso e rico (ex: Gênesis 1, Romanos 8, Apocalipse 1), pode listar de 6 a 10 itens; se for um capítulo mais simples, genealógico ou de transição, 2 a 3 itens honestos bastam — NUNCA force uma quantidade fixa que não reflita o que o capítulo realmente oferece';

                // MODO GUIA DO MESTRE: quando a aula do aluno já existe (existingContent), a
                // sugestão não deve mais apontar CONTEÚDO doutrinário pra explicar — isso já está
                // escrito na aula. Aqui o professor precisa de ESTRATÉGIA DE ENSINO: o que é mais
                // difícil de explicar em sala, quebra-gelo, ritmo de tempo e pergunta de debate,
                // sempre ancorados no que a aula do aluno REALMENTE contém (nunca invente conteúdo
                // que não esteja nela).
                const hasStudentLesson = Boolean(existingContent && existingContent.trim().length > 100);
                if (hasStudentLesson) {
                    systemInstruction = `Você é o Professor Michel Felix, Assistente Didático de Elite, especialista em transformar conteúdo teológico já pronto em ESTRATÉGIA DE SALA DE AULA para o professor de EBD.

                    Aqui sua única tarefa é SUGERIR, em tópicos curtos, pontos de atenção PEDAGÓGICOS para o professor que vai LECIONAR a aula abaixo (que já está pronta) — você NÃO deve sugerir mais conteúdo doutrinário pra explicar (isso já foi escrito), só estratégia de como ensinar bem o que já está ali.

                    ATENÇÃO — LINGUAGEM: escreva cada item em português simples e direto, pronto pra colar nas Instruções Customizadas do Guia do Mestre.`;
                    enhancedPrompt = `Leia a AULA DO ALUNO JÁ PRONTA abaixo (${book || ''} ${chapter || ''}) e ${itemCountInstruction} (uma linha cada, sem numeração, começando com "- ") de ESTRATÉGIA DE ENSINO para o professor que vai lecionar essa aula especificamente. Escolha, entre os que realmente se aplicarem a ESTE conteúdo (não force todos):

1. PONTO MAIS DIFÍCIL DE ENTENDER: qual trecho específico desta aula tende a confundir um aluno leigo, e uma analogia simples do dia a dia pra destravar esse ponto na explicação oral.
2. QUEBRA-GELO SUGERIDO: uma pergunta ou dinâmica de abertura ligada ao tema ESPECÍFICO desta aula (nunca genérica).
3. O QUE MERECE MAIS TEMPO EM SALA: qual tópico desta aula é o mais denso/importante e merece mais ênfase de tempo na fala do professor, versus o que pode passar mais rápido.
4. PERGUNTA DE DEBATE MAIS PROVOCATIVA: uma pergunta específica baseada nesta aula que geraria a melhor discussão entre os alunos.
5. RISCO DE CONFUSÃO NA EXPLICAÇÃO ORAL: se algum ponto desta aula é historicamente mal-entendido ou fácil de o professor explicar errado de improviso, avise o que reforçar.

REGRA DE OURO: TUDO deve estar ancorado no conteúdo REAL da aula abaixo — é PROIBIDO sugerir um ponto, analogia ou pergunta sobre algo que não está escrito nela.

Seja direto e específico desta aula — nada genérico. Sem introduções, sem saudações, sem numerar as categorias acima no texto final, vá direto para a lista de itens.

--- AULA DO ALUNO JÁ PRONTA ---
"""
${existingContent.substring(0, 6000)}
"""`;
                } else {
                systemInstruction = `Você é o Professor Michel Felix, teólogo Pentecostal Clássico e Erudito, operando sob a mesma lente doutrinária do motor principal (Arminiano, Pré-tribulacionista/Pré-milenista, Ortodoxo/Trinitariano, Pentecostal Continuísta, Apologeta Anti-heresias, Hermenêutica de Alta Precisão).

                Aqui sua única tarefa é SUGERIR, em tópicos curtos, pontos de atenção para OUTRO PROFESSOR que vai preparar a aula — você NÃO está escrevendo a aula em si, nem uma explicação teológica completa, só um mapa rápido do que vale a pena focar.

                ATENÇÃO — LINGUAGEM: essas notas costumam ser coladas quase palavra por palavra dentro da aula final (que é para uma turma leiga de EBD, não um seminário). Por isso, escreva CADA item já em português simples e direto, do jeito que se explica pra alguém que nunca estudou teologia — NUNCA em jargão acadêmico cru. Se precisar mencionar um conceito técnico (ex: culpa objetiva, hamartologia, intenção subjetiva) ou um termo em hebraico/grego, traduza-o na mesma frase em palavras do dia a dia (ex: em vez de "a culpa objetiva não é anulada pela intenção subjetiva do indivíduo", escreva "o erro continua sendo pecado mesmo que a pessoa não tivesse a intenção de pecar"). Evite palavras como "fulcral", "per se", "intrínseco" quando existe uma palavra comum que diz o mesmo.`;
                enhancedPrompt = `Para uma aula sobre ${book || ''} ${chapter || ''}, ${itemCountInstruction} (uma linha cada, sem numeração, começando com "- ") apontando o que merece atenção especial NESTE capítulo específico, já escritos em linguagem simples de EBD (veja a regra de linguagem acima). Escolha, entre os que realmente se aplicarem a este capítulo (não force todos, alguns capítulos não têm heresia associada, por exemplo):

1. TEMA DOUTRINÁRIO RELEVANTE: se o capítulo toca algum tema que está na lente doutrinária do sistema (ex: como a salvação funciona, o fim dos tempos, os dons espirituais, quem é Jesus), aponte que vale reforçar esse ponto na aula — sem escrever a explicação inteira, só sinalizar, em palavras simples.
2. INTERPRETAÇÃO ERRADA COMUM: se alguma passagem deste capítulo costuma ser mal interpretada ou usada por algum grupo pra defender algo fora do que a Bíblia realmente ensina, diga EM POUCAS PALAVRAS SIMPLES qual é esse erro e qual é a interpretação correta — pra o professor já saber que precisa esclarecer isso, sem citar nomes de heresias ou correntes teológicas como rótulo.
3. CURIOSIDADE HISTÓRICA: algo pouco óbvio sobre o contexto, costume, geografia ou achado arqueológico ligado ao capítulo, explicado de forma simples.
4. O PORQUÊ DE UM TERMO OU RITUAL: algum ritual, costume ou palavra original (hebraico/grego) mencionado cujo significado profundo vale a pena explicar — traduza o termo original e explique o "porquê por trás" em linguagem do dia a dia, não só cite.
5. ALGO QUE SOA ESTRANHO HOJE: um costume, lei ou detalhe do texto que parece estranho, chocante ou sem sentido pra um leitor moderno, e que se beneficia de uma explicação simples.
6. CONEXÃO QUE ESCLARECE: uma referência cruzada com outro texto bíblico, com a tradição judaica, com um historiador antigo, ou uma fonte primária que ajuda a entender melhor este capítulo, resumida em linguagem acessível.
7. EXEMPLO OU RELATO BÍBLICO PRÁTICO (RIGOR HERMENÊUTICO E CONTEXTUAL — SEM FORÇAR): Se o capítulo traz um mandamento, doutrina, lei ou princípio (ex: pecados por ignorância de líderes/congregação, votos, sacerdócio, julgamentos), aponte onde esse princípio foi vivido, quebrado ou cumprido na prática em uma história das Escrituras (ex: o erro de Davi ao transportar a Arca em 1 Cr 13/15, o juramento precipitado de Saul em 1 Sm 14, a purificação de Josias em 2 Rs 22). ATENÇÃO CRÍTICA: A correspondência bíblica deve ser REAL, LEGÍTIMA e no CONTEXTO EXATO da passagem. É TERMINANTEMENTE PROIBIDO inventar, alucinar, espiritualizar forçadamente ou encaixar uma história fora de contexto só para ter um exemplo. Se não houver uma narrativa bíblica que ilustre com exatidão aquele ponto específico, NÃO invente nem force uma conexão artificial — a fidelidade ao texto bíblico prevalece sempre sobre o desejo de exemplificar.

Seja direto e específico deste capítulo — nada genérico que serviria para qualquer capítulo. Sem introduções, sem saudações, sem numerar as categorias acima no texto final (elas são só um guia interno seu), vá direto para a lista de itens.`;
                }
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
                const parsedSourceRef = parseSourceReferenceFromPrompt(prompt);
                const sefariaResult = parsedSourceRef
                    ? await fetchFromSefaria(parsedSourceRef.source, parsedSourceRef.reference)
                    : null;
                const specificInstruction = parsedSourceRef?.hiddenCommand || '';

                if (sefariaResult) {
                    // --- CAMINHO COM GROUNDING REAL (Sefaria): recorte cirúrgico e verificação de fólio ---
                    systemInstruction = `
                        ATUE COMO: Tradutor Erudito e Contextualizador Cirúrgico do Professor Michel Felix.

                        VOCÊ RECEBEU O TEXTO ORIGINAL (via Sefaria.org, referência: ${sefariaResult.ref}) da fonte solicitada.
                        ATENÇÃO CRÍTICA SOBRE TAMANHO E RECORTE CIRÚRGICO:
                        Um fólio do Talmud, capítulo de Midrash ou seção histórica contém VÁRIOS debates e assuntos diferentes. É TERMINANTEMENTE PROIBIDO traduzir o fólio/capítulo inteiro ou despejar parágrafos sobre assuntos que não têm relação com o ponto citado na aula!

                        DIRETRIZES MANDATÓRIAS:
                        1. RECORTE CIRÚRGICO E CONCISÃO (MÁXIMO 1 A 2 PARÁGRAFOS CURTOS DE CITAÇÃO):
                           - Se houver uma "Instrução específica / Assunto da Pérola" na solicitação, localize e traduza APENAS o exato recorte (1 a 2 parágrafos curtos, cerca de 4 a 8 linhas) que trata especificamente desse assunto. Ignore completamente os demais debates do mesmo fólio.
                           - Se NÃO houver instrução específica, selecione e traduza APENAS o ensinamento principal mais célebre desse trecho em 1 a 2 parágrafos curtos (máximo 8 linhas). NUNCA traduza a página inteira.
                        2. VERIFICAÇÃO DE PRECISÃO DE FÓLIO/REFERÊNCIA (HONESTIDADE ACADÊMICA):
                           - Às vezes uma tradição rabínica real pertence a um fólio vizinho ou tratado correlato (ex: a famosa exegese da letra Bet fechada em três lados e aberta para a frente — "não indagues o que está acima, abaixo, antes ou depois" — consta na Mishná Hagigah 2:1 / Talmud Hagigah 11b e Bereshit Rabá 1:10, enquanto Hagigah 12a continua o debate da Criação com Adão e a luz primordial).
                           - Se a "Instrução específica" pedir um ensino real e autêntico que está no fólio/seção adjacente ou se o texto bruto do Sefaria trouxer a continuação imediata, traduza FIELMENTE a citação exata correspondente ao ensino solicitado na Instrução Específica (indicando entre colchetes a localização exata se for no fólio vizinho, ex: **[Talmud, Tratado Hagigah 12a / Mishná 2:1 (11b)]**), em vez de despejar páginas de outros assuntos aleatórios!
                        3. IDIOMA E CLAREZA: Toda a resposta em Português do Brasil culto, límpido e didático.
                        4. SEM SAUDAÇÕES OU METALINGUAGEM: Comece direto com o título/referência em negrito. NUNCA mencione as palavras "Instrução específica", "Comando oculto" ou "Sefaria".
                        5. ESTRUTURA MARKDOWN COMPACTA E ELEGANTE:
                           - **[Nome da Obra, Referência]**
                           - **Tradução em Português:** *"[Tradução fiel e concisa APENAS do trecho exato do assunto — máximo 1 a 2 parágrafos curtos]"*
                           - **Contexto Histórico e Aplicação:** (1 único parágrafo conciso de 4 a 6 linhas conectando diretamente esse recorte ao ensino bíblico).
                    `;
                    enhancedPrompt = `[RECORTE E TRADUÇÃO CIRÚRGICA DE FONTE PRIMÁRIA]:
Referência solicitada: "${parsedSourceRef.source}, ${parsedSourceRef.reference}"
${specificInstruction ? `Assunto / Recorte exato solicitado pela Pérola de Ouro (MÁXIMA PRIORIDADE — traduza APENAS o trecho referente a este ponto): "${specificInstruction}"` : 'Extraia e traduza apenas o trecho central mais relevante de forma concisa (1 a 2 parágrafos curtos).'}

TEXTO DE REFERÊNCIA (${sefariaResult.ref}):
"""
${sefariaResult.text}
"""

Retorne APENAS o recorte exato traduzido (1 a 2 parágrafos curtos) e 1 parágrafo curto de contexto histórico no formato Markdown especificado, sem traduzir assuntos paralelos do fólio.`;
                } else {
                    // --- CAMINHO DIRETO: busca cirúrgica focada exatamente no assunto da Pérola ---
                    systemInstruction = `
                        ATUE COMO: Bibliotecário de Fontes Primárias e Tradutor Erudito do Professor Michel Felix.

                        SEU OBJETIVO PRINCIPAL: Localizar a citação histórica, rabínica (Talmud, Mishná, Midrash), clássica (Flávio Josefo, Fílon, historiadores greco-romanos) ou patrística solicitada e fornecer a TRADUÇÃO CONCISA EM PORTUGUÊS (pt-BR) APENAS DO TRECHO EXATO citado na Pérola de Ouro.

                        DIRETRIZES MANDATÓRIAS DE CONCISÃO E PRECISÃO:
                        1. PROIBIÇÃO DE TEXTOS LONGOS: É TERMINANTEMENTE PROIBIDO traduzir páginas ou capítulos inteiros. Forneça APENAS o recorte específico (1 a 2 parágrafos curtos, cerca de 4 a 8 linhas) que trata do assunto solicitado.
                        2. FOCO CIRÚRGICO NO ASSUNTO SOLICITADO: Se houver uma "Instrução específica", traduza EXCLUSIVAMENTE a passagem que aborda esse ponto. NUNCA mencione a existência do comando oculto.
                        3. IDIOMA: 100% em Português do Brasil. NÃO inclua blocos em hebraico, grego ou latim.
                        4. SEM SAUDAÇÕES: Inicie DIRETAMENTE com o título da obra e a referência em negrito.
                        5. ESTRUTURAÇÃO OBRIGATÓRIA EM MARKDOWN:
                           - **[Nome do Autor / Obra, Referência Exata]**
                           - **Tradução em Português:** *"[Trecho específico traduzido com fidelidade e concisão — 1 a 2 parágrafos curtos]"*
                           - **Contexto Histórico e Aplicação:** (1 único parágrafo conciso de 4 a 6 linhas explicando como essa citação ilumina o texto bíblico).
                    `;
                    enhancedPrompt = `[BUSCA E TRADUÇÃO CIRÚRGICA DE FONTE PRIMÁRIA]:
Referência solicitada: "${prompt}"

Retorne de forma concisa e cirúrgica em Português do Brasil (máximo 1 a 2 parágrafos curtos de tradução do recorte exato + 1 parágrafo curto de contexto):
**[Título da Obra e Referência]**
**Tradução em Português:** *"[Apenas o recorte exato traduzido com fidelidade e clareza]"*
**Contexto Histórico e Aplicação:** [1 parágrafo conciso conectando a citação ao texto bíblico]`;
                }
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
                    volumeInstruction = `MANDATO DE VOLUME CIRÚRGICO (ALVO EXATO: ${wordCountTarget} PALAVRAS TOTAL | TETO INVIOLÁVEL: ${maxWords} PALAVRAS): O usuário solicitou rigorosamente ${pages} páginas (~${baseWordCount} palavras). NÃO ultrapasse ${maxWords} palavras sob nenhuma hipótese. Se o texto existente for longo, COMPACTE e resuma para se adequar a esta meta.`;
                } else {
                    volumeInstruction = `MANDATO DE VOLUME RIGOROSO (ALVO EXATO: ${wordCountTarget} PALAVRAS TOTAL | TETO INVIOLÁVEL: ${maxWords} PALAVRAS): Enquadre o resumo e roadmap rigorosamente na meta de ${pages} páginas (~${baseWordCount} palavras), entre ${minWords} e ${maxWords} palavras totais. NUNCA exceda ${maxWords} palavras!`;
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
            // --- LÓGICA DE QUIZ (BLINDAGEM ANTI-ALUCINAÇÃO E FILTRO ESTRITO DE CONTEÚDO PRINCIPAL) ---
            else if (taskType === 'quiz_gen') {
                const extractMainLessonForQuiz = (rawText) => {
                    if (!rawText || typeof rawText !== 'string') return '';
                    const lines = rawText.split(/\r?\n/);

                    const isExcludedHeadingText = (headingText) => {
                        const clean = headingText
                            .replace(/^[#*>\-\s]+/, '')
                            .replace(/[*_]+/g, '')
                            .trim();
                        return /^(?:INTRODU[ÇC][ÃA]O|TIPOLOGIA|CONEX[ÃA]O\s+COM\s+(?:JESUS|CRISTO)|CURIOSIDADES?|ARQUEOLOGIA|P[ÉE]ROLAS?\s+DE\s+OURO|AP[ÊE]NDICE|DOSSI[ÊE]\s+ESPECIAL)/i.test(clean) ||
                            /\b(?:TIPOLOGIA\s*:?\s*CONEX[ÃA]O|CONEX[ÃA]O\s+COM\s+JESUS\s+CRISTO|CURIOSIDADES?\s+E\s+ARQUEOLOGIA|ARQUEOLOGIA\s+E\s+CURIOSIDADES?)\b/i.test(clean);
                    };

                    const isMainTopicH2 = (line) => {
                        const tr = line.trim();
                        if (!/^##\s+/.test(tr) || /^###/.test(tr)) return false;
                        return !isExcludedHeadingText(tr);
                    };

                    const hasMainTopicH2 = lines.some(isMainTopicH2);

                    const filterLines = (requireMainTopicStart) => {
                        const kept = [];
                        let seenMainTopic = !requireMainTopicStart;
                        let inExcludedSection = false;

                        for (const rawLine of lines) {
                            const tr = rawLine.trim();
                            if (!tr) {
                                if (seenMainTopic && !inExcludedSection && kept.length > 0 && kept[kept.length - 1] !== '') {
                                    kept.push('');
                                }
                                continue;
                            }

                            if (/^#\s+/.test(tr) || /^PANOR[ÂA]MA\s+B[ÍI]BLICO/i.test(tr) || tr === '__CONTINUATION_MARKER__') {
                                continue;
                            }

                            if (tr.startsWith('>')) {
                                continue;
                            }

                            const isH2 = /^##\s+/.test(tr) && !/^###/.test(tr);
                            const isH3 = /^###+\s+/.test(tr);
                            const isStandaloneBoldHeading = tr.length < 100 && /^\*\*[^*]+\*\*$/.test(tr);

                            if (isH2) {
                                if (isExcludedHeadingText(tr)) {
                                    inExcludedSection = true;
                                } else {
                                    seenMainTopic = true;
                                    inExcludedSection = false;
                                    kept.push(tr);
                                }
                                continue;
                            }

                            if (isH3 || isStandaloneBoldHeading || (tr.length < 90 && isExcludedHeadingText(tr))) {
                                if (isExcludedHeadingText(tr)) {
                                    inExcludedSection = true;
                                    continue;
                                }
                                if (isH3 && seenMainTopic) {
                                    inExcludedSection = false;
                                    kept.push(tr);
                                    continue;
                                }
                            }

                            if (!seenMainTopic || inExcludedSection) {
                                continue;
                            }

                            if (/^(?:[\*_>\-\s]*)*P[ÉE]ROLAS?\s+DE\s+OURO\b/i.test(tr)) {
                                continue;
                            }

                            let cleanedLine = tr.replace(/(?:\*\*|\b)P[ÉE]ROLAS?\s+DE\s+OURO\s*:?\s*(?:\*\*)?[\s\S]*$/i, '').trim();
                            if (!cleanedLine) continue;

                            if (/\{\{[^}]+\}\}/.test(cleanedLine)) {
                                const sentences = cleanedLine.split(/(?<=[.!?])\s+/);
                                const filteredSentences = sentences.filter(s => !/\{\{[^}]+\}\}/.test(s) && !/P[ÉE]ROLAS?\s+DE\s+OURO/i.test(s));
                                cleanedLine = filteredSentences.join(' ').trim();
                                if (!cleanedLine) continue;
                            }

                            cleanedLine = cleanedLine.replace(/\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]/g, '$1');
                            kept.push(cleanedLine);
                        }

                        return kept;
                    };

                    let resultLines = filterLines(hasMainTopicH2);
                    let resultText = resultLines.join('\n').trim();

                    if (hasMainTopicH2 && resultText.length < 200) {
                        resultLines = filterLines(false);
                        resultText = resultLines.join('\n').trim();
                    }

                    return resultText || rawText;
                };

                const sanitizeQuizPrompt = (rawPrompt) => {
                    if (!rawPrompt || typeof rawPrompt !== 'string') return '';
                    if (/"""[\s\S]+"""/.test(rawPrompt)) {
                        return rawPrompt.replace(/"""([\s\S]+?)"""/, (_, inner) => `"""\n${extractMainLessonForQuiz(inner)}\n"""`);
                    }
                    if (/--- INÍCIO DO TEXTO DA AULA ---[\s\S]+--- FIM DO TEXTO DA AULA ---/.test(rawPrompt)) {
                        return rawPrompt.replace(
                            /--- INÍCIO DO TEXTO DA AULA ---([\s\S]+?)--- FIM DO TEXTO DA AULA ---/,
                            (_, inner) => `--- INÍCIO DO TEXTO DA AULA ---\n${extractMainLessonForQuiz(inner)}\n--- FIM DO TEXTO DA AULA ---`
                        );
                    }
                    return extractMainLessonForQuiz(rawPrompt);
                };

                systemInstruction = `
                    ATUE COMO: Um Robô de Análise Textual Estrita (Sem Conhecimento Externo).
                    
                    DIRETRIZ DE SEGURANÇA MÁXIMA:
                    1. ESQUEÇA todo o seu conhecimento sobre a Bíblia, Teologia ou História.
                    2. Sua ÚNICA fonte de verdade é o texto fornecido pelo usuário.
                    3. Se a informação não está escrita palavra por palavra no texto fornecido, ELA NÃO EXISTE para você.
                    
                    ESCOPO EXCLUSIVO DA AULA PRINCIPAL (REGRA INVIOLÁVEL - ERRO CRÍTICO SE IGNORADA):
                    Todas as perguntas DEVEM vir EXCLUSIVAMENTE do CONTEÚDO DA AULA PRINCIPAL (os tópicos principais de exposição bíblica do capítulo).
                    É TERMINANTEMENTE PROIBIDO criar perguntas baseadas em qualquer um dos seguintes elementos (mesmo que apareçam no meio de um parágrafo):
                    1. PROIBIDO PÉROLAS DE OURO E FONTES EXTRABÍBLICAS: NUNCA faça perguntas sobre "Pérolas de Ouro", citações rabínicas ou históricas, Talmud, Mishná, Midrash, Targum, Flávio Josefo, Fílon de Alexandria, Eusébio, Pais da Igreja, Manuscritos de Qumran ou tradições judaicas extrabíblicas.
                    2. PROIBIDO INTRODUÇÃO: NUNCA faça perguntas sobre a introdução da aula (contexto geral do livro, datação, autoria geral ou gancho introdutório).
                    3. PROIBIDO TIPOLOGIA COM CRISTO: NUNCA faça perguntas sobre a seção "Tipologia: Conexão com Jesus Cristo" ou paralelos tipológicos/prefigurações messiânicas.
                    4. PROIBIDO CURIOSIDADES E ARQUEOLOGIA: NUNCA faça perguntas sobre curiosidades históricas, escavações, artefatos arqueológicos, museus, inscrições antigas ou notas arqueológicas (mesmo quando inseridas in-loco no parágrafo).
                    5. PROIBIDO IDIOMAS ORIGINAIS E ETIMOLOGIA: NUNCA escolha como ponto chave uma palavra ou expressão em hebraico/grego/latim mencionada na aula (ex: nunca pergunte "o que significa a expressão grega X?"), nem etimologia, nem tradição de manuscritos. Escolha SEMPRE fatos bíblicos, ensinos, personagens ou eventos narrados em português do conteúdo expositivo principal da aula.
                       - ERRADO (proibido): "Qual o significado da expressão grega 'tēreō ek' mencionada no texto?"
                       - ERRADO (proibido): "Segundo o Tratado Hagigah do Talmud citado na aula, o que ensina a letra Bet?"
                       - ERRADO (proibido): "O que as escavações arqueológicas no Oriente Médio revelam sobre esse costume?"
                       - ERRADO (proibido): "Na tipologia com Cristo, o que a arca de Noé prefigura?"
                       - CERTO (conteúdo da aula principal): "Segundo a aula, o que a promessa de Apocalipse 3:10 garante à igreja fiel?"
                    
                    REGRAS DE GERAÇÃO:
                    1. LEITURA COMPLETA: Leia todo o conteúdo dos tópicos principais da aula antes de gerar qualquer pergunta.
                    2. IDENTIFICAÇÃO DE PONTOS CHAVE DA AULA PRINCIPAL: Identifique os pontos bíblicos e expositivos mais relevantes (ensinos centrais, personagens bíblicos, acontecimentos dos versículos do capítulo) que o aluno DEVE aprender. Garanta que esses pontos sejam distintos entre si e distribuídos pelos tópicos principais da aula.
                    3. FORMULAÇÃO DA PERGUNTA:
                       - Deve ser contextualizada, clara e bem formulada.
                       - Tamanho: Entre 10 e 16 palavras (OBRIGATÓRIO).
                    4. FORMULAÇÃO DA RESPOSTA CORRETA:
                       - Deve estar expressamente no texto principal da aula.
                       - PROIBIDO: Não repita o enunciado ou partes da pergunta na resposta. A resposta deve ser direta.
                       - Tamanho:
                         - Se for um NOME PRÓPRIO: Exatamente 1 palavra.
                         - Se for uma RESPOSTA CONTEXTUALIZADA: Mínimo de 7 palavras (OBRIGATÓRIO), mas sem "recitar" a pergunta.
                    5. FORMULAÇÃO DAS RESPOSTAS INCORRETAS (DISTRAÇÕES):
                       - Devem seguir o MESMO PADRÃO, ESTILO e TAMANHO da resposta correta para não se destacarem.
                       - Devem ser desafiadoras e capazes de confundir o aluno.
                       - Use pegadinhas, respostas similares à correta ou respostas plausíveis, mas incorretas com base no texto.
                       - Devem parecer corretas à primeira vista para testar a atenção do aluno.
                    6. PROVA TEXTUAL: O 'proofText' é OBRIGATÓRIO (cópia fiel de parte do texto principal da aula) para provar que você não alucinou.
                    
                    REVISÃO OBRIGATÓRIA ANTES DE RETORNAR:
                    Revise cada pergunta gerada: se alguma abordar Pérola de Ouro (Talmud/Midrash/Josefo/fontes históricas), Introdução, Tipologia com Cristo, Curiosidades/Arqueologia ou termos em hebraico/grego/latim, DESCARTE IMEDIATAMENTE e substitua por uma pergunta sobre a exposição bíblica da aula principal.
                    
                    EXEMPLO DE APLICAÇÃO:
                    Texto: "Jesus caminhou sobre as águas durante uma forte tempestade no mar da Galileia para encontrar seus discípulos."
                    Pergunta: "Em que local específico Jesus caminhou sobre as águas para encontrar os seus discípulos?" (15 palavras)
                    Resposta Correta: "O evento ocorreu especificamente no mar da Galileia." (8 palavras - Sem repetir a pergunta)
                    Distração 1: "O evento ocorreu especificamente no mar Morto." (Mesmo padrão)
                    Distração 2: "O evento ocorreu especificamente no rio Jordão." (Mesmo padrão)
                    Distração 3: "O evento ocorreu especificamente no mar Vermelho." (Mesmo padrão)
                `;
                enhancedPrompt = sanitizeQuizPrompt(prompt);
            }
            // --- LÓGICA DE DICIONÁRIO ---
            else if (taskType === 'dictionary') {
                const originalVerse = await fetchOriginalVerseText(book, chapter, verse);
                dictionaryGrounded = !!originalVerse;

                systemInstruction = `
                    ATUE COMO: Um Especialista em Crítica Textual e Línguas Originais (Hebraico Bíblico e Grego Koiné) E Exegeta Sênior.

                    DIRETRIZ MÁXIMA DE FONTE PRIMÁRIA:
                    1. A autoridade final é o Texto Original (Texto Masorético BHS para Antigo Testamento, Textus Receptus/Nestle-Aland para Novo Testamento).
                    2. O texto fornecido em português serve APENAS como referência de localização.
                    3. NUNCA faça "retro-tradução" (tentar adivinhar o original traduzindo o português de volta). ISSO É PROIBIDO.
                    4. SEMPRE acesse sua base de dados interna do manuscrito original correspondente ao versículo solicitado.
                    5. Se houver discrepância entre a tradução em português e o original, DÊ PREFERÊNCIA À ANÁLISE DO ORIGINAL e explique a nuance.
                    ${originalVerse ? `6. TEXTO ORIGINAL JÁ VERIFICADO FORNECIDO ABAIXO (fonte: ${originalVerse.translation === 'TR' ? 'Textus Receptus' : 'Texto Masorético/WLC'}): você NÃO precisa (e NÃO deve) reconstruir o texto de memória — use EXATAMENTE o texto fornecido, palavra por palavra, sem adicionar, remover ou substituir nada.` : ''}

                    DIRETRIZ DE EXEGESE CONTEXTUAL (RESOLUÇÃO DE POLISSEMIA):
                    1. DIRETRIZ DE LINGUAGEM E CLAREZA (OBRIGATÓRIO):
                    1. Use a linguagem mais CLARA, SIMPLES e ACESSÍVEL possível. O alvo é um aluno leigo.
                    2. EVITE "TEOLOGÊS" desnecessário.
                    3. Se for EXTREMAMENTE necessário usar um termo técnico (ex: "Hipóstase", "Teofania", "Hapax Legomenon"), VOCÊ DEVE OBRIGATORIAMENTE explicar o significado entre parênteses ou aspas imediatamente.
                `;
                enhancedPrompt = originalVerse
                    ? `${prompt}\n\nTEXTO ORIGINAL VERIFICADO (use exatamente este, não invente outro):\n"""\n${originalVerse.text}\n"""`
                    : prompt;
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

                    --- MANDATO CRÍTICO DE VOLUME E RITMO DE ESCRITA (${pages} PÁGINAS = ${wordCountTarget} PALAVRAS) ---
                    1. META OBRIGATÓRIA E TETO INVIOLÁVEL: O texto FINAL deve ter RIGOROSAMENTE ENTRE ${wordCountTarget} PALAVRAS para preencher EXATAMENTE as ${pages} páginas solicitadas.
                    2. TETO MÁXIMO ABSOLUTO: NUNCA EXCEDA ${maxWords} PALAVRAS e NÃO produza menos que ${minWords} palavras. Em uma solicitação de ${pages} páginas (~${baseWordCount} palavras), ultrapassar ${maxWords} palavras (ex: passar de 5.000 palavras) é expressamente PROIBIDO e constitui falha grave de metragem.
                    3. FÓRMULA DE DISTRIBUIÇÃO E RITMO POR TÓPICO (PACING OBRIGATÓRIO):
                       - Não escreva parágrafos intermináveis de 800 palavras em cada ponto.
                       - Introdução: ~200 a 250 palavras.
                       - Desenvolvimento dos tópicos (##): se houver 4 a 6 tópicos principais, cada tópico deve ter entre 350 e 450 palavras no máximo (2 a 3 parágrafos concisos e densos).
                       - Se a aula tiver muitos tópicos e subtópicos (ementa extensa com 8 a 25 itens, como em aulas temáticas detalhadas): você DEVE OBRIGATORIAMENTE sintetizar cada subtópico (###) em 1 único parágrafo denso e cirúrgico de 100 a 160 palavras. Não expanda em múltiplos parágrafos para cada item quando a lista de tópicos for longa!
                       - Aplicação Prática e Conclusão: ~250 a 350 palavras no total.
                    4. CONTROLE DE TAMANHO EM ILUSTRAÇÕES E FONTES:
                       - Relatos bíblicos práticos e conexões históricas devem ser concisos (2 a 4 linhas no máximo). Não reconte a narrativa bíblica inteira. Extraia a lição teológica imediata e avance.
                       - As Pérolas de Ouro e Glossários devem ser integrados fluidamente ao texto, sem criar seções extras desnecessárias.
                       - Profundidade teológica NÃO significa prolixidade. Significa densidade exegética explicada com simplicidade e precisão.
                    5. NO MODO UPGRADE (ATUALIZAÇÃO DE AULA EXISTENTE):
                       - Preserve integralmente todos os tópicos (##) e subtópicos (###) existentes na ementa.
                       - COMPACTE e RESUMA trechos prolixos do texto original. Se o texto de base for extenso, NÃO adicione conteúdo novo sobre o antigo sem sintetizar o que já existia. A soma total da aula atualizada com todas as melhorias DEVE ficar estritamente entre ${minWords} e ${maxWords} palavras.

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

                    enhancedPrompt = `[PROTOCOLO DE UPGRADE DE APOSTILA TEMÁTICA SÉRIE OURO - ALVO RÍGIDO: ${wordCountTarget} PALAVRAS (${pages} PÁGINAS | TETO INVIOLÁVEL: ${maxWords} PALAVRAS)]:
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
- Mantenha como base estrutural o conteúdo que já existe nesta aula, preservando integralmente todos os tópicos (##) e subtópicos (###) existentes.
- SINTETIZE COM PRECISÃO: Para que todos os tópicos caibam na meta de ${pages} páginas (~${baseWordCount} palavras), limite cada subtópico a 1 único parágrafo denso e direto (100 a 160 palavras). NUNCA exceda ${maxWords} palavras no total!
${customInstructions ? '- Incorpore rigorosamente as diretrizes e sugestões do professor fornecidas acima.' : ''}
- Sempre que houver alguma doutrina, mandamento ou princípio, traga 1 relato prático das Escrituras resumido em 2 a 4 linhas (sem recontar histórias inteiras), com RIGOR CONTEXTUAL E HISTÓRICO REAL.
- Aplique o Glossário Didático no formato [[Palavra|Explicação simples e didática]] para termos técnicos e teológicos.
- Insira referências bíblicas no corpo do texto (sem listas soltas).
- Inclua Fontes Primárias {{Autor | Obra | Comando}} e conexões históricas pertinentes ao tema.
- NÃO USE SAUDAÇÕES OU INTRODUÇÕES META. VÁ DIRETO AO CONTEÚDO DA AULA.
- ⚠️ TRAVA DE SEGURANÇA E PACING FINAL: O texto FINAL DEVE ter rigorosamente entre ${minWords} e ${maxWords} palavras (${pages} páginas). Jamais passe de ${maxWords} palavras (não estoure para 5.000 palavras)! Conclua o texto antes de ultrapassar ${maxWords} palavras.`;
                } else {
                    const lessonTheme = themeTitle || book || prompt;
                    const customInstrBlock = customInstructions && customInstructions.trim().length > 0
                        ? `\n--- DIRETRIZES ESPECÍFICAS / EMENTA DE TÓPICOS SUGERIDA PELO PROFESSOR (SEGUIR RIGOROSAMENTE) ---\n"""\n${customInstructions.trim()}\n"""\n`
                        : (prompt !== lessonTheme ? `\n--- DIRETRIZES ESPECÍFICAS / SUGESTÕES DO PROFESSOR ---\n"""\n${prompt}\n"""\n` : '');

                    enhancedPrompt = `[GERAR APOSTILA DIDÁTICA TEMÁTICA SÉRIE OURO - ALVO RÍGIDO: ${wordCountTarget} PALAVRAS (${pages} PÁGINAS | TETO INVIOLÁVEL: ${maxWords} PALAVRAS)]:
TEMA DA AULA: "${lessonTheme}"${moduleTitle ? ` (Matéria/Módulo: "${moduleTitle}")` : ''}
${customInstrBlock}

INSTRUÇÕES FINAIS DE RENDERIZAÇÃO:
- Comece com o TÍTULO DA AULA em letras maiúsculas (Use # ${lessonTheme.toUpperCase()}).
- Se houver uma ementa de tópicos (##) e subtópicos (###) definida nas instruções acima, siga-a RIGOROSAMENTE do início ao fim, desenvolvendo cada ponto com profundidade teológica de nível PhD e didática acessível de EBD, OBRIGATORIAMENTE RESTRITA AO INTERVALO DE ${wordCountTarget} PALAVRAS (${pages} páginas).
- PACING E DISTRIBUIÇÃO: Regule o tamanho de cada tópico (350 a 450 palavras por tópico se houver 4 a 6 tópicos; ou 100 a 160 palavras por subtópico se a ementa tiver mais de 8 subtópicos).
- Sempre que houver alguma doutrina, mandamento ou princípio, traga 1 relato prático das Escrituras resumido em 2 a 4 linhas com rigor contextual.
- Aplique o Glossário Didático no formato [[Palavra|Explicação didática]] para termos difíceis.
- Insira referências bíblicas no corpo do texto.
- Inclua Fontes Primárias {{Autor | Obra | Comando}} e contexto histórico/teológico.
- NÃO USE SAUDAÇÕES. VÁ DIRETO AO CONTEÚDO.
- ⚠️ TRAVA DE SEGURANÇA FINAL: O texto FINAL DEVE ter entre ${minWords} e ${maxWords} palavras (${pages} páginas). NUNCA exceda ${maxWords} palavras sob nenhuma hipótese!`;
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
                    : `2. INTRODUÇÃO DO CAPÍTULO (COM COSTURA DE TRANSIÇÃO):\n           Inicie com 1 ou 2 frases fazendo a ponte viva com o desfecho do capítulo anterior (${chapter - 1}), situando a continuidade da narrativa, e então FOQUE EXCLUSIVAMENTE no contexto imediato do capítulo ${chapter}. NÃO repita a introdução geral do livro de ${book} (autoria, data, etc), pois já foi dada nos capítulos anteriores.`;

                const WRITING_STYLE = `
        ATUE COMO: Professor Michel Felix.
        PERFIL: Teólogo Erudito, Exegeta Sênior, Doutor em Bíblia e História Antiga, com Didática Magistral de Elite (Padrão Ouro EBD Panorama).
        
        MARCO TEOLÓGICO E DOUTRINÁRIO (IMPLÍCITO NO MOTOR):
        Sua mente exegética opera ESTRITAMENTE sob a seguinte lente doutrinária:
        - Soteriologia Arminiana Clássica / Pentecostal (Assembleia de Deus Ministério Ágape):
          * PROIBIÇÃO TERMINANTE DE TERMOS E CONCEITOS DO TULIP CALVINISTA: É expressamente proibido usar jargões reformados/calvinistas como "graça incondicional", "graça irresistível", "eleição incondicional", "poder irresistível de regeneração" ou "incapacidade total de crer".
          * TERMINOLOGIA CORRETA E PRECISA: A graça de Deus é SOBERANA, PREVENIENTE e IMERECIDA (ninguém merece a salvação), porém a salvação oferecida em Cristo é CONDICIONAL À RESPOSTA DA FÉ humana capacitada pelo Espírito (Jo 3:16; Rm 1:16-17; Ef 2:8). A graça pode ser resistida (At 7:51; Mt 23:37) e exige a rendição voluntária da fé (como Paulo declarou em At 26:19: "não fui desobediente à visão celestial"). Portanto, na estrada de Damasco Paulo foi alcançado pela graça soberana e imerecida de Deus, e não por "graça incondicional" ou "poder irresistível".
        - Pré-tribulacionista e Pré-milenista (escatologia).
        - Ortodoxo e Trinitariano (defesa inegociável da Trindade e divindade de Cristo).
        - Pentecostal e Continuísta (os dons espirituais, milagres e batismo no Espírito Santo não cessaram, são contemporâneos).
        - Apologeta Anti-heresias (refuta ativamente interpretações heterodoxas e heresias ao longo da explicação).
        - Hermenêutica de Alta Precisão (a Bíblia explica a própria Bíblia, cruzando contexto remoto e imediato, explorando a fundo linguística original, história e geografia bíblica unida com teologia sistemática).
        IMPORTANTE: NÃO cite esses rótulos ("Como um arminiano...") no texto. Eles devem moldar de forma orgânica e absoluta a sua interpretação e o conteúdo gerado!

        DIRETRIZ DE IDIOMA E PURISMO VERBAL (RIGOROSO - PORTUGUÊS DO BRASIL):
        1. Escreva 100% em Português do Brasil (pt-BR) culto, límpido, gramaticalmente irrepreensível e natural.
        2. É TERMINANTEMENTE PROIBIDO deixar vazar palavras em inglês ou falsos amigos no texto (por exemplo: NUNCA escreva 'sovereign' — escreva 'soberana' ou 'soberano'; NUNCA escreva 'Son de Deus' — escreva 'Filho de Deus'; NUNCA escreva 'Father' — escreva 'Pai'; NUNCA escreva 'ortopraxie' — escreva 'ortopraxia'; NUNCA use 'covenant' — use 'aliança'; NUNCA use 'grace' — use 'graça').
        3. AS ÚNICAS EXCEÇÕES PERMITIDAS a vocábulos não-portugueses são:
           - Termos das línguas bíblicas originais (Hebraico, Grego Koiné, Aramaico) com a devida transliteração;
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
        8. MATRIZ HERMENÊUTICA DE GÊNEROS E MICROGÊNEROS LITERÁRIOS:
           - Narrativa Histórica (Gn, Ex, Js, Jz, Sm, Rs, Cr, Ed, Ne, At): diferencie descrição (o que aconteceu) de prescrição (o que Deus ordena), evidenciando a providência e soberania divina tecida em meio às fraquezas humanas.
           - Poesia e Sabedoria (Jó, Sl, Pv, Ec, Ct): identifique o paralelismo hebraico (sinônimo, antitético, sintético, quiástico), metáforas e linguagem contemplativa. Trate provérbios como princípios gerais de sabedoria prática e piedade, nunca como garantias matemáticas ou promessas irrevogáveis de prosperidade imediata.
           - Profecia Clássica (Is a Ml): harmonize a denúncia imediata dos pecados da época do profeta (90% do texto) com o cumprimento tipológico messiânico e o horizonte escatológico final.
           - Apocalíptico (Dn, Zc, Ap e discursos proféticos): decodifique a rica simbologia fundamentando-se nas imagens do Antigo Testamento (visões, números, cores e animais compósitos), banindo o sensacionalismo midiático.
           - Evangelhos e Atos (Mt, Mc, Lc, Jo, At): destaque o testemunho quádruplo de Cristo, a ênfase teológica de cada evangelista e a mensagem central das parábolas no Reino de Deus.
           - Epístolas (Rm a Jd): siga a linha de raciocínio apostólico contínuo, compreendendo a crise pastoral da igreja destinatária e respeitando a transição da doutrina (ortodoxia) para a conduta prática cristã (ortopraxia).
           - Microgêneros intra-texto: detecte quando um cântico poético irrompe numa narrativa (ex: Ex 15, Jz 5) ou quando uma parábola surge numa biografia, ajustando a interpretação instantaneamente.
        9. APLICAÇÃO ORGÂNICA E IMPLÍCITA (PROIBIÇÃO TOTAL DE RÓTULOS ROBÓTICOS):
           - É TERMINANTEMENTE PROIBIDO usar rótulos artificiais de IA como "**Aplicação Pastoral:**", "**Aplicação Prática:**", "*Pergunta para a classe:*" ou "*Para reflexão:*". Isso soa robótico e quebra a elegância do ensino bíblico.
           - A aplicação deve fluir NATURAL E IMPLICITAMENTE no fechamento da exegese do próprio tópico: ao expor a verdade bíblica original, conclua o pensamento mostrando a implicação viva para o coração, a ética e a postura do cristão hoje.
           - Critério de oportunidade: aplique com sobriedade onde o texto bíblico genuinamente clama por aplicação. NÃO force moralismos artificiais em listas genealógicas, medidas arquitetônicas ou dados cronológicos neutros.
        10. ARQUEOLOGIA E CONTEXTO HISTÓRICO IN-LOCO (FIM DO BLOCO ISOLADO NO FINAL):
           - A antiga seção final "### CURIOSIDADES E ARQUEOLOGIA" está EXTINTA. Ela isolava o dado e o tornava esquecível.
           - Insira evidências arqueológicas (tabuinhas, estelas, cilindros), costumes do Antigo Oriente Próximo e dados históricos verificáveis DIRETAMENTE no corpo do texto, no parágrafo do versículo em que o fato ocorre.
           - FILTRO ANTI-MITOS DE PÚLPITO: Apenas cite fatos arqueológicos e históricos DOCUMENTADOS e COMPROVADOS. É expressamente proibido citar lendas urbanas de púlpito (como a corda na perna do sumo sacerdote ou o buraco da agulha em Jerusalém).
        11. ONOMÁSTICA BÍBLICA (SIGNIFICADO TEOLÓGICO DOS NOMES E CIDADES):
           - No pensamento bíblico, nomes revelam planos espirituais, juízos e promessas divinas.
           - Sempre que um personagem, povo, monte (ex: Moriá, Carmelo), vale (ex: Cedrom) ou cidade (ex: Betânia, Belém, Jericó) tiver significado etimológico relevante nas línguas originais que ilumine a mensagem do capítulo, esse significado DEVE ser explicitado e conectado ao tema.
        12. DECODIFICAÇÃO DE EXPRESSÕES IDIOMÁTICAS E COSTUMES FORENSES DE CHOQUE:
           - Expressões e metáforas antigas ou práticas jurídicas/forenses que soam obscuras ou amenas ao leitor do século XXI (ex: o "corpo de morte" de Rm 7:24, "cortar aliança" entre animais em Gn 15, tirar a sandália em Rt 4, rasgar vestes) devem ser explicadas em sua realidade histórica crua, para que a classe sinta o mesmo impacto e choque dos ouvintes originais.
        13. DESARMAMENTO DE ERROS COMUNS E MITOS DE PÚLPITO:
           - Quando a passagem contiver um erro de interpretação popular clássico amplamente difundido, desfaça o equívoco com elegância, sobriedade e embasamento bíblico ("Muitos pensam equivocadamente que... contudo, a exegese do original demonstra que...").
        14. COSTURA DE TRANSIÇÃO (GANCHO PARA O PRÓXIMO CAPÍTULO):
           - Na última frase da exposição da aula (logo antes do apêndice de Tipologia), lance um gancho instigante e reflexivo conectando com o capítulo seguinte, mantendo a visão panorâmica e contínua das Escrituras.

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
        5. RIGOR DOCUMENTAL INTERATIVO (COMANDO OCULTO CIRÚRGICO OBRIGATÓRIO): É MANDATÓRIO citar fontes periciais para fundamentar as Pérolas de Ouro no formato interativo de 3 partes: {{Autor ou Obra | Referência Visível | Comando Oculto para o Bibliotecário}}.
           - ATENÇÃO CRÍTICA NA 3ª PARTE (COMANDO OCULTO): A 3ª parte NUNCA pode ser vazia ou genérica! Como um fólio do Talmud, Midrash ou capítulo de Josefo trata de dezenas de assuntos diferentes, a 3ª parte DEVE especificar exatamente o assunto citado na frase da Pérola para que o sistema recorte SOMENTE aquele ponto ao clicar.
           - Exemplo: "...segundo {{Flávio Josefo | Antiguidades 3.8.1 | Traga apenas o relato específico sobre a consagração do tabernáculo e a ordem do fogo sagrado}}, o sacerdócio..."
           - Exemplo: "...como elucida o {{Talmud | Tratado Yoma 21b | Traga apenas a discussão específica sobre os milagres do fogo contínuo sobre o altar}}..."
        6. MENÇÕES SEM CITAÇÃO: Quando apenas mencionar um autor ou obra histórica sem citação exata, use formato de Glossário: [[Flávio Josefo | Historiador judeu do século I d.C.]].
        7. INJEÇÃO IN-LINE E CONCISÃO DA PÉROLA (MÁXIMO 1 A 2 FRASES CURTAS — PROIBIDO CITAÇÃO SECA OU PARÁGRAFOS GIGANTES): Insira pelo menos 1 a 2 PÉROLAS DE OURO por tópico principal. A Pérola de Ouro deve ser uma joia concisa e direta (1 a 2 frases curtas, máximo 3 linhas), explicando em português simples o ponto específico que a fonte histórica confirma, com a citação {{Autor | Ref | Assunto exato citado na frase}} integrada na MESMA linha.
           - ERRADO (proibido): "**PÉROLA DE OURO:** {{Talmud | Tratado Shabbat 69a | ...}}"
           - CERTO: "**PÉROLA DE OURO:** O rabino também reconhecia que um erro cometido sem querer não isenta a pessoa de reparar o mal causado, como mostra {{Talmud | Tratado Shabbat 69a | Traga apenas a discussão específica sobre responsabilidade por erro involuntário}}."
        8. QUEBRA DE PARÁGRAFO OBRIGATÓRIA ANTES DA PÉROLA (ERRO GRAVE SE IGNORADO): "**PÉROLA DE OURO:**" DEVE OBRIGATORIAMENTE começar um parágrafo novo, numa linha própria, separada por quebra de linha do parágrafo anterior. É ESTRITAMENTE PROIBIDO continuar a última frase do parágrafo normal direto para "**PÉROLA DE OURO:**" na mesma linha/parágrafo — isso quebra a renderização visual do sistema (o parágrafo inteiro anterior fica com a formatação da Pérola). A Pérola de Ouro é sempre o INÍCIO de um bloco novo, nunca a continuação de um bloco existente.
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
        10. EMBASAMENTO BÍBLICO FLUÍDO E COMPLETO (REFERÊNCIAS COM LIVRO E CAPÍTULO): Toda afirmação deve ser imediatamente amparada por referências bíblicas entre parênteses fluindo no próprio parágrafo (ex: Lv 6:12-13; Hb 13:15).
           - REGRA CRÍTICA PARA CLICABILIDADE: Mesmo ao citar versículos do próprio capítulo que está sendo estudado, dê sempre preferência a referências com o livro e capítulo: '(${book || 'Livro'} ${chapter || '1'}:8)' ou '(${book || 'Livro'} ${chapter || '1'}:9-10)'. Evite referências soltas sem contexto para que a plataforma gere links bíblicos instantâneos com total precisão!
        11. SELAGEM CRISTOLÓGICA FINAL (ÚNICO APÊNDICE TEMÁTICO): Todo estudo encerra exclusivamente com o apêndice:
           ### TIPOLOGIA: CONEXÃO COM JESUS CRISTO
           (A antiga seção final de Curiosidades e Arqueologia foi extinta: a arqueologia e a história agora estão inseridas in-loco no corpo do texto).
        12. FORMATO OBRIGATÓRIO DA TIPOLOGIA (DE 1 A 5 PARALELOS NUMERADOS E CONCISOS):
           - NUNCA escreva a Tipologia como bloco de texto corrido ou parágrafos contínuos sem numeração!
           - Apresente entre 1 e 5 conexões messiânicas numeradas (de acordo com as sombras genuínas que o capítulo permitir, sem forçar alegorias; tipicamente 2 a 4 paralelos).
           - Cada item DEVE começar com o número arábico seguido de ponto: '1. ', '2. ', '3. ', com título do paralelo seguido de dois pontos.
           - O conteúdo de cada paralelo deve ser DIRETO, LÍMPIDO e NÃO DENSO DEMAIS: exatamente UM parágrafo de 2 a 3 linhas explicando o paralelo entre a figura/sombra do texto estudado e a pessoa, obra, sacrifício, sacerdócio ou graça de Jesus Cristo, fundamentado com a referência bíblica exata do capítulo e a referência do Novo Testamento que sela a tipologia.
           - Exemplo de Padrão Ouro:
             1. O Sacerdote Perfeito e Puro: O sumo sacerdote terreno estava sujeito a contrair impurezas rituais que o impediam temporariamente de ministrar (${book || 'Lv'} ${chapter || '22'}:3-4). Jesus Cristo, contudo, é o nosso perfeito Sumo Sacerdote que permaneceu santo e imaculado, mediando eternamente por nós diante do Pai (Hb 7:26; 9:14).
             2. O Sacrifício Sem Defeito: A exigência de animais machos sem qualquer defeito físico (${book || 'Lv'} ${chapter || '22'}:19-20) prefigura a perfeição moral e espiritual de Jesus Cristo, o verdadeiro Cordeiro sem defeito e sem mácula cujo sangue precioso nos resgatou (1 Pe 1:18-19).

        --- MANDATO CRÍTICO DE VOLUME E RITMO DE ESCRITA (${pages} PÁGINAS = ${wordCountTarget} PALAVRAS) ---
        ${isUpgrade ? `1. VOLUME RIGOROSO NO UPGRADE (ALVO ABSOLUTO: ENTRE ${minWords} E ${maxWords} PALAVRAS): O usuário definiu rigorosamente ${pages} páginas (~${baseWordCount} palavras). Não expanda desenfreadamente.
        2. ATUALIZAÇÃO CIRÚRGICA E COMPACTAÇÃO: Mantenha a essência do texto e enriqueça com os elementos que faltam. Se a aula já for longa, COMPACTE parágrafos redundantes para manter o tamanho estritamente dentro da faixa de ${wordCountTarget} palavras.` : `1. VOLUME RIGOROSO NA CRIAÇÃO (ALVO ABSOLUTO: ENTRE ${minWords} E ${maxWords} PALAVRAS): Planeje o tamanho do texto estruturalmente para respeitar este limite com precisão cirúrgica.`}
        2. TETO MÁXIMO INVIOLÁVEL: NUNCA ultrapasse ${maxWords} palavras! Em uma aula solicitada para ${pages} páginas (~${baseWordCount} palavras), ultrapassar ${maxWords} palavras (ex: gerar 5.000 palavras) é expressamente PROIBIDO e constitui erro grave de extrapolação.
        3. FÓRMULA DE RITMO E DISTRIBUIÇÃO POR SEÇÃO (PACING OBRIGATÓRIO):
           - Introdução do capítulo: 200 a 250 palavras (com ponte viva conectando ao capítulo anterior).
           - Tópicos do estudo (##): divida os versículos do capítulo em 3 a 5 tópicos principais. Cada tópico deve conter entre 350 e 450 palavras no máximo (2 a 3 parágrafos explicativos densos, encerrando com implicação prática orgânica e sem rótulos artificiais).
           - Relatos bíblicos práticos cruzados: mencione o caso prático em 2 a 4 linhas no máximo, sem narrar o capítulo inteiro da história cruzada.
           - Seção final de Tipologia Cristológica: entre 1 e 5 conexões numeradas concisas (cada uma em 2 a 3 linhas, totalizando cerca de 120 a 220 palavras), sem inflar o texto.
        4. CONTROLE DE ERUDIÇÃO: Profundidade teológica significa rigor exegético e clareza didática, NÃO prolixidade. Mantenha o texto fluido e denso sem divagações secundárias.

        --- ESTRUTURA VISUAL OBRIGATÓRIA ---
        1. TÍTULO PRINCIPAL: # PANORAMA BÍBLICO - ${book ? book.toUpperCase() : 'BÍBLIA'} ${chapter || ''} (PROF. MICHEL FELIX)
        ${introInstruction}
        3. TÓPICOS DO ESTUDO: ## 1. TÍTULO DO TÓPICO EM MAIÚSCULO (Referência: ${book || 'Livro'} X:Y-Z)
           - Desenvolva cada tópico com subtópicos ### temáticos descritivos quando necessário, destrinchando os versículos com profundidade, listas enumeradas explicativas, glossários [[Termo|Significado]], Pérolas de Ouro {{Autor|Ref|Comando}}, onomástica hebraica/grega e arqueologia in-loco. A aplicação cristã flui de forma orgânica e implícita no final do tópico.
        4. SEÇÃO FINAL:
           ### TIPOLOGIA: CONEXÃO COM JESUS CRISTO
           1. Título do Paralelo 1: [Explicação concisa em 2 a 3 linhas conectando o paralelo do texto com Cristo e citando as passagens bíblicas]
           2. Título do Paralelo 2: [Explicação concisa em 2 a 3 linhas conectando o paralelo do texto com Cristo e citando as passagens bíblicas]
           (Traga entre 1 e 5 paralelos numerados com '1. ', '2. ', '3. ' para acionar a tipografia capitular do app; NUNCA use texto corrido ou cerquilhas # nos itens).
        5. NÍVEIS DE TÍTULO — SOMENTE ESTES TRÊS, NUNCA MAIS: "#" (só o título principal, uma vez), "##" (tópico do estudo) e "###" (subtópico, incluindo a barra temática "### TIPOLOGIA: CONEXÃO COM JESUS CRISTO"). É PROIBIDO usar "####" ou mais cerquilhas, e é PROIBIDO criar títulos com cerquilha dentro da Tipologia (use unicamente os números '1. ', '2. ', '3. ').
        6. PROIBIÇÃO DE DIVISORES BRUTOS: NUNCA use separadores '---' ou '***' soltos no texto. Separe as seções unicamente com os cabeçalhos '##' e quebras normais de parágrafo.
        `;
        systemInstruction = WRITING_STYLE;
                if (isUpgrade) {
                    enhancedPrompt = `[UPGRADE CIRÚRGICO RESTRITO - ALVO RÍGIDO: ${wordCountTarget} PALAVRAS (${pages} PÁGINAS | TETO INVIOLÁVEL: ${maxWords} PALAVRAS)]: 
                    Aplique todas as diretrizes do Professor Michel Felix: matriz hermenêutica do gênero bíblico, onomástica dos nomes com raiz espiritual, decodificação de costumes forenses antigos, arqueologia in-loco no parágrafo do versículo (sem seção de curiosidades no fim), aplicação prática orgânica e 100% implícita (proibido usar rótulos como 'Aplicação Pastoral:'), desarmamento de erros populares de púlpito, costura entre capítulos, glossários [[Termo|Explicação]], fontes {{Autor|Ref|Comando}} e tipologia messiânica estruturada estritamente em 1 a 5 paralelos numerados (1. , 2. , 3. ), cada um com 2 a 3 linhas (proibido texto corrido na seção de Tipologia). Nunca inclua termos de metalinguagem no texto.
                    INSTRUÇÃO OBRIGATÓRIA (CRUZAMENTO BÍBLICO): Toda afirmação e regra deve estar acompanhada da referência bíblica exata no texto. Você DEVE fazer cruzamentos temáticos com outros textos e livros da Bíblia de forma concisa (2 a 4 linhas por relato).
                    
                    SOLICITAÇÃO / TEXTO DA AULA PARA ATUALIZAR:
                    """
                    ${prompt}
                    """
                    
                    Reescreva e aprimore o conteúdo acima garantindo o rigor, a didática e o tamanho exato de ${wordCountTarget} palavras (${pages} páginas).
                    ⚠️ TRAVA DE SEGURANÇA FINAL: O texto DEVE ter entre ${minWords} e ${maxWords} palavras totais (${pages} páginas). NÃO ultrapasse ${maxWords} palavras sob hipótese alguma! Compacte trechos prolixos do texto original para caber rigorosamente na meta exata.`;
                } else {
                    enhancedPrompt = `[GERAÇÃO DE PANORAMA BÍBLICO MAGNUM OPUS - ALVO RÍGIDO: ${wordCountTarget} PALAVRAS (${pages} PÁGINAS | TETO INVIOLÁVEL: ${maxWords} PALAVRAS)]:
                    
                    SOLICITAÇÃO DE ESTUDO E DIRETRIZES DO PROFESSOR:
                    """
                    ${prompt}
                    """
                    
                    DIRETRIZES FINAIS DE EXECUÇÃO:
                    1. Execute a exegese completa do capítulo solicitado (${book || ''} ${chapter || ''}) obedecendo estritamente a quaisquer instruções e ênfases fornecidas acima.
                    2. Clareza Didática Absoluta: destrinche os versículos de forma profunda e cristalina, explicando a razão de cada detalhe com listas enumeradas explicativas onde for didático. Nunca use rótulos de metalinguagem (como 'Ah! Entendi' ou 'Efeito Ah Entendi').
                    3. TEXTO CRUZADO E ILUSTRAÇÃO BÍBLICA PRÁTICA (CONCISO): Não se limite ao texto base! Conecte com outros textos bíblicos e ilustre com relatos práticos resumidos em 2 a 4 linhas por caso (sem recontar capítulos inteiros). Para toda afirmação, insira a referência bíblica exata no meio do texto.
                    4. Aplique o Glossário Interativo [[Termo|Explicação]] em abundância ao longo do texto.
                    5. Insira as Pérolas de Ouro no formato {{Autor ou Obra | Ref | Comando Oculto}}.
                    6. Arqueologia e História In-Loco: insira achados e costumes diretamente no parágrafo do versículo (a antiga seção de curiosidades no fim foi extinta). Aplicação prática deve vir 100% implícita e orgânica (proibido usar rótulos como 'Aplicação Pastoral:' ou 'Pergunta para a classe:'). Encerre a aula com um gancho reflexivo para o próximo capítulo e finalize exclusivamente com o apêndice "### TIPOLOGIA: CONEXÃO COM JESUS CRISTO" contendo entre 1 e 5 paralelos numerados (1. , 2. , 3. ), cada um com título e explicação concisa de 2 a 3 linhas (nunca texto corrido).
                    7. ⚠️ RITMO E TRAVA DE VOLUME: Mantenha o tamanho RIGOROSAMENTE entre ${minWords} e ${maxWords} palavras (${pages} páginas). NÃO ultrapasse ${maxWords} palavras sob nenhuma hipótese! Regule o tamanho dos tópicos para terminar dentro desta meta.`;
                }
            }

            // Normalizador Seguro de ThinkingConfig para Gemini 3.6 Flash / 3.7 Flash
            // IMPORTANTE (testado e confirmado): no Gemini 3, thinkingBudget (número de tokens) é
            // amplamente ignorado pelo modelo — forçar um teto baixo não reduz o "pensamento" real.
            // O parâmetro que de fato funciona é thinkingLevel (MINIMAL/LOW/MEDIUM/HIGH). Sem nenhum
            // thinkingConfig, o Gemini 3 assume HIGH por padrão (o mais lento). Por isso trocamos aqui
            // para thinkingLevel — mas SÓ nas tarefas onde já confirmamos que é seguro (não há o mesmo
            // risco encontrado no dicionário, que precisa reconstruir texto grego/hebraico original com
            // precisão de crítica textual e pode "atalhar" para Nestle-Aland em vez do Texto Majoritário
            // sob thinking reduzido — a aula cita versículos em português, não reconstrói o original).
            const getThinkingConfig = (lvl) => {
                if (!lvl) return { thinkingLevel: ThinkingLevel.HIGH };
                const s = String(lvl).toLowerCase().trim();
                if (s === 'minimal' || s === 'minimo' || s === 'mínimo' || s === 'off') return { thinkingLevel: ThinkingLevel.MINIMAL };
                if (s === 'low' || s === 'baixo') return { thinkingLevel: ThinkingLevel.LOW };
                if (s === 'medium' || s === 'medio' || s === 'médio' || s === 'padrao' || s === 'padrão') return { thinkingLevel: ThinkingLevel.MEDIUM };
                if (s === 'high' || s === 'maximo' || s === 'máximo' || s === 'profundo') return { thinkingLevel: ThinkingLevel.HIGH };
                return { thinkingLevel: ThinkingLevel.MEDIUM };
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

            // Configuração precisa de thinkingConfig e maxOutputTokens:
            // IMPORTANTE: Nos modelos Gemini 3, os tokens de raciocínio interno ("thinking") são descontados
            // dentro do próprio limite de maxOutputTokens! Portanto, o controle de tamanho do texto visível deve
            // ser feito pelo prompt e pelo thinkingLevel, NUNCA estrangulando o maxOutputTokens (o que causaria
            // corte abrupto da resposta no meio de uma frase ou JSON inválido).
            if (taskType === 'ebd' || taskType === 'teacher_ebd' || taskType === 'thematic_ebd' || taskType === 'upgrade_ebd' || taskType === 'upgrade_teacher_ebd' || taskType === 'upgrade_thematic_ebd') {
                const pages = targetPages ? parseInt(targetPages) : 4;
                const baseWordCount = pages * 600;
                const maxWords = Math.round(baseWordCount * 1.15);
                const tc = getThinkingConfig(thinkingLevel);
                if (tc) config.thinkingConfig = tc;
                
                // Folga ampla para o texto + markdown + glossários + pensamento profundo (HIGH):
                // Garante que a apostila jamais seja cortada antes da conclusão/Tipologia.
                const calculatedTokens = Math.round(maxWords * 2.5) + 12288;
                config.maxOutputTokens = Math.min(65536, Math.max(24576, calculatedTokens));
            } else if (taskType === 'quiz_gen') {
                config.maxOutputTokens = 8192;
                config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
            } else if (taskType === 'dictionary') {
                config.maxOutputTokens = 32768; // Versículos longos (ex: Ester 8:9, Ap 20:4) exigem JSON extenso sem risco de corte
                if (dictionaryGrounded || !isNewTestamentBook(book)) {
                    config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
                } else {
                    config.thinkingConfig = { thinkingLevel: ThinkingLevel.MEDIUM };
                }
            } else if (taskType === 'commentary') {
                config.maxOutputTokens = 8192; // Folga total para o raciocínio MEDIUM + os 3 parágrafos sem risco de truncamento
                config.thinkingConfig = { thinkingLevel: ThinkingLevel.MEDIUM };
            } else if (taskType === 'chapter_focus_suggestion' || taskType === 'thematic_focus_suggestion') {
                config.maxOutputTokens = 8192; // Necessário quando a aula temática já possui ementa extensa de tópicos ## e ###
                config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
            } else if (taskType === 'fetch_primary_source') {
                config.maxOutputTokens = 4096; // Folga segura para citação + tradução em pt-BR + contexto histórico
                config.thinkingConfig = { thinkingLevel: ThinkingLevel.MINIMAL };
                config.temperature = 0.2;
            } else if (taskType === 'metadata') {
                config.maxOutputTokens = 2048;
                config.thinkingConfig = { thinkingLevel: ThinkingLevel.MINIMAL };
                config.temperature = 0.2;
            } else if (taskType === 'assistente_chat' || taskType === 'devotional') {
                config.maxOutputTokens = 8192;
                config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
            } else {
                config.maxOutputTokens = 16384;
                config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
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

    // Classificação inteligente de modelos para distribuir carga entre cotas independentes (evita exaustão prematura e 503 High Demand):
    // - Tarefas auxiliares/rápidas (fontes primárias, epígrafes/metadata, buscador rápido, sugestões de pontos de atenção em segundo plano):
    //   usam 'gemini-3.1-flash-lite', que tem cota própria separada, latência ultrabaixa e preserva 100% da cota do 'gemini-3.6-flash' para as aulas e estudos principais!
    // - Tarefas teológicas principais (EBD Panorama, Guia do Mestre, Estudos Temáticos, Dicionário, Comentário, Devocional, Quiz):
    //   usam 'gemini-3.6-flash' como motor titular e, se uma chave sofrer 503 High Demand no modelo principal, tenta fallback imediato antes de descartar a chave.
    const isLiteTask = [
        'fetch_primary_source',
        'metadata',
        'assistente_chat',
        'chapter_focus_suggestion'
    ].includes(taskType);
    const isFastTask = taskType === 'fetch_primary_source' || taskType === 'metadata';
    const isHeavyLessonTask = ['ebd', 'teacher_ebd', 'thematic_ebd', 'upgrade_ebd', 'upgrade_teacher_ebd', 'upgrade_thematic_ebd'].includes(taskType);
    const perKeyTimeoutMs = isFastTask ? 10000 : (isHeavyLessonTask ? 110000 : 45000);
    const maxBatchTime = isFastTask ? 40000 : 280000;

    for (const apiKey of keysToTryInThisInvocation) {
        const currentHash = hashKey(apiKey);
        // Se estivermos próximos do limite seguro deste ciclo serverless, encerra este lote para o cliente continuar nas demais chaves
        if (Date.now() - functionStartTime > maxBatchTime) {
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
            
            const TARGET_MODEL = isLiteTask ? 'gemini-3.1-flash-lite' : 'gemini-3.6-flash';

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
            
            // 2. Cota excedida (429 / Quota / RESOURCE_EXHAUSTED) ou indisponibilidade temporária (503 / high demand)
            if (msg.includes('429') || msg.includes('Quota') || msg.includes('exhausted') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('503') || msg.includes('high demand') || msg.includes('UNAVAILABLE')) {
                const isDaily = msg.toLowerCase().includes('per day') || msg.toLowerCase().includes('daily') || msg.toLowerCase().includes('budget');
                let cooldownMs = (msg.includes('503') || msg.includes('high demand') || msg.includes('UNAVAILABLE')) ? 15000 : 60000;
                
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

        // Rede de segurança: nenhum bloco ```...``` de ASCII-art é esperado nas aulas de EBD,
        // mas blocos ```json ... ``` (quando a tarefa pede JSON com ou sem schema explícito)
        // DEVEM ter apenas as cercas removidas, preservando o JSON interno!
        const stripCodeFences = (text) => {
            if (schema || taskType === 'metadata' || taskType === 'quiz_gen' || taskType === 'get_bible_verses' || taskType === 'assistente_chat' || taskType === 'devotional') {
                return text.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim();
            }
            return text
                .replace(/```json\s*([\s\S]*?)```/gi, '$1')
                .replace(/```[\s\S]*?```/g, '')
                .replace(/\n{3,}/g, '\n\n');
        };

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

        // Sanitização de Purismo Linguístico: intercepta e substitui qualquer estrangeirismo residual antes da entrega
        const purifyPortuguese = (t) => {
            return t
                // Correções de 'sovereign' com flexão de gênero
                .replace(/\b(graça|iniciativa|vontade|autoridade|mão|soberania)\s+sovereign\b/gi, '$1 soberana')
                .replace(/\b(Deus|Senhor|Criador|Pai|Rei|plano|propósito|decreto)\s+sovereign\b/gi, '$1 soberano')
                .replace(/\bé\s+sovereign\b/gi, 'é soberana')
                .replace(/\bsovereign\b/g, 'soberana')
                .replace(/\bSovereign\b/g, 'Soberana')
                // Outros termos comuns de vazamento da rede neural
                .replace(/\bortopraxie\b/gi, 'ortopraxia')
                .replace(/\bSon\s+de\s+Deus\b/g, 'Filho de Deus')
                .replace(/\bson\s+de\s+Deus\b/g, 'filho de Deus')
                .replace(/\bFather\b/g, 'Pai')
                .replace(/\bcovenant\b/gi, 'aliança')
                .replace(/\bCovenant\b/g, 'Aliança')
                .replace(/\bpropitiation\b/gi, 'propiciação')
                .replace(/\bjustification\b/gi, 'justificação')
                .replace(/\bsanctification\b/gi, 'santificação')
                .replace(/\bredemption\b/gi, 'redenção');
        };

        // Sanitização de Metalinguagem: remove qualquer vazamento acidental de termos internos de instrução
        let sanitizedText = purifyPortuguese(detableify(stripCodeFences(desflowchartify(successResponse))))
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
