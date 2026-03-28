
export interface Verse {
  number: number;
  text: string;
}

export type SourceMode = 'offline' | 'online' | 'cloud';

export interface BibleBook {
  name: string;
  abbrev: string;
  chapters: number;
  testament: 'old' | 'new';
}

export interface ReadingPlan {
  id: string;
  name: string;
  books: string[];
  description: string;
  estimatedDays: number;
}

export interface ActivePlan {
  planId: string;
  startDate: string; // ISO Date
  isCompleted: boolean;
  completedDate?: string;
}

export interface Highlight {
  id?: string;
  verse_key: string; // ex: genesis_1_1
  color: string; // hex code ou nome da classe tailwind
  date: string;
}

export interface QuizQuestion {
    id: string;
    text: string;
    options: string[];
    correctIndex: number;
    proofText: string; // O trecho exato da aula que comprova a resposta
}

export interface Quiz {
    id?: string;
    chapter_key: string; // ex: genesis_1
    type: 'class' | 'general'; // 'class' = 5 perguntas da aula, 'general' = avaliação de 10
    title: string;
    questions: QuizQuestion[];
    is_visible: boolean; // Controle do Admin para liberar
    released_at?: string; // DATA/HORA EXATA DA LIBERAÇÃO (Para travar ranking após o tempo)
    time_limit_minutes?: number; // Tempo para fazer (opcional)
    created_at: string;
}

export interface ThematicTheme {
    id?: string;
    title: string;
    description: string;
    created_at: string;
    cover_style?: string; // Reservado para futuro (cor/gradiente)
    is_starred?: boolean; // Prioridade (Fixar no Topo)
    access_password?: string; // NOVA TRAVA DE SEGURANÇA
}

export interface ThematicFolder {
    id?: string;
    theme_id: string;
    title: string;
    created_at: string;
    order_index: number;
}

export interface ThematicLesson {
    id?: string;
    theme_id: string;
    folder_id?: string; // VINCULO COM A PASTA (OPCIONAL)
    title: string;
    order_index: number;
    content: string; // HTML/Markdown gerado pela IA
    is_published: boolean;
}

// NOVA INTERFACE PARA FREQUÊNCIA EBD
export interface EbdAttendanceHistory {
    date: string;
    status: 'P' | 'A' | 'F';
}

export interface EbdAttendanceState {
    p: number; // Total Presenças no período
    a: number; // Total Atrasos no período
    f: number; // Total Faltas no período
    last_status: 'P' | 'A' | 'F' | null; // O que foi marcado hoje/última vez
    last_updated: string; // Data YYYY-MM-DD para validar edição no mesmo dia
    history?: EbdAttendanceHistory[]; // Histórico detalhado
}

export interface QuizAttempt {
    quiz_id: string;
    questions: QuizQuestion[]; 
    answers: (number | null)[];
    current_index: number;
    score: number;
    is_finished: boolean;
    time_left?: number; // Tempo restante em segundos
    started_at: string;
    updated_at: string;
}

export interface UserProgress {
  user_email: string;
  user_name: string;
  password_pin?: string; 
  is_blocked?: boolean; 
  reset_requested?: boolean; 
  chapters_read: string[];
  total_chapters: number;
  last_book?: string;
  last_chapter?: number;
  active_plans?: ActivePlan[];
  ebd_read: string[]; 
  total_ebd_read?: number; 
  // Novo campo para rastrear aulas temáticas lidas (IDs das lessons)
  thematic_read?: string[];
  total_thematic_read?: number;
  // NOVO CAMPO DE FREQUÊNCIA
  ebd_attendance?: EbdAttendanceState;
  // NOVO: Séries temáticas desbloqueadas (ID do tema -> Senha usada)
  unlocked_themes?: Record<string, string>;
  highlights?: Highlight[];
  quiz_points?: number; // Pontos acumulados no Quiz
  quizzes_taken?: string[]; // IDs dos quizzes já realizados
  quiz_attempts?: Record<string, QuizAttempt>; // NOVO: Rastreio de tentativas em andamento
  id?: string;
  created_at?: string;
}

export interface ChapterMetadata {
  id?: string;
  chapter_key: string;
  title: string;
  subtitle: string;
}

export interface Commentary {
  id?: string;
  book: string;
  chapter: number;
  verse: number;
  verse_key: string;
  commentary_text: string;
}

export interface DictionaryWord {
  original: string;
  transliteration: string;
  portuguese: string;
  polysemy: string;
  etymology: string;
  grammar: string;
  contextual_meaning?: string; // NOVO: Sentido aplicado neste verso (Exegese)
  exegetical_note?: string; // NOVO: Nota sobre a escolha da palavra (Profundidade Teológica)
}

export interface DictionaryEntry {
  id?: string;
  verse_key: string;
  book: string;
  chapter: number;
  verse: number;
  original_text: string;
  transliteration: string;
  key_words: DictionaryWord[];
}

export interface EBDContent {
  id?: string;
  study_key: string;
  book: string;
  chapter: number;
  title: string;
  outline: string[];
  student_content: string;
  teacher_content: string;
  last_generated_part?: number;
}

export interface Devotional {
  id?: string;
  date: string;
  title: string;
  reference: string;
  verse_text: string;
  body: string;
  prayer: string;
  is_published: boolean;
}

export interface PrayerRequest {
  id?: string;
  user_name: string;
  user_email: string;
  request_text: string;
  date: string; 
  prayer_count: number;
  praying_users?: string[]; // Lista de emails de quem vai orar
  category: 'saude' | 'familia' | 'espiritual' | 'financeiro' | 'outros';
}

export interface Announcement {
  id?: string;
  title: string;
  message: string;
  date: string;
  author: string;
  priority: 'alta' | 'normal';
}

export interface ContentReport {
  id?: string;
  type: 'commentary' | 'dictionary' | 'other';
  reference_text: string; 
  report_text: string;
  user_name?: string; 
  date: string;
  status: 'pending' | 'resolved';
}

export interface AppConfig {
    id: string; 
    theme: {
        primaryColor: string;
        secondaryColor: string;
        appName: string;
    };
    features: {
        enableRanking: boolean;
        enableDevotional: boolean;
        enablePlans: boolean;
        enableMessages: boolean;
    };
    auth: {
        requirePasswordLogin: boolean; 
        adminPassword?: string;
    };
}

export interface DynamicModule {
    id: string;
    type: 'quiz' | 'page' | 'link';
    title: string;
    description: string;
    iconName: string; 
    accessLevel: 'public' | 'admin' | 'login';
    data: any; 
}

// Added AssistenteMessage for AI Assistant functionality
export interface AssistenteMessage {
    role: 'user' | 'model';
    text: string;
    action?: {
        type: 'navigate';
        target: 'panorama' | 'reader';
        book: string;
        chapter: number;
    };
}
