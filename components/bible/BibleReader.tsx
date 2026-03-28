import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronLeft, Settings, Type, Play, Pause, CheckCircle, ChevronRight, List, Book, ChevronDown, RefreshCw, WifiOff, Zap, Volume2, X, FastForward, Search, Trash2, Sparkles, Loader2, Clock, Lock, Bookmark, CloudUpload, AlertTriangle, Highlighter, BookOpen } from 'lucide-react';
import VersePanel from './VersePanel';
import { PremiumNavigator } from './PremiumNavigator';
import { db } from '../../services/database';
import { BibleService } from '../../services/bibleService';
import { generateChapterKey, generateVerseKey, BIBLE_BOOKS } from '../../constants';
import { generateContent } from '../../services/geminiService';
import { motion, AnimatePresence } from 'framer-motion';
import { useBibleAudio } from '../../hooks/useBibleAudio';
import { useChapterMetadata } from '../../hooks/useChapterMetadata';
import { useUserProgress } from '../../hooks/useUserProgress';

// --- CATEGORIZAÇÃO DIDÁTICA DA BÍBLIA ---

// Componente Skeleton Loading Premium
const BibleSkeleton = () => (
    <div className="space-y-8 animate-pulse mt-8 px-2">
        {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex gap-4">
                <div className="w-8 h-8 bg-[#C5A059]/10 rounded-lg flex-shrink-0 mt-1"></div>
                <div className="flex-1 space-y-3">
                    <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded w-full"></div>
                    <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded w-11/12"></div>
                    <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded w-4/6"></div>
                </div>
            </div>
        ))}
    </div>
);

