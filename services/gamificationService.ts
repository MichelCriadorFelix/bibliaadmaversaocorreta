// Motor de Gamificação, Níveis, XP e Conquistas (36 Medalhas) - Bíblia ADMA

export interface Achievement {
    id: string;
    title: string;
    description: string;
    category: 'reading' | 'ebd' | 'thematic' | 'quiz' | 'duel' | 'special';
    tier: 'bronze' | 'silver' | 'gold' | 'diamond';
    iconName: string;
    xpReward: number;
    checkUnlocked: (stats: GamificationStats) => boolean;
    progressCalc?: (stats: GamificationStats) => { current: number; total: number };
}

export interface UserRank {
    level: number;
    title: string;
    minXp: number;
    maxXp: number;
    icon: string;
    color: string;
}

export interface GamificationStats {
    chaptersRead: number;
    ebdRead: number;
    thematicRead: number;
    quizzesCompleted: number;
    quizPoints: number;
    duelWins: number;
    duelMatches: number;
    duelLosses: number;
    duelDraws: number;
    highlightsCount: number;
    attendanceCount: number;
    plansCompleted: number;
}

// Tabela de Patentes e Títulos (1 a 50)
export const USER_RANKS: UserRank[] = [
    { level: 1, title: 'Iniciante na Fé', minXp: 0, maxXp: 499, icon: 'Seedling', color: 'from-amber-700 to-amber-900' },
    { level: 5, title: 'Discípulo Zeloso', minXp: 500, maxXp: 1499, icon: 'BookOpen', color: 'from-emerald-700 to-emerald-900' },
    { level: 10, title: 'Leitor Fiel', minXp: 1500, maxXp: 3499, icon: 'Scroll', color: 'from-blue-700 to-blue-900' },
    { level: 15, title: 'Estudante da EBD', minXp: 3500, maxXp: 6999, icon: 'GraduationCap', color: 'from-indigo-700 to-indigo-900' },
    { level: 20, title: 'Pesquisador da Palavra', minXp: 7000, maxXp: 11999, icon: 'Compass', color: 'from-purple-700 to-purple-900' },
    { level: 25, title: 'Guerreiro de Oração', minXp: 12000, maxXp: 19999, icon: 'Shield', color: 'from-pink-700 to-pink-900' },
    { level: 30, title: 'Mestre da Sabedoria', minXp: 20000, maxXp: 31999, icon: 'Flame', color: 'from-amber-500 to-amber-700' },
    { level: 35, title: 'Teólogo Honorário', minXp: 32000, maxXp: 49999, icon: 'Award', color: 'from-red-700 to-red-900' },
    { level: 40, title: 'Guardião dos Mistérios', minXp: 50000, maxXp: 74999, icon: 'Star', color: 'from-yellow-500 to-amber-600' },
    { level: 50, title: 'Mestre Doutor das Escrituras', minXp: 75000, maxXp: 999999, icon: 'Crown', color: 'from-yellow-400 via-amber-300 to-yellow-600' },
];

export const XP_TABLE = {
    CHAPTER_READ: 10,       // 10 XP por capítulo lido
    EBD_LESSON: 50,         // 50 XP por estudo EBD
    THEMATIC_LESSON: 60,    // 60 XP por aula temática
    QUIZ_CORRECT_ANSWER: 15,// 15 XP por acerto no quiz
    DUEL_WIN: 100,          // 100 XP por vitória no duelo
    DUEL_DRAW: 40,          // 40 XP por empate
    DUEL_PARTICIPATION: 20, // 20 XP por participação
    PLAN_COMPLETED: 200,    // 200 XP por plano concluído
};

