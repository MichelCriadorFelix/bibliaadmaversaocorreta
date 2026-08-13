import { QuizQuestion } from '../types';
import { presenceService } from './presenceService';

export interface DuelInvite {
    id: string;
    senderEmail: string;
    senderName: string;
    receiverEmail: string;
    receiverName: string;
    book: string;
    questionsCount: number;
    status: 'pending' | 'accepted' | 'declined' | 'completed' | 'expired';
    questions: QuizQuestion[];
    senderScore?: number;
    receiverScore?: number;
    senderTimeSeconds?: number;
    receiverTimeSeconds?: number;
    winnerEmail?: string | 'draw';
    createdAt: string;
    expiresAt: string;
}

export interface OnlineUser {
    email: string;
    name: string;
    level: number;
    rankTitle: string;
    lastSeen: string;
    activity?: string;
    isAvailable: boolean;
    isBot?: boolean;
}

// Chave do localStorage para suporte offline/local e mock de duelos no preview
const LOCAL_DUEL_STORAGE = 'adma_local_duels';

// BANCO DE PERGUNTAS COM REFERÊNCIAS EXATAS POR LIVRO BÍBLICO
const BOOK_QUESTIONS_DB: Record<string, QuizQuestion[]> = {
    'Gênesis': [
        {
            id: 'gen_1',
            text: 'No relato da criação, em qual dia Deus criou os luzeiros nos céus para governar o dia e a noite?',
            chapterRef: 'Gênesis 1:14-19 (Capítulo 1)',
            options: ['No Quarto Dia', 'No Primeiro Dia', 'No Terceiro Dia', 'No Sexto Dia'],
            correctIndex: 0,
            proofText: 'Gênesis 1:14-19 relata que no quarto dia Deus fez o sol, a lua e as estrelas.'
        },
        {
            id: 'gen_3',
            text: 'Qual foi a consequência profética anunciada à serpente após a queda no Éden (Protoevangelho)?',
            chapterRef: 'Gênesis 3:15 (Capítulo 3)',
            options: [
                'A semente da mulher feriria a cabeça da serpente',
                'A serpente dominaria para sempre sobre a terra',
                'O homem perderia a capacidade de falar com Deus',
                'Os animais seriam destruídos de imediato'
            ],
            correctIndex: 0,
            proofText: 'Gênesis 3:15 é o Protoevangelho: a semente da mulher (Cristo) esmagaria a cabeça da serpente.'
        },
        {
            id: 'gen_6',
            text: 'Por qual razão Deus ordenou a Noé que construísse a arca de madeira de gofer?',
            chapterRef: 'Gênesis 6:5-14 (Capítulo 6)',
            options: [
                'Porque a maldade do homem havia se multiplicado grandemente na terra',
                'Para fazer uma expedição marítima de comércio',
                'Como uma competição entre as famílias antigas',
                'Para escapar de uma seca prolongada'
            ],
            correctIndex: 0,
            proofText: 'Gênesis 6:5-8 destaca que a terra estava corrompida e Noé achou graça aos olhos do Senhor.'
        },
        {
            id: 'gen_8',
            text: 'Como o texto bíblico define a localização de "Ararate", onde a arca pousou após o dilúvio?',
            chapterRef: 'Gênesis 8:4 (Capítulo 8)',
            options: [
                'Sobre os montes de Ararate (região montanhosa)',
                'Em uma cidade fortificada na planície da Mesopotâmia',
                'Em um deserto isolado no sul de Canaã',
                'Em uma ilha marítima desconhecida'
            ],
            correctIndex: 0,
            proofText: 'Gênesis 8:4 registra: "E a arca repousou, no sétimo mês, no dia dezessete do mês, sobre os montes de Ararate".'
        },
        {
            id: 'gen_9',
            text: 'Qual foi o sinal da aliança perpétua que Deus estabeleceu com Noé e toda a criação?',
            chapterRef: 'Gênesis 9:12-17 (Capítulo 9)',
            options: [
                'O arco-íris nas nuvens',
                'Uma coluna de fogo',
                'Uma tábua de pedra gravada',
                'Um altar de ouro puro'
            ],
            correctIndex: 0,
            proofText: 'Gênesis 9:13 afirma: "O meu arco tenho posto nas nuvens; este será por sinal da aliança entre mim e a terra".'
        },
        {
            id: 'gen_11',
            text: 'O que motivou a construção da torre de Babel e o que Deus fez para interrompê-la?',
            chapterRef: 'Gênesis 11:1-9 (Capítulo 11)',
            options: [
                'Queriam fazer um nome célebre para si e Deus confundiu a língua deles',
                'Queriam adorar a Deus no alto e foram abençoados com mais riquezas',
                'Era um farol de navegação destruído por um terremoto',
                'Um templo pagão que foi incendiado por invasores'
            ],
            correctIndex: 0,
            proofText: 'Gênesis 11:4-7 mostra a soberba humana e a confusão das línguas por Deus.'
        },
        {
            id: 'gen_12',
            text: 'Qual foi a grande promessa de Deus a Abrão quando o chamou para sair de sua terra?',
            chapterRef: 'Gênesis 12:1-3 (Capítulo 12)',
            options: [
                'Faria dele uma grande nação e em ti serão benditas todas as famílias da terra',
                'Ele governaria imediatamente como rei do Egito',
                'Ele receberia todo o ouro da Babilônia sem provações',
                'Ele viveria para sempre sem provar a morte física'
            ],
            correctIndex: 0,
            proofText: 'Gênesis 12:2-3 registra a aliança abraâmica e a promessa universal da salvação.'
        },
        {
            id: 'gen_15',
            text: 'Em qual capítulo a fé de Abrão é explicitamente contada como justiça por Deus?',
            chapterRef: 'Gênesis 15:6 (Capítulo 15)',
            options: [
                'Gênesis 15 ("E creu ele no Senhor, e imputou-lhe isto por justiça")',
                'Gênesis 2 ("No relato da criação do jardim")',
                'Gênesis 10 ("Na tábua das nações antigas")',
                'Gênesis 36 ("Na genealogia de Esaú")'
            ],
            correctIndex: 0,
            proofText: 'Gênesis 15:6 é o texto chave da justificação pela fé citado em Romanos e Gálatas.'
        },
        {
            id: 'gen_22',
            text: 'No monte Moriá, quando Deus provou a fé de Abraão, o que foi providenciado no lugar de Isaque?',
            chapterRef: 'Gênesis 22:13 (Capítulo 22)',
            options: [
                'Um carneiro preso pelos chifres num mato (Yahweh Jireh)',
                'Um novilho de um ano sem defeito',
                'Uma pomba branca trazida por um anjo',
                'Nenhum sacrifício foi realizado no monte'
            ],
            correctIndex: 0,
            proofText: 'Gênesis 22:13-14 relata a provisão de Deus: Yahweh Jireh (O Senhor proverá).'
        },
        {
            id: 'gen_50',
            text: 'Qual foi a célebre declaração de José aos seus irmãos que resume a soberania divina em Gênesis?',
            chapterRef: 'Gênesis 50:20 (Capítulo 50)',
            options: [
                '"Vós bem intentastes mal contra mim; porém Deus o intentou para bem"',
                '"Nunca mais quero ver a face de nenhum de vocês"',
                '"Vocês deverão me servir como escravos no Egito"',
                '"O destino é cego e tudo aconteceu por acaso"'
            ],
            correctIndex: 0,
            proofText: 'Gênesis 50:20 coroa a teologia da providência soberana de Deus em todo o livro de Gênesis.'
        }
    ],
    'Êxodo': [
        {
            id: 'exo_3',
            text: 'Como Deus se revelou a Moisés na sarça ardente no monte Horebe ao revelar Seu Santo Nome?',
            chapterRef: 'Êxodo 3:14 (Capítulo 3)',
            options: [
                '"EU SOU O QUE SOU" (Yahweh)',
                '"O Rei dos Céus e dos Mares"',
                '"O Grande Arquiteto Universal"',
                '"O Deus Desconhecido"'
            ],
            correctIndex: 0,
            proofText: 'Êxodo 3:14 revela o Nome divino autoexistente: EU SOU O QUE SOU.'
        },
        {
            id: 'exo_12',
            text: 'Na instituição da primeira Páscoa, o que os israelitas deviam passar nos umbrais das portas?',
            chapterRef: 'Êxodo 12:7-13 (Capítulo 12)',
            options: [
                'O sangue do cordeiro pascoal sem mácula',
                'Azeite de oliva ungido',
                'Água consagrada pelo sacerdote',
                'Mel e ervas amargas'
            ],
            correctIndex: 0,
            proofText: 'Êxodo 12:13 afirma: "O sangue vos será por sinal nas casas em que estiverdes".'
        },
        {
            id: 'exo_14',
            text: 'Diante do exército egípcio e do Mar Vermelho, qual foi a ordem de Deus através de Moisés?',
            chapterRef: 'Êxodo 14:13-15 (Capítulo 14)',
            options: [
                '"Não temais; aquietai-vos e vede o livramento do Senhor... dize aos filhos de Israel que marchem"',
                '"Construam barcos imediatamente para a travessia"',
                '"Voltem e peçam clemência a Faraó"',
                '"Armem-se com espadas para a batalha campal"'
            ],
            correctIndex: 0,
            proofText: 'Êxodo 14:14-15 ensina que o Senhor pelejaria por eles enquanto marchavam pela fé.'
        },
        {
            id: 'exo_20',
            text: 'Em qual capítulo de Êxodo Deus proclama audivelmente no Sinai os Dez Mandamentos (Decálogo)?',
            chapterRef: 'Êxodo 20:1-17 (Capítulo 20)',
            options: [
                'Êxodo 20',
                'Êxodo 10',
                'Êxodo 32',
                'Êxodo 40'
            ],
            correctIndex: 0,
            proofText: 'Êxodo 20 contém a promulgação dos Dez Mandamentos da Lei moral de Deus.'
        },
        {
            id: 'exo_25',
            text: 'Qual era o móvel sagrado onde ficavam as tábuas do testemunho e o propiciatório com os querubins?',
            chapterRef: 'Êxodo 25:10-22 (Capítulo 25)',
            options: [
                'A Arca da Aliança (do Testemunho)',
                'A Mesa dos Pães da Proposição',
                'O Altar de Holocausto de Bronze',
                'A Pia de Cobre'
            ],
            correctIndex: 0,
            proofText: 'Êxodo 25:21-22 descreve a Arca e a presença de Deus sobre o propiciatório.'
        }
    ],
    'Salmos': [
        {
            id: 'ps_1',
            text: 'Como o Salmo 1 descreve o homem bem-aventurado e o contraste com os ímpios?',
            chapterRef: 'Salmos 1:1-3 (Capítulo 1)',
            options: [
                'É como árvore plantada junto a ribeiros de águas, cujo prazer está na lei do Senhor',
                'É como um guerreiro que confia na força do seu arco',
                'É como a palha leve que o vento espalha pelo deserto',
                'É como um filósofo isolado nas montanhas'
            ],
            correctIndex: 0,
            proofText: 'Salmo 1:2-3 declara o deleite na Lei do Senhor dia e noite.'
        },
        {
            id: 'ps_23',
            text: 'Qual é a célebre declaração de confiança e provisão que abre o Salmo 23 de Davi?',
            chapterRef: 'Salmos 23:1 (Capítulo 23)',
            options: [
                '"O Senhor é o meu pastor; nada me faltará"',
                '"O Senhor é a minha rocha e fortaleza"',
                '"Aquele que habita no esconderijo do Altíssimo"',
                '"Bendize, ó minha alma, ao Senhor"'
            ],
            correctIndex: 0,
            proofText: 'Salmo 23:1 é a confissão do cuidado pastoral de Deus sobre as Suas ovelhas.'
        },
        {
            id: 'ps_91',
            text: 'De acordo com o Salmo 91, onde repousa aquele que confia na proteção suprema de Deus?',
            chapterRef: 'Salmos 91:1-2 (Capítulo 91)',
            options: [
                'No esconderijo do Altíssimo, à sombra do Onipotente',
                'Nas fortalezas construídas por mãos humanas',
                'Nos conselhos dos reis deste mundo',
                'Na abundância de bens materiais'
            ],
            correctIndex: 0,
            proofText: 'Salmo 91:1: "Aquele que habita no esconderijo do Altíssimo, à sombra do Onipotente descansará".'
        },
        {
            id: 'ps_119',
            text: 'Qual declaração clássica do Salmo 119 enfatiza o papel da Palavra de Deus como guia prático?',
            chapterRef: 'Salmos 119:105 (Capítulo 119)',
            options: [
                '"Lâmpada para os meus pés é tua palavra e luz para o meu caminho"',
                '"A letra mata, mas o espírito vivifica"',
                '"O céu e a terra passarão sem deixar rastro"',
                '"A sabedoria humana supera todas as coisas"'
            ],
            correctIndex: 0,
            proofText: 'Salmo 119:105 destaca as Escrituras como lâmpada e luz cotidiana.'
        }
    ],
    'Mateus': [
        {
            id: 'mat_5',
            text: 'No Sermão do Monte, como Jesus identifica os Seus discípulos em relação ao mundo?',
            chapterRef: 'Mateus 5:13-14 (Capítulo 5)',
            options: [
                '"Vós sois o sal da terra e a luz do mundo"',
                '"Vós sois os juízes implacáveis das nações"',
                '"Vós sois superiores a todos os homens"',
                '"Vós sois espectadores indiferentes da história"'
            ],
            correctIndex: 0,
            proofText: 'Mateus 5:13-14 ensina a vocação santa e o testemunho dos cristãos no mundo.'
        },
        {
            id: 'mat_6',
            text: 'Ao ensinar sobre a ansiedade e as necessidades da vida, qual prioridade Jesus estabeleceu?',
            chapterRef: 'Mateus 6:33 (Capítulo 6)',
            options: [
                '"Buscai primeiro o Reino de Deus e a sua justiça, e todas estas coisas vos serão acrescentadas"',
                '"Acumulai primeiro tesouros para os dias difíceis"',
                '"Preocupai-vos intensamente com o dia de amanhã"',
                '"Buscai a aprovação dos líderes religiosos"'
            ],
            correctIndex: 0,
            proofText: 'Mateus 6:33 estabelece a primazia absoluta do Reino de Deus.'
        },
        {
            id: 'mat_28',
            text: 'Qual é o mandamento central dado por Jesus Cristo na Grande Comissão?',
            chapterRef: 'Mateus 28:18-20 (Capítulo 28)',
            options: [
                '"Ide, portanto, fazei discípulos de todas as nações, batizando-os e ensinando-os"',
                '"Permanecei isolados no templo de Jerusalém"',
                '"Discuti apenas com os doutores da lei"',
                '"Buscai riquezas terrenas em Meu nome"'
            ],
            correctIndex: 0,
            proofText: 'Mateus 28:19 resume o mandato missionário universal da Igreja.'
        }
    ],
    'João': [
        {
            id: 'jhn_1',
            text: 'Como o prólogo do Evangelho de João apresenta a divindade e eternidade do Verbo (Logos)?',
            chapterRef: 'João 1:1-14 (Capítulo 1)',
            options: [
                '"No princípio era o Verbo, e o Verbo estava com Deus, e o Verbo era Deus... E o Verbo se fez carne"',
                '"O Verbo foi criado como o primeiro dos anjos no tempo"',
                '"O Verbo era apenas um conceito abstrato da filosofia grega"',
                '"O Verbo começou a existir apenas quando nasceu em Belém"'
            ],
            correctIndex: 0,
            proofText: 'João 1:1 e 1:14 atestam a plena divindade e a encarnação do Filho unigênito.'
        },
        {
            id: 'jhn_3',
            text: 'O que Jesus explicou ao mestre Nicodemos sobre a condição essencial para ver o Reino de Deus?',
            chapterRef: 'João 3:3-5 (Capítulo 3)',
            options: [
                '"Aquele que não nascer de novo (da água e do Espírito) não pode ver o Reino de Deus"',
                '"Basta pertencer à linhagem genealógica de Abraão"',
                '"Basta cumprir os rituais externos da lei cerimonial"',
                '"Basta ser um intelectual respeitado em Israel"'
            ],
            correctIndex: 0,
            proofText: 'João 3:3 enfatiza a necessidade absoluta da regeneração espiritual pelo Espírito Santo.'
        },
        {
            id: 'jhn_14',
            text: 'Qual é a declaração de exclusividade salvífica feita por Jesus a Tomé em João 14?',
            chapterRef: 'João 14:6 (Capítulo 14)',
            options: [
                '"Eu sou o caminho, e a verdade, e a vida; ninguém vem ao Pai senão por mim"',
                '"Todos os caminhos morais conduzem igualmente a Deus"',
                '"Eu sou apenas mais um profeta entre muitos na história"',
                '"A salvação depende unicamente das boas obras humanas"'
            ],
            correctIndex: 0,
            proofText: 'João 14:6 é o pilar cristológico da salvação unicamente em Cristo.'
        }
    ],
    'Romanos': [
        {
            id: 'rom_1',
            text: 'Qual é a tese central da carta aos Romanos afirmada pelo apóstolo Paulo no primeiro capítulo?',
            chapterRef: 'Romanos 1:16-17 (Capítulo 1)',
            options: [
                '"O Evangelho é o poder de Deus para a salvação de todo aquele que crê; o justo viverá pela fé"',
                '"A circuncisão exterior é o único meio de justificação"',
                '"A sabedoria dos filósofos gregos redimiu a humanidade"',
                '"As obras da lei mosaica anulam a necessidade de graça"'
            ],
            correctIndex: 0,
            proofText: 'Romanos 1:16-17 define o Evangelho como poder de Deus e a justificação pela fé.'
        },
        {
            id: 'rom_8',
            text: 'Qual certeza triunfante sobre o amor de Deus encerra o grandioso capítulo 8 de Romanos?',
            chapterRef: 'Romanos 8:38-39 (Capítulo 8)',
            options: [
                'Nada poderá nos separar do amor de Deus, que está em Cristo Jesus, nosso Senhor',
                'Que os crentes nunca passarão por aflições nesta vida terrena',
                'Que a lei cerimonial voltará a ser exigida de todos',
                'Que a salvação depende de mantermos o mérito próprio diário'
            ],
            correctIndex: 0,
            proofText: 'Romanos 8:38-39 celebra a inseparável segurança do amor de Deus em Cristo.'
        }
    ],
    'Apocalipse': [
        {
            id: 'rev_1',
            text: 'Como o Senhor ressurreto e glorificado Se apresenta a João na visão da ilha de Patmos?',
            chapterRef: 'Apocalipse 1:17-18 (Capítulo 1)',
            options: [
                '"Eu sou o Primeiro e o Último e o que vivo; estive morto, mas eis que estou vivo pelos séculos dos séculos"',
                '"Eu sou um mestre que aguarda a decisão dos homens"',
                '"Eu sou o anjo protetor das sete igrejas"',
                '"Eu sou a voz do mar sem forma e sem rosto"'
            ],
            correctIndex: 0,
            proofText: 'Apocalipse 1:17-18 revela a majestade soberana de Cristo sobre a morte e o Hades.'
        },
        {
            id: 'rev_21',
            text: 'O que o capítulo 21 de Apocalipse descreve sobre o novo céu, a nova terra e a consolação eterna?',
            chapterRef: 'Apocalipse 21:1-4 (Capítulo 21)',
            options: [
                'Deus habitará com os homens e lhes enxugará dos olhos toda lágrima; não haverá mais morte nem pranto',
                'Um ciclo perpétuo de reencarnações e sofrimentos',
                'A reconstrução do templo terreno de Salomão em Jerusalém física',
                'A destruição definitiva de todas as almas'
            ],
            correctIndex: 0,
            proofText: 'Apocalipse 21:3-4 descreve a bem-aventurança do tabernáculo de Deus com Seu povo remido.'
        }
    ]
};

