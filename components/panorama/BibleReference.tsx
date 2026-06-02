import React, { useState, useEffect, useRef } from 'react';
import { BibleService } from '../../services/bibleService';
import { BookOpen, X, Loader2, RefreshCw } from 'lucide-react';

interface BibleReferenceProps {
    book: string;
    chapter: number;
    verses: string; // e.g., "16", "1-3", "1,3,5"
    isAdmin?: boolean;
    children: React.ReactNode;
}

export const BibleReference: React.FC<BibleReferenceProps> = ({ book, chapter, verses, isAdmin, children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [verseTexts, setVerseTexts] = useState<{number: number, text: string}[]>([]);
    const [error, setError] = useState('');
    const [shiftX, setShiftX] = useState(0);
    
    const popoverRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node) &&
                buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    // Calculate shift to prevent overflow
    useEffect(() => {
        if (isOpen && buttonRef.current && popoverRef.current) {
            const buttonRect = buttonRef.current.getBoundingClientRect();
            const popoverWidth = popoverRef.current.offsetWidth;
            const viewportWidth = window.innerWidth;

            const defaultCenter = buttonRect.left + buttonRect.width / 2;
            const leftEdge = defaultCenter - popoverWidth / 2;
            const rightEdge = defaultCenter + popoverWidth / 2;

            let shift = 0;
            if (leftEdge < 16) {
                shift = 16 - leftEdge;
            } else if (rightEdge > viewportWidth - 16) {
                shift = (viewportWidth - 16) - rightEdge;
            }
            setShiftX(shift);
        } else {
            setShiftX(0);
        }
    }, [isOpen, loading, verseTexts]);

    const loadVerses = async (forceBypass = false) => {
        setLoading(true);
        setError('');
        try {
            const result = await BibleService.getChapter(book, chapter, forceBypass);
            
            // Parse requested verses
            const requestedNumbers = new Set<number>();
            const parts = verses.split(',');
            for (const part of parts) {
                const range = part.split('-');
                if (range.length === 2) {
                    const start = parseInt(range[0].trim());
                    const end = parseInt(range[1].trim());
                    for (let i = start; i <= end; i++) requestedNumbers.add(i);
                } else {
                    requestedNumbers.add(parseInt(part.trim()));
                }
            }

            const filtered = result.verses.filter(v => requestedNumbers.has(v.number));
            if (filtered.length > 0) {
                setVerseTexts(filtered);
            } else {
                setError('Versículos não encontrados.');
            }
        } catch (err: any) {
            setError('Erro ao carregar o texto bíblico.');
        } finally {
            setLoading(false);
        }
    };

    const handleOpen = async () => {
        setIsOpen(true);
        if (verseTexts.length > 0) return; // Already loaded
        await loadVerses(false);
    };

    return (
        <span className="relative inline-block">
            <button 
                ref={buttonRef}
                onClick={handleOpen}
                className="text-[#8B0000] dark:text-[#ff6b6b] font-bold hover:underline decoration-dashed underline-offset-4 transition-all"
            >
                {children}
            </button>

            {isOpen && (
                <div 
                    ref={popoverRef}
                    className="absolute z-50 bottom-full left-1/2 mb-2 w-72 md:w-96 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-[#C5A059]/30 p-4 animate-in fade-in slide-in-from-bottom-2"
                    style={{ transform: `translateX(calc(-50% + ${shiftX}px))` }}
                >
                    <div className="flex justify-between items-center mb-3 border-b border-gray-100 dark:border-gray-800 pb-2">
                        <div className="flex items-center gap-2 text-[#8B0000] dark:text-[#ff6b6b] font-cinzel font-bold">
                            <BookOpen className="w-4 h-4" />
                            <span>{book} {chapter}:{verses}</span>
                            {isAdmin && (
                                <button 
                                    onClick={() => loadVerses(true)}
                                    disabled={loading}
                                    title="Regerar/Atualizar Versículo (Burlar Cache)"
                                    className="ml-2 text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
                                >
                                    <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                                </button>
                            )}
                        </div>
                        <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    
                    <div className="max-h-60 overflow-y-auto no-scrollbar">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-6 text-[#C5A059]">
                                <Loader2 className="w-6 h-6 animate-spin mb-2" />
                                <span className="text-xs font-cinzel uppercase tracking-widest">Buscando...</span>
                            </div>
                        ) : error ? (
                            <p className="text-red-500 text-sm text-center py-4">{error}</p>
                        ) : (
                            <div className="space-y-2">
                                {verseTexts.map(v => (
                                    <p key={v.number} className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed font-cormorant">
                                        <sup className="text-[#C5A059] font-bold mr-1">{v.number}</sup>
                                        {v.text}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                    
                    {/* Seta do balão */}
                    <div 
                        className="absolute top-full left-1/2 -mt-[1px] border-8 border-transparent border-t-white dark:border-t-gray-900"
                        style={{ transform: `translateX(calc(-50% - ${shiftX}px))` }}
                    ></div>
                </div>
            )}
        </span>
    );
};