// 36 Conquistas detalhadas com critérios e raridades
export const ACHIEVEMENTS: Achievement[] = [
    // --- LEITURA BÍBLICA ---
    {
        id: 'read_first_chapter',
        title: 'Primeiro Passo',
        description: 'Leia o seu primeiro capítulo na Bíblia Sagrada.',
        category: 'reading',
        tier: 'bronze',
        iconName: 'BookOpen',
        xpReward: 50,
        checkUnlocked: (s) => s.chaptersRead >= 1,
        progressCalc: (s) => ({ current: Math.min(s.chaptersRead, 1), total: 1 }),
    },
    {
        id: 'read_genesis',
        title: 'No Princípio',
        description: 'Leia 50 capítulos da Bíblia (equivalente ao livro de Gênesis).',
        category: 'reading',
        tier: 'bronze',
        iconName: 'Sparkles',
        xpReward: 150,
        checkUnlocked: (s) => s.chaptersRead >= 50,
        progressCalc: (s) => ({ current: Math.min(s.chaptersRead, 50), total: 50 }),
    },
    {
        id: 'read_centurion',
        title: 'Centurião da Leitura',
        description: 'Complete 100 capítulos lidos.',
        category: 'reading',
        tier: 'silver',
        iconName: 'Shield',
        xpReward: 300,
        checkUnlocked: (s) => s.chaptersRead >= 100,
        progressCalc: (s) => ({ current: Math.min(s.chaptersRead, 100), total: 100 }),
    },
    {
        id: 'read_pentateuch',
        title: 'A Lei do Senhor',
        description: 'Leia 187 capítulos (volume da Torah / Pentateuco).',
        category: 'reading',
        tier: 'silver',
        iconName: 'Scroll',
        xpReward: 500,
        checkUnlocked: (s) => s.chaptersRead >= 187,
        progressCalc: (s) => ({ current: Math.min(s.chaptersRead, 187), total: 187 }),
    },
    {
        id: 'read_new_testament',
        title: 'Nova Aliança',
        description: 'Leia 260 capítulos (volume do Novo Testamento completo).',
        category: 'reading',
        tier: 'gold',
        iconName: 'Sun',
        xpReward: 800,
        checkUnlocked: (s) => s.chaptersRead >= 260,
        progressCalc: (s) => ({ current: Math.min(s.chaptersRead, 260), total: 260 }),
    },
    {
        id: 'read_half_bible',
        title: 'Metade do Caminho',
        description: 'Complete 595 capítulos lidos.',
        category: 'reading',
        tier: 'gold',
        iconName: 'Compass',
        xpReward: 1200,
        checkUnlocked: (s) => s.chaptersRead >= 595,
        progressCalc: (s) => ({ current: Math.min(s.chaptersRead, 595), total: 595 }),
    },
    {
        id: 'read_bible_complete',
        title: 'Sola Scriptura',
        description: 'Leia todos os 1.189 capítulos da Bíblia Sagrada.',
        category: 'reading',
        tier: 'diamond',
        iconName: 'Crown',
        xpReward: 3000,
        checkUnlocked: (s) => s.chaptersRead >= 1189,
        progressCalc: (s) => ({ current: Math.min(s.chaptersRead, 1189), total: 1189 }),
    },

    // --- EBD & ESTUDOS PANORAMA ---
    {
        id: 'ebd_first',
        title: 'Aluno Aplicado',
        description: 'Conclua a leitura do seu primeiro estudo na EBD Panorama.',
        category: 'ebd',
        tier: 'bronze',
        iconName: 'GraduationCap',
        xpReward: 50,
        checkUnlocked: (s) => s.ebdRead >= 1,
        progressCalc: (s) => ({ current: Math.min(s.ebdRead, 1), total: 1 }),
    },
    {
        id: 'ebd_5',
        title: 'Buscador de Erudição',
        description: 'Complete 5 estudos bíblicos da EBD Panorama.',
        category: 'ebd',
        tier: 'bronze',
        iconName: 'BookOpen',
        xpReward: 150,
        checkUnlocked: (s) => s.ebdRead >= 5,
        progressCalc: (s) => ({ current: Math.min(s.ebdRead, 5), total: 5 }),
    },
    {
        id: 'ebd_20',
        title: 'Teólogo Junior',
        description: 'Complete 20 estudos profundos da EBD.',
        category: 'ebd',
        tier: 'silver',
        iconName: 'Award',
        xpReward: 400,
        checkUnlocked: (s) => s.ebdRead >= 20,
        progressCalc: (s) => ({ current: Math.min(s.ebdRead, 20), total: 20 }),
    },
    {
        id: 'ebd_50',
        title: 'Mestre da EBD',
        description: 'Complete 50 estudos profundos do Panorama Bíblico.',
        category: 'ebd',
        tier: 'gold',
        iconName: 'Flame',
        xpReward: 1000,
        checkUnlocked: (s) => s.ebdRead >= 50,
        progressCalc: (s) => ({ current: Math.min(s.ebdRead, 50), total: 50 }),
    },
    {
        id: 'ebd_100',
        title: 'Doutor da Escola Bíblica',
        description: 'Complete 100 estudos da EBD Panorama com exegese avançada.',
        category: 'ebd',
        tier: 'diamond',
        iconName: 'Crown',
        xpReward: 2500,
        checkUnlocked: (s) => s.ebdRead >= 100,
        progressCalc: (s) => ({ current: Math.min(s.ebdRead, 100), total: 100 }),
    },

    // --- SÉRIES TEMÁTICAS ---
    {
        id: 'thematic_first',
        title: 'Iniciado nas Séries',
        description: 'Conclua a sua primeira aula de uma Série Temática Especial.',
        category: 'thematic',
        tier: 'bronze',
        iconName: 'FileText',
        xpReward: 60,
        checkUnlocked: (s) => s.thematicRead >= 1,
        progressCalc: (s) => ({ current: Math.min(s.thematicRead, 1), total: 1 }),
    },
    {
        id: 'thematic_10',
        title: 'Pesquisador de Temas',
        description: 'Conclua 10 aulas temáticas especiais.',
        category: 'thematic',
        tier: 'silver',
        iconName: 'Layers',
        xpReward: 350,
        checkUnlocked: (s) => s.thematicRead >= 10,
        progressCalc: (s) => ({ current: Math.min(s.thematicRead, 10), total: 10 }),
    },
    {
        id: 'thematic_30',
        title: 'Série Ouro Completa',
        description: 'Conclua 30 aulas temáticas de alta profundidade.',
        category: 'thematic',
        tier: 'gold',
        iconName: 'Medal',
        xpReward: 900,
        checkUnlocked: (s) => s.thematicRead >= 30,
        progressCalc: (s) => ({ current: Math.min(s.thematicRead, 30), total: 30 }),
    },

    // --- QUIZ & CONHECIMENTO ---
    {
        id: 'quiz_first',
        title: 'Primeiro Teste',
        description: 'Complete seu primeiro Quiz de fixação bíblica.',
        category: 'quiz',
        tier: 'bronze',
        iconName: 'HelpCircle',
        xpReward: 50,
        checkUnlocked: (s) => s.quizzesCompleted >= 1,
        progressCalc: (s) => ({ current: Math.min(s.quizzesCompleted, 1), total: 1 }),
    },
    {
        id: 'quiz_50_pts',
        title: 'Sábio em Treinamento',
        description: 'Acumule 50 pontos no Quiz bíblico.',
        category: 'quiz',
        tier: 'bronze',
        iconName: 'Brain',
        xpReward: 150,
        checkUnlocked: (s) => s.quizPoints >= 50,
        progressCalc: (s) => ({ current: Math.min(s.quizPoints, 50), total: 50 }),
    },
    {
        id: 'quiz_200_pts',
        title: 'Conhecedor das Escrituras',
        description: 'Acumule 200 pontos respondendo quizzes.',
        category: 'quiz',
        tier: 'silver',
        iconName: 'Zap',
        xpReward: 400,
        checkUnlocked: (s) => s.quizPoints >= 200,
        progressCalc: (s) => ({ current: Math.min(s.quizPoints, 200), total: 200 }),
    },
    {
        id: 'quiz_500_pts',
        title: 'Mestre dos Testes',
        description: 'Alcance 500 pontos totais no Quiz.',
        category: 'quiz',
        tier: 'gold',
        iconName: 'Trophy',
        xpReward: 1000,
        checkUnlocked: (s) => s.quizPoints >= 500,
        progressCalc: (s) => ({ current: Math.min(s.quizPoints, 500), total: 500 }),
    },
    {
        id: 'quiz_1000_pts',
        title: 'Enciclopédia Viva',
        description: 'Acumule 1.000 pontos no Quiz Bíblico ADMA.',
        category: 'quiz',
        tier: 'diamond',
        iconName: 'Crown',
        xpReward: 2500,
        checkUnlocked: (s) => s.quizPoints >= 1000,
        progressCalc: (s) => ({ current: Math.min(s.quizPoints, 1000), total: 1000 }),
    },

    // --- DESAFIOS E DUELOS PVP ---
    {
        id: 'duel_first',
        title: 'Primeiro Duelo',
        description: 'Participe do seu primeiro duelo bíblico 1v1.',
        category: 'duel',
        tier: 'bronze',
        iconName: 'Swords',
        xpReward: 75,
        checkUnlocked: (s) => s.duelMatches >= 1,
        progressCalc: (s) => ({ current: Math.min(s.duelMatches, 1), total: 1 }),
    },
    {
        id: 'duel_first_win',
        title: 'Primeira Vitória',
        description: 'Vença o seu primeiro duelo bíblico contra outro irmão.',
        category: 'duel',
        tier: 'bronze',
        iconName: 'Trophy',
        xpReward: 100,
        checkUnlocked: (s) => s.duelWins >= 1,
        progressCalc: (s) => ({ current: Math.min(s.duelWins, 1), total: 1 }),
    },
    {
        id: 'duel_5_wins',
        title: 'Gladiador da Fé',
        description: 'Vença 5 duelos bíblicos na Arena ADMA.',
        category: 'duel',
        tier: 'silver',
        iconName: 'ShieldAlert',
        xpReward: 350,
        checkUnlocked: (s) => s.duelWins >= 5,
        progressCalc: (s) => ({ current: Math.min(s.duelWins, 5), total: 5 }),
    },
    {
        id: 'duel_15_wins',
        title: 'Campeão da Arena',
        description: 'Acumule 15 vitórias em duelos bíblicos.',
        category: 'duel',
        tier: 'gold',
        iconName: 'Medal',
        xpReward: 800,
        checkUnlocked: (s) => s.duelWins >= 15,
        progressCalc: (s) => ({ current: Math.min(s.duelWins, 15), total: 15 }),
    },
    {
        id: 'duel_50_wins',
        title: 'Invencível na Palavra',
        description: 'Conquiste 50 vitórias em duelos da Arena ADMA.',
        category: 'duel',
        tier: 'diamond',
        iconName: 'Crown',
        xpReward: 2500,
        checkUnlocked: (s) => s.duelWins >= 50,
        progressCalc: (s) => ({ current: Math.min(s.duelWins, 50), total: 50 }),
    },

    // --- ESPECIAIS & FIDELIDADE ---
    {
        id: 'plan_finisher',
        title: 'Fiel no Propósito',
        description: 'Conclua com sucesso um Plano de Leitura Bíblica.',
        category: 'special',
        tier: 'silver',
        iconName: 'CheckCircle2',
        xpReward: 300,
        checkUnlocked: (s) => s.plansCompleted >= 1,
        progressCalc: (s) => ({ current: Math.min(s.plansCompleted, 1), total: 1 }),
    },
    {
        id: 'highlighter_active',
        title: 'Pena Dourada',
        description: 'Marque ou destaque 20 versículos bíblicos de ouro.',
        category: 'special',
        tier: 'bronze',
        iconName: 'Highlighter',
        xpReward: 100,
        checkUnlocked: (s) => s.highlightsCount >= 20,
        progressCalc: (s) => ({ current: Math.min(s.highlightsCount, 20), total: 20 }),
    },
    {
        id: 'attendance_gold',
        title: 'Coluna no Templo',
        description: 'Acumule 10 presenças registradas na Escola Bíblica Dominical.',
        category: 'special',
        tier: 'gold',
        iconName: 'HeartHandshake',
        xpReward: 600,
        checkUnlocked: (s) => s.attendanceCount >= 10,
        progressCalc: (s) => ({ current: Math.min(s.attendanceCount, 10), total: 10 }),
    },
];