export const challengeService = {
    // Registrar presença / heartbeat do usuário online na Bíblia/App (Supabase Realtime Channel + HTTP)
    heartbeatPresence: async (params: {
        email: string;
        name: string;
        level: number;
        rankTitle: string;
        activity?: string;
    }) => {
        if (!params.email) return;
        presenceService.initChannel(params);
    },

    // Buscar lista de usuários REALMENTE ONLINE no momento (Supabase Realtime + API + Fallback)
    getAvailableChallengers: async (currentUserEmail: string): Promise<OnlineUser[]> => {
        const cleanCurrent = (currentUserEmail || '').toLowerCase().trim();
        // 1. Obtém do gerenciador de Realtime Presence do Supabase
        const realtimeUsers = presenceService.getOnlineUsers(cleanCurrent);
        if (realtimeUsers.length > 0) {
            return realtimeUsers;
        }

        // 2. Busca da API de Presença
        const httpUsers = await presenceService.fetchHttpOnlineUsers();
        return httpUsers.filter(u => u.email && u.email.toLowerCase() !== cleanCurrent);
    },

    // Gerar perguntas para um livro selecionado com referências de capítulos destacadas
    generateDuelQuestions: async (book: string, count = 10): Promise<QuizQuestion[]> => {
        // Tenta buscar perguntas do livro no banco de perguntas ricas
        const bookKey = Object.keys(BOOK_QUESTIONS_DB).find(
            k => k.toLowerCase() === book.toLowerCase() || book.toLowerCase().includes(k.toLowerCase())
        );

        let pool: QuizQuestion[] = [];
        if (bookKey && BOOK_QUESTIONS_DB[bookKey]) {
            pool = [...BOOK_QUESTIONS_DB[bookKey]];
        }

        // Tenta também agregar de outros livros se for Bíblia Geral ou precisar completar
        if (pool.length < count) {
            Object.values(BOOK_QUESTIONS_DB).forEach(list => {
                list.forEach(q => {
                    if (!pool.some(p => p.id === q.id)) {
                        pool.push(q);
                    }
                });
            });
        }

        // Embaralha as perguntas
        return pool.sort(() => 0.5 - Math.random()).slice(0, count);
    },

    // Enviar convite de duelo (Persistência Supabase + Realtime Broadcast)
    sendInvite: async (params: {
        senderEmail: string;
        senderName: string;
        receiverEmail: string;
        receiverName: string;
        book: string;
    }): Promise<DuelInvite> => {
        const questions = await challengeService.generateDuelQuestions(params.book, 10);

        const res = await fetch('/api/duel-invite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...params, questions }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Falha ao enviar convite.');
        return data.invite;
    },

    // Aceitar, Recusar ou Expirar convite (Persistência Supabase + Realtime Broadcast)
    respondInvite: async (inviteId: string, status: 'accepted' | 'declined' | 'expired'): Promise<boolean> => {
        const res = await fetch('/api/duel-respond', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inviteId, status }),
        });
        return res.ok;
    },

    // Salvar resultado do duelo e atribuir XP
    finishDuel: async (inviteId: string, results: {
        userEmail: string;
        score: number;
        timeSeconds: number;
    }) => {
        const stored: DuelInvite[] = JSON.parse(localStorage.getItem(LOCAL_DUEL_STORAGE) || '[]');
        const index = stored.findIndex(i => i.id === inviteId);
        if (index >= 0) {
            const duel = stored[index];
            if (duel.senderEmail === results.userEmail.toLowerCase()) {
                duel.senderScore = results.score;
                duel.senderTimeSeconds = results.timeSeconds;
            } else {
                duel.receiverScore = results.score;
                duel.receiverTimeSeconds = results.timeSeconds;
            }

            duel.status = 'completed';
            localStorage.setItem(LOCAL_DUEL_STORAGE, JSON.stringify(stored));
            return duel;
        }
        return null;
    }
};
