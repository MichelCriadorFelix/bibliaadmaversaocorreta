import { useState, useEffect, useRef } from 'react';
import { fixBiblePronunciation } from '../utils/ttsHelper';

export const useBibleAudio = (
    verses: { number: number, text: string }[],
    book: string,
    chapter: number,
    playbackRate: number,
    selectedVoice: string,
    voices: SpeechSynthesisVoice[]
) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentVerseIndex, setCurrentVerseIndex] = useState(0);
    const wakeLock = useRef<any>(null);

    const requestWakeLock = async () => {
        if ('wakeLock' in navigator) {
            try {
                wakeLock.current = await (navigator as any).wakeLock.request('screen');
            } catch (err) {
                console.error('Wake Lock Error:', err);
            }
        }
    };

    const releaseWakeLock = () => {
        if (wakeLock.current) {
            wakeLock.current.release();
            wakeLock.current = null;
        }
    };

    // Efeito de Reprodução Sequencial
    useEffect(() => {
        if (isPlaying && verses.length > 0) {
            window.speechSynthesis.cancel();
            
            if (currentVerseIndex >= verses.length) {
                setIsPlaying(false);
                setCurrentVerseIndex(0);
                releaseWakeLock();
                return;
            }

            const verse = verses[currentVerseIndex];
            if (!verse) return;

            // Rola para o versículo atual
            const activeVerseEl = document.getElementById(`verse-${currentVerseIndex}`);
            if (activeVerseEl) {
                const rect = activeVerseEl.getBoundingClientRect();
                const isVisible = rect.top >= 100 && rect.bottom <= window.innerHeight;
                if (!isVisible) {
                    const y = activeVerseEl.getBoundingClientRect().top + window.scrollY - 150;
                    window.scrollTo({ top: y, behavior: 'smooth' });
                }
            }

            const rawText = currentVerseIndex === 0 
                ? `${book} capítulo ${chapter}. ${verse.text}` 
                : verse.text;
            
            const textToRead = fixBiblePronunciation(rawText);
            
            const utter = new SpeechSynthesisUtterance(textToRead);
            utter.lang = 'pt-BR';
            utter.rate = playbackRate;
            const v = voices.find(vo => vo.name === selectedVoice);
            if (v) utter.voice = v;

            utter.onend = () => {
                setCurrentVerseIndex(prev => prev + 1);
            };
            
            utter.onerror = (e) => {
                console.error("Erro no áudio", e);
                setIsPlaying(false);
                releaseWakeLock();
            };

            window.speechSynthesis.speak(utter);
        }
    }, [isPlaying, currentVerseIndex, verses, book, chapter, playbackRate, selectedVoice, voices]);

    const togglePlay = () => {
        if (isPlaying) { 
            window.speechSynthesis.cancel();
            setIsPlaying(false); 
            releaseWakeLock();
        } else {
            if (verses.length === 0) return;
            setIsPlaying(true);
            requestWakeLock();
        }
    };

    // Reset ao mudar de capítulo
    useEffect(() => {
        setCurrentVerseIndex(0);
        setIsPlaying(false);
        window.speechSynthesis.cancel();
        releaseWakeLock();
    }, [book, chapter]);

    return { isPlaying, togglePlay, currentVerseIndex, setCurrentVerseIndex };
};