export const calculateUserStats = (userProgress: any): GamificationStats => {
    const chaptersRead = userProgress?.chapters_read?.length || userProgress?.total_chapters || 0;
    const ebdRead = userProgress?.ebd_read?.length || userProgress?.total_ebd_read || 0;
    const thematicRead = userProgress?.thematic_read?.length || userProgress?.total_thematic_read || 0;
    const quizzesCompleted = userProgress?.quizzes_taken?.length || 0;
    const quizPoints = userProgress?.quiz_points || 0;
    const duelWins = userProgress?.duel_wins || 0;
    const duelMatches = userProgress?.duel_matches || (duelWins + (userProgress?.duel_losses || 0) + (userProgress?.duel_draws || 0));
    const duelLosses = userProgress?.duel_losses || 0;
    const duelDraws = userProgress?.duel_draws || 0;
    const highlightsCount = userProgress?.highlights?.length || 0;
    const attendanceCount = userProgress?.ebd_attendance?.p || 0;
    const plansCompleted = (userProgress?.active_plans || []).filter((p: any) => p.isCompleted).length;

    return {
        chaptersRead,
        ebdRead,
        thematicRead,
        quizzesCompleted,
        quizPoints,
        duelWins,
        duelMatches,
        duelLosses,
        duelDraws,
        highlightsCount,
        attendanceCount,
        plansCompleted,
    };
};

