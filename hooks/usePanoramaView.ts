import { useState, useEffect, useCallback, useMemo } from 'react';
import { BIBLE_BOOKS, generateChapterKey } from '../constants';
import { useEbdData } from './useEbdData';
import { useThematicData } from './useThematicData';
import { usePanoramaAudio } from './usePanoramaAudio';
import { EBDContent, Quiz, ThematicTheme, ThematicLesson, ThematicFolder, UserProgress } from '../types';
import { db } from '../services/database';
import { generateContent } from '../services/geminiService';

interface UsePanoramaViewProps {
    initialBook: string;
    initialChapter: number;
    userProgress: UserProgress | null;
    onProgressUpdate: (updated: UserProgress) => void;
    onShowToast: (msg: string, type: 'success' | 'error' | 'info') => void;
    isAdmin: boolean;
}

export function usePanoramaView({ initialBook, initialChapter, userProgress, onProgressUpdate, onShowToast, isAdmin }: UsePanoramaViewProps) {
    const [book, setBook] = useState(initialBook || 'Gênesis');
    const [chapter, setChapter] = useState(initialChapter || 1);
    const [activeTab, setActiveTab] = useState<'student' | 'teacher' | 'quiz' | 'thematic'>('student');
    const [currentPage, setCurrentPage] = useState(0);
    const [pages, setPages] = useState<string[]>([]);
    const [fontSize, setFontSize] = useState(22);
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [adminPanelExpanded, setAdminPanelExpanded] = useState(false);
    const [showInstructions, setShowInstructions] = useState(false);
    const [customInstructions, setCustomInstructions] = useState('');
    const [generationTime, setGenerationTime] = useState(0);
    const [currentStatusIndex, setCurrentStatusIndex] = useState(0);
    const [stats, setStats] = useState({ wordCount: 0, charCount: 0, estimatedPages: 0 });

    const { 
        content, 
        setContent,
        isGenerating, 
        setIsGenerating,
        theologicalDensity, 
        setTheologicalDensity,
        validationPhase, 
        setValidationPhase,
        validationLog, 
        setValidationLog,
        loadContent, 
        handleGenerate: generateEbd,
        finalizeGeneration 
    } = useEbdData(onShowToast);

    const {
        thematicThemes,
        themeFolders,
        themeLessons,
        loadThemes,
        loadLessonsAndFolders,
        toggleStar,
        addTheme,
        deleteTheme,
        addFolder,
        deleteFolder,
        addLesson,
        deleteLesson,
        renameLesson,
        moveLesson,
        setThemeLessons,
        setThemeFolders
    } = useThematicData(onShowToast);

    const {
        isPlaying,
        voices,
        selectedVoice,
        setSelectedVoice,
        playbackRate,
        setPlaybackRate,
        currentGlobalIndex,
        globalSentences,
        togglePlay,
        stop: stopAudio,
        seekAudio
    } = usePanoramaAudio(pages, currentPage, setCurrentPage);

    const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
    const [quizLoading, setQuizLoading] = useState(false);
    const [activeTheme, setActiveTheme] = useState<ThematicTheme | null>(null);
    const [activeLesson, setActiveLesson] = useState<ThematicLesson | null>(null);
    const [activeFolder, setActiveFolder] = useState<ThematicFolder | null>(null);
    const [thematicViewMode, setThematicViewMode] = useState<'themes_list' | 'lessons_list' | 'lesson_content'>('themes_list');

    const [newThemeTitle, setNewThemeTitle] = useState('');
    const [newFolderTitle, setNewFolderTitle] = useState('');
    const [newLessonTitle, setNewLessonTitle] = useState('');

    const loadQuiz = useCallback(async (book: string, chapter: number) => {
        setQuizLoading(true);
        const key = generateChapterKey(book, chapter);
        try {
            const quizzes = await db.entities.Quizzes.filter({ chapter_key: key, type: 'class' });
            if (quizzes.length > 0) {
                const quiz = quizzes[0];
                if (quiz.is_visible || quiz.released_at || isAdmin) setActiveQuiz(quiz);
                else setActiveQuiz(null);
            } else {
                setActiveQuiz(null);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setQuizLoading(false);
        }
    }, [isAdmin]);

    useEffect(() => {
        const canonicalBook = BIBLE_BOOKS.find(b => 
            b.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 
            book.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        );
        if (canonicalBook && canonicalBook.name !== book) {
            setBook(canonicalBook.name);
            return;
        }
        loadContent(book, chapter);
        loadQuiz(book, chapter);
    }, [book, chapter, loadContent, loadQuiz]);

    useEffect(() => {
        if (activeTab === 'thematic') loadThemes();
    }, [activeTab, loadThemes]);

    const calculateStats = useCallback((text: string) => {
        if (!text) return;
        const cleanText = text.replace(/<[^>]*>/g, '').replace(/__CONTINUATION_MARKER__/g, '');
        const words = cleanText.trim().split(/\s+/).length;
        const estPages = Math.ceil(words / 600); 
        setStats({ wordCount: words, charCount: cleanText.length, estimatedPages: estPages });
    }, []);

    const processAndPaginate = useCallback((html: string) => {
        if (!html || html === 'undefined') { setPages([]); return; }
        const unifiedText = html.replace(/<hr[^>]*>|__CONTINUATION_MARKER__/gi, '\n\n');
        const blocks = unifiedText.split(/\n\s*\n/).filter(b => b.trim().length > 0);
        const finalPages: string[] = [];
        let currentBuffer: string[] = [];
        let currentWordCount = 0;
        const TARGET_WORDS_PER_PAGE = 600;

        const isHeading = (text: string) => {
            const tr = text.trim();
            if (tr.startsWith('#')) return true;
            const upper = tr.toUpperCase();
            if (upper.includes('DOSSIÊ ESPECIAL')) return true;
            if (upper.startsWith('PANORAMA BÍBLICO') || upper.startsWith('PANORÂMA BÍBLICO')) return true;
            if (upper.includes('CURIOSIDADES E ARQUEOLOGIA')) return true;
            if (upper.includes('TIPOLOGIA: CONEXÃO COM JESUS CRISTO')) return true;
            if (upper.includes('APLICAÇÃO PRÁTICA')) return true;
            if (upper.includes('CONTEXTO HISTÓRICO')) return true;
            return false;
        };

        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            const wordsInBlock = block.split(/\s+/).filter(w => w.length > 0).length;
            
            if (currentWordCount + wordsInBlock > (TARGET_WORDS_PER_PAGE * 1.15) && currentBuffer.length > 0) {
                let headingsToMove: string[] = [];
                while (currentBuffer.length > 1 && isHeading(currentBuffer[currentBuffer.length - 1])) {
                    headingsToMove.unshift(currentBuffer.pop()!);
                }
                
                finalPages.push(currentBuffer.join('\n\n'));
                currentBuffer = [...headingsToMove, block];
                currentWordCount = currentBuffer.reduce((acc, b) => acc + b.split(/\s+/).filter(w => w.length > 0).length, 0);
            } else {
                currentBuffer.push(block);
                currentWordCount += wordsInBlock;
            }
            
            if (currentWordCount >= TARGET_WORDS_PER_PAGE) {
                let headingsToMove: string[] = [];
                while (currentBuffer.length > 1 && isHeading(currentBuffer[currentBuffer.length - 1])) {
                    headingsToMove.unshift(currentBuffer.pop()!);
                }
                
                finalPages.push(currentBuffer.join('\n\n'));
                currentBuffer = [...headingsToMove];
                currentWordCount = currentBuffer.reduce((acc, b) => acc + b.split(/\s+/).filter(w => w.length > 0).length, 0);
            }
        }
        if (currentBuffer.length > 0) finalPages.push(currentBuffer.join('\n\n'));
        setPages(finalPages.length > 0 ? finalPages : [html.trim()]);
    }, []);

    useEffect(() => {
        if (activeTab === 'thematic') {
            if (activeLesson) {
                processAndPaginate(activeLesson.content);
                setCurrentPage(0);
                calculateStats(activeLesson.content);
            } else {
                setPages([]);
                setCurrentPage(0);
                setStats({ wordCount: 0, charCount: 0, estimatedPages: 0 });
            }
        } else if (content) {
            const text = activeTab === 'student' ? content.student_content : content.teacher_content;
            processAndPaginate(text);
            setCurrentPage(0);
            calculateStats(text);
        } else {
            setPages([]);
            setCurrentPage(0);
            setStats({ wordCount: 0, charCount: 0, estimatedPages: 0 });
        }
    }, [activeTab, content, activeLesson, processAndPaginate, calculateStats]);

    useEffect(() => {
        if (isEditing) {
            if (activeTab === 'thematic' && activeLesson) {
                setEditValue(activeLesson.content);
            } else if (content) {
                setEditValue(activeTab === 'student' ? content.student_content : content.teacher_content);
            }
        }
    }, [isEditing, activeTab, content, activeLesson]);

    const handleSaveEdit = async () => {
        if (!isEditing) return;
        setIsSaving(true);
        try {
            if (activeTab === 'thematic' && activeLesson) {
                const updated = { ...activeLesson, content: editValue };
                await db.entities.ThematicLessons.update(activeLesson.id!, updated);
                setActiveLesson(updated);
            } else if (content) {
                const updated = { ...content, [activeTab === 'student' ? 'student_content' : 'teacher_content']: editValue };
                await db.entities.PanoramaBiblico.update(content.id!, updated);
                setContent(updated);
            }
            setIsEditing(false);
            onShowToast("Alterações salvas!", "success");
        } catch (e) {
            onShowToast("Erro ao salvar.", "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (activeTab === 'thematic' && activeLesson) {
            try {
                const updated = { ...activeLesson, content: '' };
                await db.entities.ThematicLessons.update(activeLesson.id!, updated);
                setActiveLesson(updated);
                onShowToast("Conteúdo da aula removido.", "info");
            } catch (e) {
                onShowToast("Erro ao remover conteúdo.", "error");
            }
        } else {
            if (!content) return;
            try {
                await db.entities.PanoramaBiblico.delete(content.id!);
                setContent(null);
                onShowToast("Manuscrito removido.", "info");
            } catch (e) {
                onShowToast("Erro ao remover.", "error");
            }
        }
    };

    const handleGenerateThematic = async () => {
        if (!activeLesson) return;
        setIsGenerating(true);
        setValidationPhase('structural');
        setValidationLog(["🚀 Iniciando motor Temático Série Ouro v114...", "📐 Target: 3.000 words (Mandato de Volume)"]);

        try {
            const userPrompt = customInstructions ? customInstructions : activeLesson.title;
            const res = await generateContent(userPrompt, null, true, 'thematic_ebd');
            if (!res || res.length < 1000) throw new Error("Conteúdo insuficiente retornado (Falha de Volume).");

            setValidationPhase('theological');
            let clean = res.trim();
            if (clean.startsWith('{"text":')) { try { clean = JSON.parse(clean).text; } catch(e){} }
            if (clean.startsWith('```')) clean = clean.replace(/```[a-z]*\n|```/g, '');

            const updatedLesson = { ...activeLesson, content: clean, is_published: true };
            await db.entities.ThematicLessons.update(activeLesson.id!, updatedLesson);
            setActiveLesson(updatedLesson);
            setValidationPhase('releasing');
            onShowToast('Apostila Série Ouro Gerada!', 'success');
            setCustomInstructions('');
            setShowInstructions(false);
        } catch (e: any) {
            onShowToast(`Erro na Geração: ${e.message}`, 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    return {
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
    };
}