export default function BibleReader({ onBack, onNavigate, isAdmin, onShowToast, initialBook, initialChapter, initialVerse, userProgress, onProgressUpdate }: any) {
    const [book, setBook] = useState(initialBook || 'Gênesis');
    const [chapter, setChapter] = useState(initialChapter || 1);
    const [verses, setVerses] = useState<{number: number, text: string}[]>([]);
    
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');
    const [sourceMode, setSourceMode] = useState<'offline' | 'online' | 'cloud'>('offline');
    
    const [showSelector, setShowSelector] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [fontSize, setFontSize] = useState(20); 
    const [selectedVerse, setSelectedVerse] = useState<{text: string, number: number} | null>(null);

    const chapterKey = generateChapterKey(book, chapter);
    const { metadata, isGeneratingMeta, loadMetadata, generateMetadata } = useChapterMetadata(chapterKey, book, chapter, isAdmin, onShowToast);

    const { 
        isSaving: isSavingProgress, 
        readingTimer, 
        startTimer, 
        toggleChapterRead 
    } = useUserProgress({ userProgress, onProgressUpdate, onShowToast });

    // AUDIO SYSTEM - ATUALIZADO COM PROGRESSO SEQUENCIAL
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
    const [selectedVoice, setSelectedVoice] = useState<string>('');
    const [playbackRate, setPlaybackRate] = useState(1);
    const { isPlaying, togglePlay, currentVerseIndex, setCurrentVerseIndex } = useBibleAudio(verses, book, chapter, playbackRate, selectedVoice, voices);
    
    const isRead = userProgress?.chapters_read?.includes(chapterKey);
    const isLocked = !isRead && readingTimer > 0;

    useEffect(() => {
        const load = () => {
            const v = window.speechSynthesis.getVoices().filter(voice => voice.lang.includes('pt'));
            setVoices(v);
            if(v.length > 0 && !selectedVoice) setSelectedVoice(v[0].name);
        };
        load();
        window.speechSynthesis.onvoiceschanged = load;
        return () => window.speechSynthesis.cancel();
    }, []);

    // Efeito para reiniciar áudio se mudar voz ou velocidade
    useEffect(() => {
        if (isPlaying) {
            window.speechSynthesis.cancel();
            // Pequeno delay para garantir limpeza
            setTimeout(() => {
                // Não reinicia automaticamente aqui para evitar loop infinito,
                // O usuário deve dar play novamente ou o sistema pode retomar
                // Mas geralmente resetar para false é mais seguro
                // setIsPlaying(false); // Removido pois o hook gerencia
            }, 100);
        }
    }, [playbackRate, selectedVoice]);

    // Efeito de Reprodução Sequencial (Avança Versículos)
    // Removido: A lógica agora está no hook useBibleAudio

    // Efeito para carregar capítulo e INICIAR TIMER
    useEffect(() => {
        window.scrollTo(0, 0);

        // Tenta encontrar o nome canônico do livro (resolve problemas de acentuação vindos da busca)
        const canonicalBook = BIBLE_BOOKS.find(b => 
            b.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 
            book.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        );
        
        if (canonicalBook && canonicalBook.name !== book) {
            setBook(canonicalBook.name);
            return;
        }

        fetchChapter();
        loadMetadata();
        startTimer(isRead);
    }, [book, chapter]); // Reinicia sempre que muda o capítulo

    useEffect(() => {
        if (!loading && initialVerse && verses.length > 0) {
            const verseIdx = verses.findIndex(v => v.number === initialVerse);
            if (verseIdx !== -1) {
                setTimeout(() => {
                    const el = document.getElementById(`verse-${verseIdx}`);
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, 500);
            }
        }
    }, [loading, initialVerse, verses]);

    const fetchChapter = async () => {
        setLoading(true);
        setErrorMsg('');
        setVerses([]);
        setSourceMode('offline');
        
        try {
            const result = await BibleService.getChapter(book, chapter);
            setVerses(result.verses);
            setSourceMode(result.source);
        } catch (e: any) {
            console.error(e);
            setErrorMsg("Não foi possível carregar o texto.");
        } finally {
            setLoading(false);
        }
    };

    const clearCacheAndRetry = async () => {
        await BibleService.clearCache(book, chapter);
        fetchChapter();
    };

    // Nova Lógica de Toggle Play: Simplesmente altera o estado
    // O useEffect lida com a reprodução baseada no currentVerseIndex
    // Removido: O hook useBibleAudio gerencia isso

    const toggleRead = () => toggleChapterRead(book, chapter, chapterKey, isRead);

    const handleNext = () => {
        const meta = BIBLE_BOOKS.find(b => b.name === book);
        if (!meta) return;
        if (chapter < meta.chapters) setChapter(c => c + 1);
        else {
            const idx = BIBLE_BOOKS.findIndex(b => b.name === book);
            if (idx < BIBLE_BOOKS.length - 1) { setBook(BIBLE_BOOKS[idx + 1].name); setChapter(1); }
        }
    };

    const handlePrev = () => {
        if (chapter > 1) setChapter(c => c - 1);
        else {
            const idx = BIBLE_BOOKS.findIndex(b => b.name === book);
            if (idx > 0) { const prev = BIBLE_BOOKS[idx - 1]; setBook(prev.name); setChapter(prev.chapters); }
        }
    };

    // --- OTIMIZAÇÃO DE RENDERIZAÇÃO: MEMOIZAÇÃO DA LISTA DE VERSÍCULOS ---
    const renderedVerses = useMemo(() => {
        return verses.map((v, idx) => {
            const highlight = userProgress?.highlights?.find((h: any) => h.verse_key === generateVerseKey(book, chapter, v.number));
            const isSelected = selectedVerse?.number === v.number;
            // Indica visualmente qual versículo está sendo lido
            const isReading = currentVerseIndex === idx && (isPlaying || !isPlaying); // Mostra marcador mesmo pausado se > 0

            return (
                <span 
                    key={idx} 
                    id={`verse-${idx}`}
                    onClick={() => setSelectedVerse(v)}
                    className={`cursor-pointer transition-colors rounded px-1 relative inline-block mx-0.5 ${
                        isReading ? 'border-b-2 border-[#C5A059] bg-yellow-100/30 dark:bg-yellow-900/20' : ''
                    } ${
                        isSelected ? 'bg-[#C5A059]/30' : ''
                    } ${highlight ? highlight.color : 'hover:bg-[#C5A059]/20'}`}
                >
                    <sup className="text-[10px] font-bold text-[#C5A059] mr-1 select-none">{v.number}</sup>
                    <span className="font-cormorant text-lg md:text-xl text-gray-800 dark:text-gray-200 leading-relaxed" style={{ fontSize: `${fontSize}px`, lineHeight: '1.8' }}>
                        {v.text}
                    </span>
                </span>
            );
        });
    }, [verses, userProgress?.highlights, selectedVerse, fontSize, book, chapter, currentVerseIndex, isPlaying]);

    return (
        <div className="min-h-screen bg-transparent flex flex-col transition-colors duration-300">
            {/* Header OTIMIZADO: Removed backdrop-blur-xl -> bg opacity high */}
            <div className="sticky top-0 z-30 bg-[#8B0000] dark:bg-black text-white pt-[calc(env(safe-area-inset-top)+1rem)] pb-3 px-3 md:py-4 shadow-lg flex justify-between items-center border-b border-white/10">
                <div className="flex items-center gap-2">
                    <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-all active:scale-90"><ChevronLeft /></button>
                    <div className="flex flex-col cursor-pointer active:opacity-70 transition-opacity p-1 px-2 rounded-lg hover:bg-white/5" onClick={() => setShowSelector(true)}>
                        <h1 className="font-cinzel font-bold text-lg flex items-center gap-2 leading-none drop-shadow-sm tracking-wide">
                            {book} {chapter} <ChevronDown className="w-4 h-4 text-[#C5A059]" />
                        </h1>
                        <span className="text-[9px] uppercase tracking-[0.2em] opacity-70 font-montserrat">Almeida Corrigida</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={togglePlay} className="p-2 hover:bg-white/10 rounded-full transition-all active:scale-90">{isPlaying ? <Pause className="w-5 h-5 animate-pulse text-[#C5A059]" /> : <Play className="w-5 h-5" />}</button>
                    
                    <button 
                        onClick={toggleRead} 
                        disabled={isLocked || isSavingProgress}
                        className={`p-2 rounded-full transition-all active:scale-90 relative ${
                            isRead 
                            ? 'text-green-400 bg-green-900/20' 
                            : isLocked 
                                ? 'text-gray-400 opacity-50 cursor-not-allowed' 
                                : isSavingProgress 
                                    ? 'text-yellow-400 animate-pulse'
                                    : 'hover:bg-white/10 text-white/70'
                        }`}
                    >
                        {isSavingProgress ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : isLocked ? (
                            <div className="relative">
                                <Lock className="w-5 h-5" />
                                <span className="absolute -top-2 -right-2 text-[8px] font-bold bg-[#C5A059] text-black px-1 rounded-full">{readingTimer}</span>
                            </div>
                        ) : (
                            <CheckCircle className="w-5 h-5" />
                        )}
                    </button>
                    
                    <button onClick={() => setShowSettings(!showSettings)} className={`p-2 rounded-full transition-all active:scale-90 ${showSettings ? 'bg-white/20 text-[#C5A059]' : 'hover:bg-white/10'}`}><Settings className="w-5 h-5" /></button>
                </div>
            </div>

            {showSettings && (
                // OTIMIZAÇÃO: Reduced transparency
                <div className="bg-white/98 dark:bg-[#1E1E1E]/98 border-b border-[#C5A059] p-6 shadow-2xl animate-in slide-in-from-top-5 relative z-20">
                    <div className="grid gap-6 max-w-lg mx-auto">
                        <div className="flex items-center justify-between">
                            <span className="font-bold text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2 font-montserrat"><Type className="w-4 h-4 text-[#C5A059]"/> TAMANHO</span>
                            <div className="flex items-center gap-4 bg-gray-100 dark:bg-black/30 p-1 rounded-full">
                                <button onClick={() => setFontSize(Math.max(14, fontSize - 2))} className="w-10 h-10 rounded-full bg-white dark:bg-[#2A2A2A] shadow-sm flex items-center justify-center dark:text-white hover:scale-105 transition">-</button>
                                <span className="font-bold w-8 text-center dark:text-white font-cinzel">{fontSize}</span>
                                <button onClick={() => setFontSize(Math.min(32, fontSize + 2))} className="w-10 h-10 rounded-full bg-white dark:bg-[#2A2A2A] shadow-sm flex items-center justify-center dark:text-white hover:scale-105 transition">+</button>
                            </div>
                        </div>

                        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                            <span className="font-bold text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-3 font-montserrat"><Volume2 className="w-4 h-4 text-[#C5A059]"/> ÁUDIO & VOZ</span>
                            <div className="space-y-4">
                                {/* PROGRESS BAR / TIMELINE (NOVO) */}
                                <div className="bg-gray-100 dark:bg-black/30 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                                    <div className="flex items-center gap-3 mb-1">
                                        <span className="text-[10px] font-bold font-mono text-[#8B0000] dark:text-[#C5A059] w-8 text-right">{currentVerseIndex + 1}</span>
                                        <input 
                                            type="range" 
                                            min="0" 
                                            max={Math.max(0, verses.length - 1)} 
                                            value={currentVerseIndex} 
                                            onChange={(e) => {
                                                const newIndex = Number(e.target.value);
                                                setCurrentVerseIndex(newIndex);
                                                // Se estiver tocando, o useEffect vai reagir e tocar o novo índice automaticamente
                                                // Se estiver pausado, apenas atualiza o marcador visual
                                                if(isPlaying) {
                                                    window.speechSynthesis.cancel();
                                                }
                                            }}
                                            className="flex-1 accent-[#8B0000] h-2 bg-gray-300 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                        />
                                        <span className="text-[10px] font-bold font-mono text-gray-500 w-8">{verses.length}</span>
                                    </div>
                                    <p className="text-center text-[10px] text-gray-400 uppercase tracking-widest font-bold">
                                        {currentVerseIndex === 0 ? "Início do Capítulo" : `Lendo Versículo ${currentVerseIndex + 1}`}
                                    </p>
                                </div>

                                <select 
                                    className="w-full p-3 text-sm border-none bg-gray-100 dark:bg-black/30 rounded-xl dark:text-white font-montserrat focus:ring-2 focus:ring-[#C5A059]"
                                    value={selectedVoice} 
                                    onChange={e => setSelectedVoice(e.target.value)}
                                >
                                    {voices.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                                </select>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1 uppercase tracking-wider">
                                        <FastForward className="w-3 h-3" /> Velocidade
                                    </span>
                                    <div className="flex gap-2">
                                        {[0.75, 1, 1.25, 1.5].map(rate => (
                                            <button 
                                                key={rate}
                                                onClick={() => setPlaybackRate(rate)}
                                                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${playbackRate === rate ? 'bg-[#8B0000] text-white shadow-lg shadow-red-900/30 scale-105' : 'bg-gray-100 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200'}`}
                                            >
                                                {rate}x
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <PremiumNavigator 
                isOpen={showSelector} 
                onClose={() => setShowSelector(false)} 
                currentBook={book} 
                onSelect={(b: string, c: number) => { setBook(b); setChapter(c); }} 
                userProgress={userProgress}
            />

            <div className="flex-1 overflow-y-auto pb-24 scroll-smooth">
                <div className="max-w-3xl mx-auto p-6 md:p-12">
                    {loading ? (
                        <>
                            <div className="flex flex-col items-center mb-12 space-y-3">
                                <div className="h-10 w-64 bg-[#C5A059]/10 rounded-lg animate-pulse"></div>
                                <div className="h-4 w-40 bg-gray-200 dark:bg-gray-800 rounded animate-pulse"></div>
                            </div>
                            <BibleSkeleton />
                        </>
                    ) : (
                        <div className="text-center mb-12 mt-4 select-none">
                            <h1 className="font-cinzel text-4xl md:text-5xl font-bold text-[#8B0000] dark:text-[#ff6b6b] mb-4 uppercase tracking-tighter drop-shadow-sm leading-none">
                                {book} <span className="text-[#C5A059]">{chapter}</span>
                            </h1>

                            {isGeneratingMeta ? (
                                <div className="flex flex-col items-center text-[#C5A059] animate-pulse mt-4">
                                    <Sparkles className="w-5 h-5 mb-2" />
                                    <p className="font-cinzel text-[10px] font-bold uppercase tracking-[0.3em]">Contextualizando...</p>
                                </div>
                            ) : metadata ? (
                                <div className="max-w-xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 relative group">
                                    <h2 className="font-cinzel text-xs md:text-sm font-bold text-[#C5A059] uppercase tracking-[0.3em] mb-2 flex items-center justify-center gap-2">
                                        {metadata.title}
                                        {isAdmin && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); generateMetadata(); }}
                                                className="text-gray-300 hover:text-[#8B0000] transition-colors p-1"
                                                title="Regerar Epígrafe (Admin)"
                                            >
                                                <RefreshCw className="w-3 h-3" />
                                            </button>
                                        )}
                                    </h2>
                                    <p className="font-cormorant text-xl text-gray-600 dark:text-gray-400 italic leading-relaxed px-4">
                                        "{metadata.subtitle}"
                                    </p>
                                    <div className="w-16 h-[1px] bg-gradient-to-r from-transparent via-[#C5A059] to-transparent mx-auto mt-6 opacity-60"></div>
                                </div>
                            ) : (
                                <div className="h-8 flex justify-center">
                                    {isAdmin && (
                                        <button onClick={generateMetadata} className="text-xs text-[#C5A059] underline hover:text-[#8B0000]">
                                            Gerar Epígrafe
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {errorMsg ? (
                        <div className="text-center py-20">
                            <WifiOff className="w-16 h-16 mx-auto mb-4 text-[#8B0000] opacity-50"/>
                            <p className="text-gray-500 mb-6 font-cormorant text-lg">{errorMsg}</p>
                            <div className="flex flex-col gap-3 max-w-xs mx-auto">
                                <button onClick={fetchChapter} className="bg-[#8B0000] text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-red-900/20 flex items-center justify-center gap-2 active:scale-95 transition-transform">
                                    <RefreshCw className="w-4 h-4"/> Tentar Novamente
                                </button>
                                <button onClick={clearCacheAndRetry} className="text-red-500 px-4 py-2 rounded flex items-center justify-center gap-2 text-xs hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">
                                    <Trash2 className="w-3 h-3"/> Forçar Download Online
                                </button>
                            </div>
                        </div>
                    ) : !loading && (
                        <div className="text-justify px-2 md:px-0 selection:bg-[#C5A059]/30 mb-20 animate-in fade-in duration-700">
                            {/* RENDERIZAÇÃO OTIMIZADA DOS VERSÍCULOS */}
                            {renderedVerses}
                        </div>
                    )}

                    {/* Botões de Navegação Rodapé */}
                    {!loading && !errorMsg && (
                        <>
                            <div className="flex justify-between items-center mt-12 pt-8 border-t border-[#C5A059]/10">
                                <button 
                                    onClick={handlePrev} 
                                    className="px-6 py-3 rounded-xl border border-[#C5A059]/30 text-[#C5A059] font-bold text-sm hover:bg-[#C5A059]/5 flex items-center gap-2 transition-all active:scale-95"
                                >
                                    <ChevronLeft className="w-4 h-4" /> Anterior
                                </button>
                                
                                {!isRead && (
                                    <button 
                                        onClick={toggleRead}
                                        disabled={isLocked || isSavingProgress}
                                        className={`px-8 py-3 rounded-full font-cinzel font-bold text-sm shadow-lg flex items-center gap-2 transition-all active:scale-95 ${
                                            isLocked 
                                            ? 'bg-gray-300 dark:bg-gray-800 text-gray-500 cursor-not-allowed' 
                                            : 'bg-[#8B0000] text-white hover:bg-[#a00000]'
                                        }`}
                                    >
                                        {isSavingProgress ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                        {isLocked ? `Aguarde ${readingTimer}s` : 'Concluir Leitura'}
                                    </button>
                                )}

                                <button 
                                    onClick={handleNext} 
                                    className="px-6 py-3 rounded-xl border border-[#C5A059]/30 text-[#C5A059] font-bold text-sm hover:bg-[#C5A059]/5 flex items-center gap-2 transition-all active:scale-95"
                                >
                                    Próximo <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                            
                            {/* Novo Botão de Estudo EBD Panorama */}
                            <div className="mt-8 flex justify-center">
                                <button 
                                    onClick={() => onNavigate && onNavigate('panorama', { book, chapter })}
                                    className="w-full max-w-md px-6 py-4 rounded-2xl bg-gradient-to-r from-[#1a0f0f] to-[#2a1f1f] dark:from-[#2a1f1f] dark:to-[#3a2f2f] border border-[#C5A059]/40 text-[#C5A059] font-cinzel font-bold text-sm hover:bg-[#C5A059]/10 flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg"
                                >
                                    <BookOpen className="w-5 h-5" />
                                    Estudar este Capítulo no Panorama
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Modal de Versículo com Ferramentas */}
            <VersePanel 
                isOpen={!!selectedVerse} 
                onClose={() => setSelectedVerse(null)} 
                verse={selectedVerse?.text || ''} 
                verseNumber={selectedVerse?.number || 0}
                book={book}
                chapter={chapter}
                isAdmin={isAdmin}
                onShowToast={onShowToast}
                userName={userProgress?.user_name}
                userProgress={userProgress}
                onProgressUpdate={onProgressUpdate}
            />
        </div>
    );
}