export const calculateTotalXP = (stats: GamificationStats): number => {
    let xp = 0;
    xp += stats.chaptersRead * XP_TABLE.CHAPTER_READ;
    xp += stats.ebdRead * XP_TABLE.EBD_LESSON;
    xp += stats.thematicRead * XP_TABLE.THEMATIC_LESSON;
    xp += stats.quizPoints * 10;
    xp += stats.duelWins * XP_TABLE.DUEL_WIN;
    xp += stats.duelDraws * XP_TABLE.DUEL_DRAW;
    xp += stats.duelMatches * XP_TABLE.DUEL_PARTICIPATION;
    xp += stats.plansCompleted * XP_TABLE.PLAN_COMPLETED;

    // Adiciona XP das conquistas desbloqueadas
    ACHIEVEMENTS.forEach(ach => {
        if (ach.checkUnlocked(stats)) {
            xp += ach.xpReward;
        }
    });

    return xp;
};

export const getUserRank = (totalXp: number): UserRank & { currentRankXp: number; nextRankXp: number; percent: number; currentLevel: number } => {
    // Nível matemático dinâmico (1 a 50)
    // Nível = Math.floor(Math.sqrt(totalXp / 30)) + 1
    const rawLevel = Math.floor(Math.sqrt(totalXp / 30)) + 1;
    const currentLevel = Math.min(50, Math.max(1, rawLevel));

    // Encontra o título correspondente mais alto que o usuário atingiu
    let matchedRank = USER_RANKS[0];
    for (const rank of USER_RANKS) {
        if (currentLevel >= rank.level) {
            matchedRank = rank;
        }
    }

    // Calcula XP para o próximo nível
    const currentLevelMinXp = Math.floor(Math.pow(currentLevel - 1, 2) * 30);
    const nextLevelXp = Math.floor(Math.pow(currentLevel, 2) * 30);
    const range = Math.max(1, nextLevelXp - currentLevelMinXp);
    const progressInLevel = Math.max(0, totalXp - currentLevelMinXp);
    const percent = Math.min(100, Math.max(0, (progressInLevel / range) * 100));

    return {
        ...matchedRank,
        currentLevel,
        currentRankXp: currentLevelMinXp,
        nextRankXp: nextLevelXp,
        percent,
    };
};

export const getUnlockedAchievements = (stats: GamificationStats) => {
    return ACHIEVEMENTS.filter(ach => ach.checkUnlocked(stats));
};
