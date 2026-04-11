import React, { useEffect, useRef } from 'react';
import { 
  ChevronLeft, ChevronDown, GraduationCap, Lock, BookOpen, ChevronRight, Volume2, 
  Sparkles, Loader2, Book, Trash2, Edit, Save, X, CheckCircle, 
  Pause, Play, Settings, FastForward, Info, FileText, Languages, 
  History, Clock, AlertTriangle, Search, BookMarked, Quote, Plus, 
  ShieldCheck, ArrowUpCircle, BookText, Bookmark, PenTool, Layout, 
  Layers, Zap, HelpCircle, MessageSquare, ClipboardCheck, ScrollText,
  Library, Map, Compass, Gem, Anchor, History as HistoryIcon, SearchCode,
  ShieldAlert, BookCheck, FileSearch, Pen, RefreshCw, Milestone, 
  Binary, Database, Cpu, Microscope, Ruler, ClipboardList, PenLine,
  Activity, Gauge, FileDigit, AlignLeft, Scale, Terminal, Layers2, ShieldHalf,
  ChevronUp, Maximize2, Minimize2, MousePointer2, Smartphone, Monitor,
  Eye, EyeOff, Check, AlertCircle, Info as InfoIcon, Target, Cpu as CpuIcon,
  HardDrive, Database as DbIcon, Shield, Server, Box, Layers as LayersIcon,
  BookCopy, FilePlus, Share2, Clipboard, Navigation, SearchX, Globe, 
  FileCheck, ShieldIcon, UserCheck, MessageCircle, Heart, ZapOff,
  Cloud, CloudLightning, DatabaseZap, TerminalSquare, LayoutDashboard,
  Columns, Rows, Grid, List as ListIcon, Type, AlignCenter, AlignRight,
  Maximize, Minimize, VolumeX, Ghost, Coffee, BookHeart, BookmarkPlus,
  Compass as CompassIcon, Fingerprint, Key, ShieldQuestion, UserPlus,
  Settings2, Wrench, Briefcase, Award, Medal, Zap as Lightning,
  Code, Command, Terminal as Console, TerminalSquare as TerminalIcon,
  GitBranch, GitCommit, GitMerge, GitPullRequest, GitCompare,
  HardDrive as Disk, Cpu as Processor, Database as DataCenter,
  Server as CloudServer, Box as Package, Layers as Stack,
  Shield as Security, FileSearch as Audit, ClipboardCheck as Quality,
  Zap as Performance, History as Versioning, Globe as Global,
  Languages as Localization, UserCheck as Auth, Lock as Encryption,
  SearchCode as Debug, Rocket, Stars, Sun, Moon, CloudSun,
  LayoutTemplate, Sidebar, AppWindow, PanelTop, PanelRight,
  PanelBottom, PanelLeft, Columns3, Rows3, Grid3X3, StretchHorizontal,
  StretchVertical, Maximize as Fit, Minimize as Shrink, Move,
  Hand, Pointer, Mouse, Laptop, Tablet, Watch, Tv, Command as CmdIcon,
  Brain, FolderOpen, List, File, ArrowLeft, Star, ArrowUp, ArrowDown,
  Folder, FolderPlus, Unlock
} from 'lucide-react';
import { BIBLE_BOOKS, generateChapterKey } from '../../constants';
import { UserProgress, ThematicTheme, ThematicLesson, BibleBook } from '../../types';
import { db } from '../../services/database';
import { motion, AnimatePresence } from 'framer-motion';
import QuizRunner from './QuizRunner';
import { usePanoramaView } from '../../hooks/usePanoramaView';
import { useUserProgress } from '../../hooks/useUserProgress';
import { EbdContentRenderer } from './EbdContentRenderer';
import { PanoramaAdminPanel } from './PanoramaAdminPanel';
import { ThematicManager } from './ThematicManager';
import { BibleReference } from './BibleReference';
import { GlossaryTerm } from './GlossaryTerm';
import { PrimarySource } from './PrimarySource';

interface PanoramaProps {
    isAdmin: boolean;
    onShowToast: (msg: string, type: 'success' | 'error' | 'info') => void;
    onBack: () => void;
    userProgress: UserProgress | null;
    onProgressUpdate: (updated: UserProgress) => void;
    initialBook?: string;
    initialChapter?: number;
}

const removeAccents = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const getBookVariations = (b: BibleBook) => {
    const vars = new Set<string>();
    
    const addVar = (v: string) => {
        vars.add(v);
        vars.add(removeAccents(v));
    };

    addVar(b.name);
    addVar(b.abbrev);
    
    if (b.name === "Salmos") {
        addVar("Salmo");
    }
    
    // Handle numbered books like "1 Samuel" or "1sm"
    const match = b.name.match(/^(\d)\s+(.*)/);
    if (match) {
        const num = match[1];
        const name = match[2];
        const roman = num === '1' ? 'I' : num === '2' ? 'II' : 'III';
        
        addVar(`${num}${name}`);
        addVar(`${num} ${name}`);
        addVar(`${roman} ${name}`);
        addVar(`${roman}${name}`);
        
        // Abbreviations with numbers
        const abbrevName = b.abbrev.replace(/^\d/, '');
        addVar(`${num} ${abbrevName}`);
        addVar(`${num}${abbrevName}`);
        addVar(`${roman} ${abbrevName}`);
        addVar(`${roman}${abbrevName}`);
    }
    return Array.from(vars);
};

