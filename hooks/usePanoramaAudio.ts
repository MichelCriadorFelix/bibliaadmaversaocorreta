import { useState, useEffect, useRef, useCallback } from 'react';
import { fixBiblePronunciation } from '../utils/ttsHelper';

interface GlobalSentence {
    text: string;
    pageIndex: number;
    blockIndex: number;
}

export function usePanoramaAudio(pages: string[], currentPage: number, onPageChange: (page: number) => void) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
    const [selectedVoice, setSelectedVoice] = useState<string>('');
    const [playbackRate, setPlaybackRate] = useState(1);
    const [globalSentences, setGlobalSentences] = useState<GlobalSentence[]>([]);
    const [currentGlobalIndex, setCurrentGlobalIndex] = useState(0);
    const wakeLock = useRef<any>(null);

    const requestWakeLock = async () => {
        if ('wakeLock' in navigator) {
            try {
                wakeLock.current = await (navigator as any).wakeLock.request('screen');
            } catch (err) {
                console.warn('Wake Lock not available:', err);
            }
        }
    };

    const releaseWakeLock = useCallback(() => {
        if (wakeLock.current) {
            wakeLock.current.release();
            wakeLock.current = null;
        }
    }, []);

    useEffect(() => {
        const loadVoices = () => {
            let ptVoices = window.speechSynthesis.getVoices().filter(v => v.lang.includes('pt'));
            ptVoices.sort((a, b) => (b.name.includes('Google') || b.name.includes('Neural') ? 1 : -1));
            setVoices(ptVoices);
            if (ptVoices.length > 0 && !selectedVoice) setSelectedVoice(ptVoices[0].name);
        };
        loadVoices();
        window.speechSynthesis.onvoiceschanged = loadVoices;
        return () => window.speechSynthesis.cancel();
    }, [selectedVoice]);

    useEffect(() => {
        if (pages.length > 0) {
            let accumulatedSentences: GlobalSentence[] = [];
            pages.forEach((pageText, pageIndex) => {
                const lines = pageText.split('\n').filter(b => b.trim().length > 0);
                lines.forEach((line, blockIndex) => {
                    const tempDiv = document.createElement("div");
                    tempDiv.innerHTML = line.replace(/__CONTINUATION_MARKER__/g, '. ').replace(/<br>/g, '. ');
                    let clean = tempDiv.textContent || tempDiv.innerText || "";
                    
                    // Limpar tags customizadas antes de dividir em sentenças para evitar que pontos internos quebrem a frase
                    // {{Autor | Referência | Comando Oculto}} -> "Autor, Referência"
                    clean = clean.replace(/\{\{(.*?)\}\}/g, (match, inner) => {
                        const parts = inner.split('|');
                        if (parts.length >= 2) {
                            return `${parts[0].trim()}, ${parts[1].trim()}`;
                        }
                        return parts[0].trim();
                    });
                    // [[Termo | Explicação]] -> "Termo"
                    clean = clean.replace(/\[\[(.*?)\|.*?\]\]/g, (match, term) => term.trim());

                    clean = clean.replace(/\*\*/g, '').replace(/\*/g, '').replace(/#/g, '').trim();
                    if (!clean) return;
                    const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [clean];
                    sentences.forEach(s => {
                        if (s.trim().length > 0) {
                            accumulatedSentences.push({
                                text: s.trim(),
                                pageIndex,
                                blockIndex
                            });
                        }
                    });
                });
            });
            setGlobalSentences(accumulatedSentences);
            setCurrentGlobalIndex(0);
        } else {
            setGlobalSentences([]);
            setCurrentGlobalIndex(0);
        }
    }, [pages]);

    const stop = useCallback(() => {
        window.speechSynthesis.cancel();
        setIsPlaying(false);
        releaseWakeLock();
    }, [releaseWakeLock]);

    const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

    const isPlayingRef = useRef(isPlaying);
    useEffect(() => {
        isPlayingRef.current = isPlaying;
    }, [isPlaying]);

    const currentPageRef = useRef(currentPage);
    useEffect(() => {
        currentPageRef.current = currentPage;
    }, [currentPage]);

    const onPageChangeRef = useRef(onPageChange);
    useEffect(() => {
        onPageChangeRef.current = onPageChange;
    }, [onPageChange]);

    useEffect(() => {
        if (isPlaying && globalSentences.length > 0) {
            if (utterRef.current) {
                utterRef.current.onend = null;
                utterRef.current.onerror = null;
            }
            window.speechSynthesis.cancel();

            if (currentGlobalIndex >= globalSentences.length) {
                setIsPlaying(false);
                setCurrentGlobalIndex(0);
                return;
            }

            const currentSentenceObj = globalSentences[currentGlobalIndex];

            if (currentSentenceObj.pageIndex !== undefined && currentSentenceObj.pageIndex !== currentPageRef.current) {
                onPageChangeRef.current(currentSentenceObj.pageIndex);
            }

            const text = fixBiblePronunciation(currentSentenceObj.text);
            const utter = new SpeechSynthesisUtterance(text);
            utterRef.current = utter; // Prevent garbage collection
            utter.lang = 'pt-BR';
            utter.rate = playbackRate;
            const v = voices.find(vo => vo.name === selectedVoice);
            if (v) utter.voice = v;

            utter.onend = () => {
                if (!isPlayingRef.current) return; // Don't increment if paused
                if (currentGlobalIndex + 1 >= globalSentences.length) {
                    releaseWakeLock();
                }
                setCurrentGlobalIndex(prev => prev + 1);
            };
            
            utter.onerror = (e) => {
                if (e.error === 'canceled' || e.error === 'interrupted') return;
                console.error("Audio error", e);
                setIsPlaying(false);
            }

            window.speechSynthesis.speak(utter);
        }
    }, [isPlaying, currentGlobalIndex, globalSentences, playbackRate, selectedVoice, voices, releaseWakeLock]);

    const togglePlay = () => {
        if (isPlaying) {
            stop();
        } else {
            if (globalSentences.length === 0) return;
            setIsPlaying(true);
            requestWakeLock();
        }
    };

    const seekAudio = useCallback((percentage: number) => {
        if (globalSentences.length === 0) return;
        const newIndex = Math.floor(percentage * globalSentences.length);
        window.speechSynthesis.cancel();
        setCurrentGlobalIndex(Math.min(newIndex, globalSentences.length - 1));
        if (!isPlaying) {
            setIsPlaying(true);
            requestWakeLock();
        }
    }, [globalSentences.length, isPlaying, requestWakeLock]);

    return {
        isPlaying,
        voices,
        selectedVoice,
        setSelectedVoice,
        playbackRate,
        setPlaybackRate,
        currentGlobalIndex,
        globalSentences,
        togglePlay,
        stop,
        seekAudio
    };
}
