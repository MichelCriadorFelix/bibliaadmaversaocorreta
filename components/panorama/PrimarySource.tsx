import React, { useState, useEffect, useRef } from 'react';
import { BookOpen, X, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { db } from '../../services/database';
import ReactMarkdown from 'react-markdown';

interface PrimarySourceProps {
    source: string;
    reference: string;
    hiddenCommand?: string;
    isAdmin?: boolean;
    children: React.ReactNode;
}

export const PrimarySource: React.FC<PrimarySourceProps> = ({ source, reference, hiddenCommand, isAdmin, children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [content, setContent] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [shiftX, setShiftX] = useState(0);
    const [localIsAdmin, setLocalIsAdmin] = useState(false);
    
    const popoverRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const checkAdminFallback = async () => {
            try {
                const saved = localStorage.getItem('adma_user');
                if (saved) {
                    const u = JSON.parse(saved);
                    if (u?.user_email) {
                        const profiles = await db.entities.ReadingProgress.filter({ user_email: u.user_email });
                        if (profiles && profiles.length > 0 && profiles[0].role === 'admin') {
                            setLocalIsAdmin(true);
                        }
                    }
                }
            } catch (e) {
                console.error("Error verifying admin fallback in PrimarySource", e);
            }
        };
        checkAdminFallback();
    }, []);

    const finalIsAdmin = !!(isAdmin || localIsAdmin);

    const sourceIdBase = `${source.toLowerCase().replace(/\s+/g, '_')}_${reference.toLowerCase().replace(/\s+/g, '_')}`;
    const hashCode = (s: string) => s.split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0);
    const sourceId = hiddenCommand ? `${sourceIdBase}_${Math.abs(hashCode(hiddenCommand))}` : sourceIdBase;

    const fetchSource = async (forceRegenerate = false) => {
        setIsLoading(true);
        setError(null);
        try {
            if (!forceRegenerate) {
                // 1. Tentar buscar no banco de dados (Universal via Supabase)
                const existing = await db.entities.PrimarySources.get(sourceId);
                if (existing && existing.text) {
                    setContent(existing.text);
                    setIsLoading(false);
                    return;
                }
            }

            // 2. Se não existir ou forçar a regeneração, buscar via Gemini
            const promptText = hiddenCommand 
                ? `Referência: ${source}, ${reference}. Instrução específica: ${hiddenCommand}` 
                : `${source}, ${reference}`;

            const response = await fetch('/api/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    taskType: 'fetch_primary_source',
                    prompt: promptText
                })
            });

            if (!response.ok) throw new Error('Falha ao buscar fonte primária');
            const data = await response.json();
            
            if (data.text) {
                setContent(data.text);
                // 3. Salvar no banco para que se torne "Universal"
                await db.entities.PrimarySources.save({
                    id: sourceId,
                    source,
                    reference,
                    text: data.text,
                    timestamp: Date.now()
                });
            } else {
                throw new Error('Texto não encontrado');
            }
        } catch (err: any) {
            console.error('Error fetching primary source:', err);
            setError('Não foi possível carregar o texto original desta fonte no momento.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen && !content && !isLoading) {
            fetchSource();
        }
    }, [isOpen]);

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
    }, [isOpen, content, isLoading, error]);

    return (
        <span className="relative inline-block">
            <button 
                ref={buttonRef}
                onClick={() => setIsOpen(true)}
                className="text-[#D4AF37] dark:text-[#FFD700] font-bold border-b-2 border-dotted border-[#D4AF37] hover:bg-[#D4AF37]/10 transition-colors rounded px-1 italic"
                title={`Ver texto de ${source}`}
            >
                {children}
            </button>

            {isOpen && (
                <div 
                    ref={popoverRef}
                    className="absolute z-50 bottom-full left-1/2 mb-2 w-72 md:w-96 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-[#D4AF37]/30 p-4 animate-in fade-in slide-in-from-bottom-2"
                    style={{ transform: `translateX(calc(-50% + ${shiftX}px))` }}
                >
                    <div className="flex justify-between items-start mb-3 border-b border-gray-100 dark:border-gray-800 pb-2">
                        <div className="flex items-center gap-2 text-[#D4AF37] font-cinzel font-bold">
                            <BookOpen className="w-4 h-4" />
                            <span className="text-xs uppercase tracking-wider">Fonte Primária</span>
                            {finalIsAdmin && (
                                <button 
                                    onClick={() => fetchSource(true)}
                                    disabled={isLoading}
                                    title="Regerar Fonte Primária (Ignorar Cache)"
                                    className="ml-2 text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
                                >
                                    <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                                </button>
                            )}
                        </div>
                        <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    
                    <div className="max-h-80 overflow-y-auto no-scrollbar">
                        {isLoading ? (
                            <div className="flex flex-col items-center justify-center py-8 gap-3">
                                <Loader2 className="w-8 h-8 text-[#D4AF37] animate-spin" />
                                <div className="text-xs text-gray-500 font-inter animate-pulse">Buscando texto original...</div>
                            </div>
                        ) : error ? (
                            <div className="flex flex-col items-center justify-center py-4 gap-2 text-center">
                                <AlertCircle className="w-6 h-6 text-red-500" />
                                <div className="text-sm text-gray-600 dark:text-gray-400 font-inter italic">{error}</div>
                            </div>
                        ) : (
                            <div className="prose prose-sm dark:prose-invert max-w-none font-inter text-gray-800 dark:text-gray-200 leading-relaxed">
                                <ReactMarkdown>{content || ''}</ReactMarkdown>
                                <div className="mt-4 pt-2 border-t border-gray-100 dark:border-gray-800 text-[10px] text-gray-400 italic text-right">
                                    Tradução e Contexto por Prof. Michel Felix (IA)
                                </div>
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