const bookNamesPattern = BIBLE_BOOKS.flatMap(getBookVariations)
    .sort((a, b) => b.length - a.length) // Sort by length descending to match longest first
    .map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

const bibleRegex = new RegExp(`(^|[\\s\\(\\["',;]+)(${bookNamesPattern}\\.?)\\s+(\\d+):(\\d+(?:-\\d+)?(?:,\\s*(?!(?:${bookNamesPattern})\\b)(?:\\d+:)?\\d+(?:-\\d+)?)*)`, 'gi');

const loadingStatusMessages = [
    "Iniciando Protocolo Magnum Opus One-Shot v116.0...",
    "Conectando ao Motor Central de Teologia (Backend)...",
    "Analizando contexto exegético do capítulo bíblico...",
    "Consultando manuscritos e linguagens originais...",
    "Fracionando exegese in porções microscópicas...",
    "Redigindo apostila exaustiva (Meta: Alta Densidade)...",
    "Injetando Pérolas de Ouro via API v116...",
    "Integrando Contexto Judaico, Talmud e Midrash...",
    "Analisando documentos históricos contemporâneos...",
    "Sistematizando moedas, pesos e medidas da época...",
    "Integrando Expansão Contextual junto aos versículos...",
    "Garantindo que Tipologia seja a selagem final...",
    "Sistematizando evidências arqueológicas contemporâneas...",
    "Validando Ortodoxia com Identidade Implícita...",
    "Formatando layout para leitura fluida e premium...",
    "Processando densidade teológica final...",
    "Iniciando Protocolo de Retenção (Geração One-Shot)...",
    "Quase lá! Realizando revisão acadêmica final...",
    "A IA está verificando a integridade das Pérolas...",
    "Exegese magistral em andamento. Não interrompa...",
    "Verificando obediência total ao prompt Michel Felix...",
    "Cruzando referências em Reis, Crônicas e Profetas...",
    "Consolidando as Pérolas de Ouro por versículos...",
    "Finalizando a seção de Arqueologia e Tipologia...",
    "Sincronizando com a base de dados suprema ADMA...",
    "Acelerando commit final de retenção acadêmica...",
    "Verificando integridade de todos os versículos...",
    "Garantindo que nenhum fragmento foi omitido...",
    "A IA está refinando a linguagem magistral...",
    "Preparando a aula completa para o Aluno ADMA...",
    "ATUALIZAÇÃO v116.0: Injetando rigor documental pericial...",
    "ATUALIZAÇÃO v116.0: Sincronizando fontes (Josefo/Talmud)...",
    "ATUALIZAÇÃO v116.0: Aplicando Design Imperial Gold..."
];

