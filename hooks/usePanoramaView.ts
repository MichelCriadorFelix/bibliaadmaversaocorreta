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
    const [depthLevel, setDepthLevel] = useState('padrao');
    const [targetPages, setTargetPages] = useState(5); // Default 5 pages
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

    const generateQuizFromContent = useCallback(async () => {
        if (!content || !content.student_content || content.student_content.length < 50) {
            onShowToast("O conteúdo do Panorama não está disponível ou é muito curto.", "error");
            return;
        }

        setQuizLoading(true);
        try {
            const prompt = `
                FONTE DE DADOS EXCLUSIVA (IGNORAR CONHECIMENTO PRÉVIO):
                """
                ${content.student_content}
                """
                
                TAREFA: Gere 5 perguntas de múltipla escolha baseadas APENAS no texto acima entre aspas triplas.
                
                REGRAS DE BLINDAGEM (Risco de Falha Crítica):
                1. A resposta correta DEVE estar escrita explicitamente no texto fornecido.
                2. Não use seu conhecimento bíblico geral. Use APENAS o texto colado acima.
                3. O campo 'proofText' deve ser uma CÓPIA IDÊNTICA da frase do texto que contém a resposta.
                4. TENTE VARIAR A POSIÇÃO DA RESPOSTA CORRETA (A, B, C, D, E) entre as perguntas para não viciar na mesma letra.
            `;

            const schema = {
                type: 'OBJECT',
                properties: {
                    questions: {
                        type: 'ARRAY',
                        items: {
                            type: 'OBJECT',
                            properties: {
                                text: { type: 'STRING', description: "Enunciado claro" },
                                options: { type: 'ARRAY', items: { type: 'STRING' } },
                                correctIndex: { type: 'INTEGER' },
                                proofText: { type: 'STRING', description: "Cópia exata do trecho do texto original que prova a resposta" }
                            }
                        }
                    }
                }
            };

            const data = await generateContent(prompt, schema, true, 'quiz_gen');
            
            if (data && data.questions && Array.isArray(data.questions)) {
                const newQuiz: Omit<Quiz, 'id'> = {
                    title: `Avaliação do Capítulo: ${book} ${chapter}`,
                    chapter_key: generateChapterKey(book, chapter),
                    type: 'class',
                    questions: data.questions,
                    created_at: new Date().toISOString(),
                    is_visible: false 
                };

                const savedQuiz = await db.entities.Quizzes.create(newQuiz as Quiz);
                setActiveQuiz(savedQuiz);
                onShowToast("Quiz gerado com sucesso! Lembre-se de revisá-lo.", "success");
            } else {
                 throw new Error("Formato de resposta inválido");
            }

        } catch (e: any) {
            console.error("Erro na geração do quiz", e);
            onShowToast("Erro ao gerar quiz: " + e.message, "error");
        } finally {
            setQuizLoading(false);
        }
    }, [content, book, chapter, onShowToast]);

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
        setValidationLog(["🚀 Iniciando motor Temático Série Ouro v114...", `📐 Target: ${targetPages * 500} words (Mandato de Volume)`]);

        try {
            const userPrompt = customInstructions ? customInstructions : activeLesson.title;
            const res = await generateContent(userPrompt, null, true, 'thematic_ebd', { depthLevel, targetPages: targetPages.toString() });
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

    const upgradeEbd = async (book: string, chapter: number, depthLevel: string, targetPages: number) => {
        if (!content) {
            onShowToast("Nenhum manuscrito disponível para atualizar.", "error");
            return;
        }
        const existingText = activeTab === 'student' ? content.student_content : content.teacher_content;
        if (!existingText || existingText.trim().length === 0) {
            onShowToast("O manuscrito atual está vazio. Gere-o do zero primeiro.", "error");
            return;
        }

        setIsGenerating(true);
        setValidationPhase('structural');
        setValidationLog(["🚀 Iniciando upgrade de manuscrito via Gemini 3.5 Flash...", `📐 Target de páginas: ${targetPages} páginas (${activeTab === 'student' ? 'Manuscrito Aluno' : 'Guia do Mestre'})`]);
        setTheologicalDensity(30);

        try {
            const taskType = activeTab === 'teacher' ? 'upgrade_teacher_ebd' : 'upgrade_ebd';
            const res = await generateContent(existingText, null, true, taskType, { book, chapter, depthLevel, targetPages: targetPages.toString() });
            if (!res || res.length < 500) throw new Error("Conteúdo insuficiente retornado (Falha de Volume).");

            setValidationPhase('theological');
            setTheologicalDensity(75);
            let clean = res.trim();
            if (clean.startsWith('{"text":')) { try { clean = JSON.parse(clean).text; } catch(e){} }
            if (clean.startsWith('```')) clean = clean.replace(/```[a-z]*\n|```/g, '');

            const updatedContent = { ...content, [activeTab === 'student' ? 'student_content' : 'teacher_content']: clean };
            await db.entities.PanoramaBiblico.update(content.id!, updatedContent);
            setContent(updatedContent);

            setValidationPhase('releasing');
            setTheologicalDensity(100);
            onShowToast('Manuscrito Atualizado com Sucesso!', 'success');
        } catch (e: any) {
            onShowToast(`Erro no Upgrade: ${e.message}`, 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    const upgradeThematic = async (depthLevel: string, targetPages: number) => {
        if (!activeLesson) return;
        if (!activeLesson.content || activeLesson.content.trim().length === 0) {
            onShowToast("A aula atual está vazia. Gere-a do zero primeiro.", "error");
            return;
        }

        setIsGenerating(true);
        setValidationPhase('structural');
        setValidationLog(["🚀 Iniciando upgrade de apostila Temática Série Ouro via Gemini 3.5 Flash...", `📐 Target de páginas: ${targetPages} páginas`]);
        setTheologicalDensity(30);

        try {
            const res = await generateContent(activeLesson.content, null, true, 'upgrade_thematic_ebd', { depthLevel, targetPages: targetPages.toString() });
            if (!res || res.length < 500) throw new Error("Conteúdo insuficiente retornado (Falha de Volume).");

            setValidationPhase('theological');
            setTheologicalDensity(75);
            let clean = res.trim();
            if (clean.startsWith('{"text":')) { try { clean = JSON.parse(clean).text; } catch(e){} }
            if (clean.startsWith('```')) clean = clean.replace(/```[a-z]*\n|```/g, '');

            const updatedLesson = { ...activeLesson, content: clean, is_published: true };
            await db.entities.ThematicLessons.update(activeLesson.id!, updatedLesson);
            setActiveLesson(updatedLesson);

            setValidationPhase('releasing');
            setTheologicalDensity(100);
            onShowToast('Apostila Atualizada com Sucesso!', 'success');
        } catch (e: any) {
            onShowToast(`Erro no Upgrade: ${e.message}`, 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleUpgrade = useCallback(() => {
        if (activeTab === 'thematic') {
            upgradeThematic(depthLevel, targetPages);
        } else {
            upgradeEbd(book, chapter, depthLevel, targetPages);
        }
    }, [activeTab, book, chapter, depthLevel, targetPages, content, activeLesson]);

    const [bookDownloadStatus, setBookDownloadStatus] = useState<{
        status: 'idle' | 'checking' | 'missing' | 'success';
        missing: number[];
        bookName: string;
        modeLabel: string;
    } | null>(null);
    const [isCheckingDownload, setIsCheckingDownload] = useState(false);

    useEffect(() => {
        setBookDownloadStatus(null);
    }, [book, activeTab]);

    const handleDownloadBook = async () => {
        const bookMeta = BIBLE_BOOKS.find(b => b.name === book);
        if (!bookMeta) {
            onShowToast("Livro inválido.", "error");
            return;
        }

        const totalChapters = bookMeta.chapters;
        const currentMode = activeTab === 'teacher' ? 'teacher' : 'student';
        const modeLabel = currentMode === 'teacher' ? 'Guia do Mestre (Professor)' : 'EBD Panorama (Aluno)';

        setIsCheckingDownload(true);
        setBookDownloadStatus({
            status: 'checking',
            missing: [],
            bookName: book,
            modeLabel
        });

        try {
            // Filtra os registros do Panoramabíblico que correspondem ao livro selecionado
            const records = await db.entities.PanoramaBiblico.filter({ book: book });
            
            const missingChapters: number[] = [];
            const chapterContentsMap: Record<number, EBDContent> = {};

            records.forEach(r => {
                if (r.chapter) {
                    chapterContentsMap[Number(r.chapter)] = r;
                }
            });

            for (let c = 1; c <= totalChapters; c++) {
                const record = chapterContentsMap[c];
                const contentText = currentMode === 'teacher' ? record?.teacher_content : record?.student_content;
                if (!record || !contentText || contentText.trim().length < 50) {
                    missingChapters.push(c);
                }
            }

            if (missingChapters.length > 0) {
                setBookDownloadStatus({
                    status: 'missing',
                    missing: missingChapters,
                    bookName: book,
                    modeLabel: modeLabel
                });
                onShowToast(`Existem ${missingChapters.length} capítulos sem aula neste livro.`, 'error');
                setIsCheckingDownload(false);
                return;
            }

            // Tudo completo! Compila tudo
            let markdown = `# COMPILADO DO LIVRO DE ${book.toUpperCase()}\n`;
            markdown += `## SERIE EBD PANORAMA - ${modeLabel.toUpperCase()}\n`;
            markdown += `*Ministério de Ensino ADMA - Assembleia de Deus Ministério Ágape*\n`;
            markdown += `*Data de Exportação: ${new Date().toLocaleDateString('pt-BR')}*\n\n`;
            markdown += `Este e-book consolidado contém todos os ${totalChapters} capítulos de ${book} interpretados sob o rigor hermenêutico e exegese microscópica da IA ADMA.\n\n`;
            markdown += `---\n\n`;

            for (let c = 1; c <= totalChapters; c++) {
                const record = chapterContentsMap[c];
                const contentText = currentMode === 'teacher' ? record.teacher_content : record.student_content;
                
                markdown += `# ${book} - Capítulo ${c}\n\n`;
                markdown += `${contentText}\n\n`;
                markdown += `\n<hr class="page-break">\n\n`;
            }

            // Cria arquivo e dispara download
            const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${book.toLowerCase().replace(/\s/g, '_')}_ebd_completo_${currentMode}.md`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            setBookDownloadStatus({
                status: 'success',
                missing: [],
                bookName: book,
                modeLabel
            });
            onShowToast(`Compilado de ${book} baixado com sucesso!`, 'success');
        } catch (error: any) {
            console.error(error);
            onShowToast(`Erro ao exportar compilado: ${error.message}`, 'error');
            setBookDownloadStatus(null);
        } finally {
            setIsCheckingDownload(false);
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
        handleSaveEdit, handleDelete, handleGenerateThematic, handleUpgrade,
        bookDownloadStatus, setBookDownloadStatus, isCheckingDownload, handleDownloadBook,
        loadQuiz, generateQuizFromContent,
        generateEbd, finalizeGeneration,
        addTheme, deleteTheme, addFolder, deleteFolder, addLesson, deleteLesson, renameLesson, moveLesson
    };
}