export default function PanoramaView({ isAdmin, onShowToast, onBack, userProgress, onProgressUpdate, initialBook, initialChapter }: PanoramaProps) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [scrolled, setScrolled] = React.useState(false);
    const [isMobile, setIsMobile] = React.useState(false);
    const [showSettings, setShowSettings] = React.useState(false);

    const {
        book, setBook,
        chapter, setChapter,
        activeTab, setActiveTab,
        currentPage, setCurrentPage,
        pages, setPages,
        fontSize, setFontSize,
        isEditing, setIsEditing,
        editValue, setEditValue,
        isSaving, setIsSaving,
        adminPanelExpanded, setAdminPanelExpanded,
        showInstructions, setShowInstructions,
        customInstructions, setCustomInstructions,
        depthLevel, setDepthLevel,
        targetPages, setTargetPages,
        generationTime, setGenerationTime,
        currentStatusIndex, setCurrentStatusIndex,
        stats,
        content, setContent,
        isGenerating, setIsGenerating,
        theologicalDensity, setTheologicalDensity,
        validationPhase, setValidationPhase,
        validationLog, setValidationLog,
        thematicThemes, themeFolders, themeLessons,
        loadThemes, loadLessonsAndFolders, toggleStar,
        isPlaying, voices, selectedVoice, setSelectedVoice, playbackRate, setPlaybackRate,
        currentGlobalIndex, globalSentences, togglePlay, stopAudio, seekAudio,
        activeQuiz, quizLoading,
        activeTheme, setActiveTheme,
        activeLesson, setActiveLesson,
        activeFolder, setActiveFolder,
        thematicViewMode, setThematicViewMode,
        newThemeTitle, setNewThemeTitle,
        newFolderTitle, setNewFolderTitle,
        newLessonTitle, setNewLessonTitle,
        handleSaveEdit, handleDelete, handleGenerateThematic,
        loadQuiz,
        generateEbd, finalizeGeneration,
        addTheme, deleteTheme, addFolder, deleteFolder, addLesson, deleteLesson, renameLesson, moveLesson
    } = usePanoramaView({ 
        initialBook: initialBook || 'Gênesis', 
        initialChapter: initialChapter || 1, 
        userProgress, 
        onProgressUpdate, 
        onShowToast, 
        isAdmin 
    });

    const { 
        markEbdAsRead, 
        markThematicAsRead, 
        unlockTheme 
    } = useUserProgress({ userProgress, onProgressUpdate, onShowToast });

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 35);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        let interval: any;
        if (isGenerating) {
            interval = setInterval(() => {
                setGenerationTime(prev => prev + 1);
                setTheologicalDensity(prev => {
                    if (prev >= 99) return prev;
                    return prev + 0.5; 
                });
                if (generationTime % 6 === 0 && generationTime > 0) {
                    setCurrentStatusIndex(prev => (prev + 1) % loadingStatusMessages.length);
                }
            }, 1000);
        } else {
            setGenerationTime(0);
            setCurrentStatusIndex(0);
            setTheologicalDensity(0);
            setValidationPhase('none');
            setValidationLog([]);
        }
        return () => clearInterval(interval);
    }, [isGenerating, generationTime, setGenerationTime, setCurrentStatusIndex, setTheologicalDensity, setValidationPhase, setValidationLog]);

    useEffect(() => {
        if (theologicalDensity >= 100 && isGenerating && activeTab !== 'thematic') {
            finalizeGeneration(book, chapter);
        }
    }, [theologicalDensity, isGenerating, activeTab, book, chapter, finalizeGeneration]);

    useEffect(() => {
        stopAudio();
    }, [activeTab, stopAudio]);

    const studyKey = generateChapterKey(book, chapter);
    const isRead = activeTab === 'thematic' 
        ? (activeLesson ? userProgress?.thematic_read?.includes(activeLesson.id!) : false)
        : userProgress?.ebd_read?.includes(studyKey);
    const hasAccess = activeTab === 'student' || activeTab === 'thematic' || isAdmin;

    const parseBibleReferences = (text: string, keyPrefix: string) => {
        const parts = text.split(bibleRegex);
        if (parts.length === 1) return text;

        const result = [];
        for (let i = 0; i < parts.length; i += 5) {
            if (parts[i]) result.push(parts[i]);
            if (i + 4 < parts.length) {
                const prefix = parts[i + 1];
                const bookRaw = parts[i + 2];
                const chapter = parseInt(parts[i + 3]);
                const verses = parts[i + 4];
                
                // Resolve book name
                const cleanRaw = bookRaw.toLowerCase().replace(/[\s\.]/g, "");
                const normalizedRaw = cleanRaw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                
                let bookData = BIBLE_BOOKS.find(b => {
                    const variations = getBookVariations(b);
                    return variations.some(v => {
                        const cleanV = v.toLowerCase().replace(/[\s\.]/g, "");
                        const normV = cleanV.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                        return cleanV === cleanRaw || normV === normalizedRaw;
                    });
                });
                
                const resolvedBook = bookData ? bookData.name : bookRaw.replace(/\.$/, '');

                result.push(prefix);
                const verseParts = verses.split(',').map(v => v.trim());
                verseParts.forEach((v, idx) => {
                    let currentChapter = chapter;
                    let currentVerses = v;
                    if (v.includes(':')) {
                        const [c, ve] = v.split(':');
                        currentChapter = parseInt(c);
                        currentVerses = ve;
                    }
                    
                    result.push(
                        <BibleReference key={`${keyPrefix}-${i}-${idx}`} book={resolvedBook} chapter={currentChapter} verses={currentVerses}>
                            {idx === 0 ? `${bookRaw} ${chapter}:${verses}` : v}
                        </BibleReference>
                    );
                    if (idx < verseParts.length - 1) result.push(', ');
                });
            }
        }
        return result;
    };

    const parseHistoricalSources = (text: string, keyPrefix: string): React.ReactNode[] => {
        // Regex para detectar fontes históricas comuns e suas referências
        // Ex: Midrash Rabbah (Gênesis Rabbah 1:1), Flávio Josefo, Antiguidades..., Talmud (Tratado...)
        const sourceRegex = /(Talmud|Mishn[áa]|Midrash(?:\s+[A-Z][a-z]+)?|Guemer[áa]|Gemara|Fl[áa]vio\s+Josefo|Josefo|Philo\s+de\s+Alexandria|Philo|Fil[oó]n\s+de\s+Alexandria|Eus[eé]bio\s+de\s+Cesareia|Eusebio|Pais\s+da\s+Igreja|Manuscritos\s+do\s+Mar\s+Morto)(?:\s*([\(\[][^\]\)]+[\)\]]|,\s*[^,.\n]+(?:,\s*[^,.\n]+)*))?/gi;
        
        const parts: React.ReactNode[] = [];
        let lastIndex = 0;
        let match;

        while ((match = sourceRegex.exec(text)) !== null) {
            // Adiciona o texto antes do match (processando referências bíblicas nele)
            if (match.index > lastIndex) {
                parts.push(...parseBibleReferences(text.substring(lastIndex, match.index), `${keyPrefix}-pre-${match.index}`));
            }

            const fullMatch = match[0];
            const sourceName = match[1];
            const reference = match[2] ? match[2].trim() : '';

            // Cria o componente interativo para a fonte histórica
            parts.push(
                <PrimarySource key={`${keyPrefix}-ps-${match.index}`} source={sourceName} reference={reference}>
                    {fullMatch}
                </PrimarySource>
            );

            lastIndex = match.index + fullMatch.length;
        }

        // Adiciona o restante do texto
        if (lastIndex < text.length) {
            parts.push(...parseBibleReferences(text.substring(lastIndex), `${keyPrefix}-post`));
        }

        return parts;
    };

    const parseInline = (t: string): React.ReactNode => {
        const parts = t.split(/(\{\{.*?\|.*?\}\}|\[\[.*?\|.*?\]\]|\*\*.*?\*\*|\*.*?\*)/g);
        return parts.map((part, i) => {
            if (!part) return null;
            
            if (part.startsWith('{{') && part.endsWith('}}') && part.includes('|')) {
                const inner = part.slice(2, -2);
                const refParts = inner.split('|');
                const source = refParts[0]?.trim() || '';
                const reference = refParts[1]?.trim() || '';
                const hiddenCommand = refParts.slice(2).join('|').trim() || '';
                
                return (
                    <PrimarySource key={`ps-${i}`} source={source} reference={reference} hiddenCommand={hiddenCommand}>
                        {source}, {reference}
                    </PrimarySource>
                );
            }
            if (part.startsWith('[[') && part.endsWith(']]') && part.includes('|')) {
                const inner = part.slice(2, -2);
                const [term, ...explanationParts] = inner.split('|');
                const explanation = explanationParts.join('|');
                return (
                    <GlossaryTerm key={`glossary-${i}`} term={term.trim()} explanation={explanation.trim()}>
                        {term.trim()}
                    </GlossaryTerm>
                );
            }
            if (part.startsWith('**') && part.endsWith('**')) {
                const inner = part.slice(2, -2);
                return <strong key={i} className="text-[#8B0000] dark:text-[#ff6b6b] font-extrabold">{parseInline(inner)}</strong>;
            }
            if (part.startsWith('*') && part.endsWith('*')) {
                return <em key={i} className="text-[#C5A059] italic font-semibold">{parseInline(part.slice(1, -1))}</em>;
            }
            return parseHistoricalSources(part, `text-${i}`);
        });
    };

    const handleThematicNavigate = async (mode: 'themes_list' | 'lessons_list' | 'lesson_content', theme?: ThematicTheme, lesson?: ThematicLesson) => {
        if (mode === 'lessons_list' && theme?.access_password && !isAdmin) {
            const savedPass = userProgress?.unlocked_themes?.[theme.id!];
            if (savedPass !== theme.access_password) {
                const inputPass = window.prompt("Esta série é protegida. Digite a senha de acesso:");
                if (inputPass !== theme.access_password) {
                    onShowToast("Senha incorreta. Acesso negado.", "error");
                    return;
                }
                unlockTheme(theme.id!, inputPass);
            }
        }

        setThematicViewMode(mode);
        if (theme) { 
            setActiveTheme(theme); 
            loadLessonsAndFolders(theme.id!); 
            setActiveFolder(null);
        } else if (mode === 'themes_list') {
            setActiveTheme(null);
        }
        if (lesson) setActiveLesson(lesson);
        if (mode !== 'lesson_content') {
            setActiveLesson(null);
            setIsEditing(false); 
            setPages([]); 
            setCurrentPage(0);
            window.scrollTo(0,0);
        }
    };

    const handleHeaderBack = () => {
        if (activeTab === 'thematic') {
            if (thematicViewMode === 'lesson_content') {
                handleThematicNavigate('lessons_list');
            } else if (thematicViewMode === 'lessons_list') {
                handleThematicNavigate('themes_list');
            } else {
                onBack();
            }
        } else {
            onBack();
        }
    };

    const currentBookData = BIBLE_BOOKS.find(b => 
        b.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 
        book.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    );
    const totalChapters = currentBookData?.chapters || 150;
    const chaptersList = Array.from({ length: totalChapters }, (_, i) => i + 1);

    return (
        <div className="min-h-screen bg-[#FDFBF7] dark:bg-dark-bg transition-colors duration-500 pb-32">
            {/* Header Fixo */}
            <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 pt-[calc(env(safe-area-inset-top)+1rem)] ${scrolled ? 'bg-white/90 dark:bg-dark-bg/90 backdrop-blur-xl shadow-2xl pb-3' : 'bg-transparent pb-6'}`}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 flex justify-between items-center">
                    <button onClick={handleHeaderBack} className="group flex items-center gap-3 px-5 py-3 bg-white dark:bg-dark-card rounded-2xl shadow-lg hover:shadow-xl transition-all active:scale-95 border border-gray-100 dark:border-gray-800">
                        <ChevronLeft className="w-5 h-5 text-[#8B0000] group-hover:-translate-x-1 transition-transform" />
                        <span className="font-cinzel font-black text-[10px] uppercase tracking-widest text-gray-600 dark:text-gray-300 hidden sm:inline">Voltar</span>
                    </button>

                    <div className="flex flex-col items-center">
                        <h1 className="font-cinzel font-black text-xl md:text-3xl text-[#8B0000] dark:text-[#ff6b6b] tracking-[0.2em] uppercase drop-shadow-sm">Panorama</h1>
                        <div className="h-1 w-12 bg-[#C5A059] rounded-full mt-1"></div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button onClick={() => setShowSettings(!showSettings)} className="p-3 bg-white dark:bg-dark-card rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 text-gray-500 hover:text-[#8B0000] transition-all">
                            <Settings className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </header>

            {/* Configurações Flutuantes */}
            <AnimatePresence>
                {showSettings && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed bottom-32 right-6 z-50 w-80 bg-white dark:bg-dark-card rounded-[2.5rem] shadow-2xl border-4 border-[#C5A059]/30 p-8">
                        <div className="flex justify-between items-center mb-8">
                            <h3 className="font-cinzel font-black text-[#8B0000] uppercase tracking-widest text-sm">Configurações</h3>
                            <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-black/20 rounded-full"><X className="w-4 h-4" /></button>
                        </div>
                        
                        <div className="space-y-8">
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-4">Tamanho da Fonte</label>
                                <div className="flex items-center gap-4">
                                    <button onClick={() => setFontSize(Math.max(14, fontSize - 2))} className="w-10 h-10 bg-gray-100 dark:bg-black/20 rounded-xl flex items-center justify-center font-bold">-</button>
                                    <span className="flex-1 text-center font-black text-xl">{fontSize}px</span>
                                    <button onClick={() => setFontSize(Math.min(40, fontSize + 2))} className="w-10 h-10 bg-gray-100 dark:bg-black/20 rounded-xl flex items-center justify-center font-bold">+</button>
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-4">Voz do Narrador</label>
                                <select value={selectedVoice} onChange={(e) => setSelectedVoice(e.target.value)} className="w-full bg-gray-50 dark:bg-black/20 border-2 border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 text-sm outline-none">
                                    {voices.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-4">Velocidade</label>
                                <div className="flex gap-2">
                                    {[0.8, 1, 1.2, 1.5].map(rate => (
                                        <button key={rate} onClick={() => setPlaybackRate(rate)} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${playbackRate === rate ? 'bg-[#8B0000] text-white' : 'bg-gray-100 dark:bg-black/20 text-gray-500'}`}>{rate}x</button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <main className="max-w-7xl mx-auto px-3 sm:px-6 pt-32">
                {/* Seletor de Livro e Capítulo (Apenas se não for Temático) */}
                {activeTab !== 'thematic' && (
                    <div className="mb-12 flex flex-col md:flex-row gap-6">
                        <div className="flex-1 bg-white dark:bg-dark-card rounded-[2rem] p-4 shadow-xl border border-gray-100 dark:border-gray-800 flex items-center gap-4">
                            <div className="w-12 h-12 bg-[#8B0000]/10 rounded-2xl flex items-center justify-center">
                                <Book className="w-6 h-6 text-[#8B0000]" />
                            </div>
                            <select value={book} onChange={(e) => setBook(e.target.value)} className="flex-1 bg-white dark:bg-dark-card font-cinzel font-black text-lg md:text-xl text-gray-800 dark:text-white outline-none cursor-pointer">
                                {BIBLE_BOOKS.map(b => <option key={b.name} value={b.name} className="bg-white dark:bg-dark-card text-gray-800 dark:text-white">{b.name}</option>)}
                            </select>
                        </div>

                        <div className="flex-1 bg-white dark:bg-dark-card rounded-[2rem] p-4 shadow-xl border border-gray-100 dark:border-gray-800 flex items-center gap-4">
                            <div className="w-12 h-12 bg-[#C5A059]/10 rounded-2xl flex items-center justify-center">
                                <ListIcon className="w-6 h-6 text-[#C5A059]" />
                            </div>
                            <select value={chapter} onChange={(e) => setChapter(Number(e.target.value))} className="flex-1 bg-white dark:bg-dark-card font-cinzel font-black text-lg md:text-xl text-gray-800 dark:text-white outline-none cursor-pointer">
                                {chaptersList.map(c => <option key={c} value={c} className="bg-white dark:bg-dark-card text-gray-800 dark:text-white">Capítulo {c}</option>)}
                            </select>
                        </div>
                    </div>
                )}

                {/* Tabs de Navegação */}
                <div className="mb-12 flex bg-white dark:bg-dark-card p-2 rounded-[2.5rem] shadow-xl border border-gray-100 dark:border-gray-800 overflow-x-auto no-scrollbar">
                    {[
                        { id: 'student', label: 'EBD PANORAMA', icon: GraduationCap },
                        ...(isAdmin ? [{ id: 'teacher', label: 'Guia do Mestre', icon: ShieldCheck }] : []),
                        { id: 'quiz', label: 'QUIZ', icon: ClipboardCheck },
                        { id: 'thematic', label: 'ESTUDOS TEMÁTICOS', icon: Stars }
                    ].map(tab => (
                        <button 
                            key={tab.id} 
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-3 px-8 py-4 rounded-[2rem] font-cinzel font-black text-[10px] md:text-xs uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-[#8B0000] text-white shadow-lg scale-105' : 'text-gray-400 hover:text-[#8B0000]'}`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Painel Admin */}
                {(activeTab !== 'thematic' && activeTab !== 'quiz' || (activeTab === 'thematic' && thematicViewMode === 'lesson_content')) && (
                    <PanoramaAdminPanel 
                        isAdmin={isAdmin}
                        isGenerating={isGenerating}
                        theologicalDensity={theologicalDensity}
                        validationPhase={validationPhase}
                        validationLog={validationLog}
                        customInstructions={customInstructions}
                        setCustomInstructions={setCustomInstructions}
                        depthLevel={depthLevel}
                        setDepthLevel={setDepthLevel}
                        targetPages={targetPages}
                        setTargetPages={setTargetPages}
                        showInstructions={showInstructions}
                        setShowInstructions={setShowInstructions}
                        handleGenerate={activeTab === 'thematic' ? handleGenerateThematic : () => generateEbd(book, chapter, customInstructions, theologicalDensity, activeTab as 'student' | 'teacher', depthLevel, targetPages)}
                        adminPanelExpanded={adminPanelExpanded}
                        setAdminPanelExpanded={setAdminPanelExpanded}
                        isEditing={isEditing}
                        setIsEditing={setIsEditing}
                        editValue={editValue}
                        setEditValue={setEditValue}
                        handleSaveEdit={handleSaveEdit}
                        handleDelete={handleDelete}
                        generationTime={generationTime}
                        currentStatusIndex={currentStatusIndex}
                        loadingStatusMessages={loadingStatusMessages}
                    />
                )}

                {/* Conteúdo Principal */}
                <div className="relative">
                    {activeTab === 'thematic' && thematicViewMode !== 'lesson_content' ? (
                        <ThematicManager 
                            isAdmin={isAdmin}
                            themes={thematicThemes}
                            activeTheme={activeTheme}
                            folders={themeFolders}
                            lessons={themeLessons}
                            onNavigate={handleThematicNavigate}
                            onToggleStar={toggleStar}
                            onDeleteTheme={deleteTheme}
                            onDeleteFolder={(id) => deleteFolder(activeTheme!.id!, id)}
                            onDeleteLesson={(id) => deleteLesson(activeTheme!.id!, id)}
                            onRenameLesson={(lesson) => renameLesson(activeTheme!.id!, lesson)}
                            onMoveLesson={(lesson, dir) => moveLesson(activeTheme!.id!, lesson, dir)}
                            onAddTheme={() => addTheme(newThemeTitle)}
                            onAddFolder={() => addFolder(activeTheme!.id!, newFolderTitle)}
                            onAddLesson={(fid) => addLesson(activeTheme!.id!, newLessonTitle, fid)}
                            newThemeTitle={newThemeTitle}
                            setNewThemeTitle={setNewThemeTitle}
                            newFolderTitle={newFolderTitle}
                            setNewFolderTitle={setNewFolderTitle}
                            newLessonTitle={newLessonTitle}
                            setNewLessonTitle={setNewLessonTitle}
                            userProgress={userProgress}
                        />
                    ) : activeTab === 'quiz' ? (
                        <div className="bg-white dark:bg-dark-card rounded-3xl md:rounded-[3rem] p-4 sm:p-8 md:p-16 shadow-2xl border border-gray-100 dark:border-gray-800 min-h-[400px]">
                            {quizLoading ? (
                                <div className="flex flex-col items-center justify-center h-64">
                                    <Loader2 className="w-12 h-12 text-[#C5A059] animate-spin mb-4" />
                                    <p className="font-cinzel font-black text-gray-400 uppercase tracking-widest">Carregando Quiz...</p>
                                </div>
                            ) : activeQuiz ? (
                                <>
                                    {isAdmin && !activeQuiz.released_at && (
                                        <button 
                                            onClick={async () => {
                                                try {
                                                    await db.entities.Quizzes.update(activeQuiz.id!, { 
                                                        released_at: new Date().toISOString(),
                                                        is_visible: true 
                                                    });
                                                    onShowToast("Quiz liberado com sucesso!", "success");
                                                    // Refresh quiz
                                                    await loadQuiz(book, chapter);
                                                } catch (e) {
                                                    console.error("Erro ao liberar quiz:", e);
                                                    onShowToast("Erro ao liberar quiz.", "error");
                                                }
                                            }}
                                            className="mb-6 w-full py-4 bg-green-600 text-white font-bold rounded-2xl flex items-center justify-center gap-2 hover:bg-green-700 transition-all"
                                        >
                                            <Unlock className="w-5 h-5" /> LIBERAR QUIZ PARA ALUNOS
                                        </button>
                                    )}
                                    <QuizRunner 
                                        quiz={activeQuiz} 
                                        onShowToast={onShowToast}
                                        userProgress={userProgress}
                                        onProgressUpdate={onProgressUpdate}
                                    />
                                </>
                            ) : (
                                <div className="text-center py-20">
                                    <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto mb-6 opacity-20" />
                                    <h3 className="font-cinzel font-black text-2xl text-gray-400 uppercase tracking-widest">Nenhum Quiz Disponível</h3>
                                    <p className="text-sm text-gray-500 mt-4">O professor ainda não liberou o quiz para este capítulo.</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="bg-white dark:bg-dark-card rounded-3xl md:rounded-[3rem] p-4 sm:p-8 md:p-16 shadow-2xl border border-gray-100 dark:border-gray-800 min-h-[600px] relative">
                            {!hasAccess ? (
                                <div className="flex flex-col items-center justify-center h-full text-center py-32">
                                    <Lock className="w-24 h-24 text-[#8B0000] mb-8 opacity-20" />
                                    <h2 className="font-cinzel font-black text-3xl text-[#8B0000] uppercase tracking-widest mb-4">Acesso Restrito</h2>
                                    <p className="max-w-md text-gray-500 font-medium leading-relaxed">Este conteúdo é exclusivo para alunos matriculados ou administradores do sistema ADMA.</p>
                                </div>
                            ) : (
                                <>
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                                        <div className="flex items-center gap-2">
                                            {activeTab === 'teacher' && (
                                                <div className="bg-[#8B0000]/10 border border-[#8B0000]/20 px-4 py-2 rounded-xl flex items-center gap-2">
                                                    <ShieldCheck className="w-4 h-4 text-[#8B0000]" />
                                                    <span className="font-cinzel font-black text-[10px] text-[#8B0000] uppercase tracking-widest">Guia do Mestre</span>
                                                </div>
                                            )}
                                            {activeTab === 'student' && (
                                                <div className="bg-[#C5A059]/10 border border-[#C5A059]/20 px-4 py-2 rounded-xl flex items-center gap-2">
                                                    <GraduationCap className="w-4 h-4 text-[#C5A059]" />
                                                    <span className="font-cinzel font-black text-[10px] text-[#C5A059] uppercase tracking-widest">EBD Panorama</span>
                                                </div>
                                            )}
                                            {activeTab === 'thematic' && thematicViewMode === 'lesson_content' && (
                                                <div className="bg-amber-100 border border-amber-200 px-4 py-2 rounded-xl flex items-center gap-2">
                                                    <Stars className="w-4 h-4 text-amber-600" />
                                                    <span className="font-cinzel font-black text-[10px] text-amber-600 uppercase tracking-widest">Estudos Temáticos</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex flex-col items-end gap-3">
                                            <div className="flex gap-3">
                                                <button onClick={togglePlay} className="w-12 h-12 bg-[#8B0000] text-white rounded-2xl flex items-center justify-center shadow-lg hover:scale-110 transition-all relative overflow-hidden">
                                                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                                                    {isPlaying && globalSentences.length > 0 && (
                                                        <div 
                                                            className="absolute bottom-0 left-0 h-1 bg-white/40 transition-all duration-300" 
                                                            style={{ width: `${(currentGlobalIndex / globalSentences.length) * 100}%` }}
                                                        />
                                                    )}
                                                </button>
                                                {activeTab === 'thematic' && (
                                                    <button onClick={() => handleThematicNavigate('lessons_list')} className="px-4 h-12 bg-gray-100 dark:bg-black/20 rounded-2xl flex items-center gap-2 hover:bg-gray-200 transition-all">
                                                        <ArrowLeft className="w-5 h-5" />
                                                        <span className="font-cinzel font-black text-[10px] uppercase tracking-widest text-gray-600">Voltar</span>
                                                    </button>
                                                )}
                                            </div>
                                            {isPlaying && globalSentences.length > 0 && (
                                                <div className="bg-white/90 dark:bg-dark-card/90 backdrop-blur-sm px-3 py-2 rounded-lg border border-gray-100 dark:border-gray-800 shadow-sm">
                                                    <div 
                                                        className="w-32 h-2 bg-gray-200 dark:bg-black/40 rounded-full overflow-hidden cursor-pointer relative"
                                                        onClick={(e) => {
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            const x = e.clientX - rect.left;
                                                            seekAudio(x / rect.width);
                                                        }}
                                                    >
                                                        <div 
                                                            className="h-full bg-[#8B0000] transition-all duration-300 pointer-events-none"
                                                            style={{ width: `${(currentGlobalIndex / globalSentences.length) * 100}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                            {isEditing ? (
                                <textarea
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    className="w-full h-[600px] p-8 bg-gray-50 dark:bg-dark-bg rounded-3xl border-2 border-[#8B0000]/20 focus:border-[#8B0000] outline-none font-mono text-lg leading-relaxed resize-none"
                                    placeholder="Cole ou edite o manuscrito aqui..."
                                />
                            ) : pages.length > 0 ? (
                                <EbdContentRenderer 
                                    pages={pages}
                                    currentPage={currentPage}
                                    fontSize={fontSize}
                                    isPlaying={isPlaying}
                                    currentGlobalIndex={currentGlobalIndex}
                                    globalSentences={globalSentences}
                                    parseInline={parseInline}
                                    isAdmin={isAdmin}
                                    studyKey={studyKey}
                                />
                            ) : (
                                <div className="text-center py-40">
                                    <BookMarked className="w-24 h-24 text-gray-200 mx-auto mb-8" />
                                    <h3 className="font-cinzel font-black text-2xl text-gray-300 uppercase tracking-widest">Manuscrito Não Encontrado</h3>
                                    {isAdmin && <p className="text-xs text-[#8B0000] mt-4 font-bold uppercase tracking-widest">Admin: Use o Painel Magnum Opus acima para gerar.</p>}
                                </div>
                            )}

                            {currentPage === pages.length - 1 && pages.length > 0 && (
                                <div className="mt-24 text-center">
                                    <button 
                                        onClick={() => activeTab === 'thematic' ? (activeLesson && markThematicAsRead(activeLesson.id!, isRead)) : markEbdAsRead(studyKey, isRead)}
                                        disabled={isRead}
                                        className={`px-12 py-6 rounded-full font-cinzel font-black text-lg shadow-2xl transition-all ${isRead ? 'bg-green-600 text-white' : 'bg-[#8B0000] text-white hover:scale-105'}`}
                                    >
                                        {isRead ? 'AULA CONCLUÍDA' : 'CONCLUIR E PONTUAR'}
                                    </button>
                                </div>
                            )}
                            </>
                            )}
                        </div>
                    )}
                </div>

                {/* Paginação */}
                {pages.length > 1 && (activeTab === 'student' || activeTab === 'teacher' || (activeTab === 'thematic' && thematicViewMode === 'lesson_content')) && (
                    <div className="mt-12 flex justify-center items-center gap-8">
                        <button 
                            onClick={() => {
                                setCurrentPage(Math.max(0, currentPage - 1));
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            disabled={currentPage === 0}
                            className="w-14 h-14 bg-white dark:bg-dark-card rounded-2xl shadow-lg flex items-center justify-center disabled:opacity-20 transition-all active:scale-90 border border-gray-100 dark:border-gray-800"
                        >
                            <ChevronLeft className="w-6 h-6 text-[#8B0000]" />
                        </button>
                        <div className="flex flex-col items-center">
                            <span className="font-cinzel font-black text-2xl text-[#C5A059] tracking-widest">{currentPage + 1}</span>
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Página de {pages.length}</span>
                        </div>
                        <button 
                            onClick={() => {
                                setCurrentPage(Math.min(pages.length - 1, currentPage + 1));
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            disabled={currentPage === pages.length - 1}
                            className="w-14 h-14 bg-white dark:bg-dark-card rounded-2xl shadow-lg flex items-center justify-center disabled:opacity-20 transition-all active:scale-90 border border-gray-100 dark:border-gray-800"
                        >
                            <ChevronRight className="w-6 h-6 text-[#8B0000]" />
                        </button>
                    </div>
                )}
            </main>

            {/* Footer de Status */}
            {pages.length > 0 && (
                <footer className="fixed bottom-0 left-0 right-0 z-40 bg-white/80 dark:bg-dark-bg/80 backdrop-blur-md border-t border-gray-100 dark:border-gray-800 py-4 px-8">
                    <div className="max-w-7xl mx-auto flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-gray-400">
                        <div className="flex items-center gap-6">
                            <span className="flex items-center gap-2"><Clock className="w-3 h-3" /> {stats.wordCount} Palavras</span>
                            <span className="flex items-center gap-2"><FileText className="w-3 h-3" /> {stats.estimatedPages} Páginas Est.</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${isRead ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                            {activeTab === 'thematic' ? 'Aula Concluída' : 'Capítulo Concluído'}
                        </div>
                    </div>
                </footer>
            )}

            {/* Modal de Configurações (Overlay) */}
            {showSettings && <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" onClick={() => setShowSettings(false)}></div>}
        </div>
    );
}
