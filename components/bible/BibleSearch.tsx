import React, { useState, useEffect, useRef } from 'react';
import { Search, X, BookOpen, Loader2, Sparkles, ChevronRight, History, Hash } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateContent } from '../../services/geminiService';
import { BIBLE_BOOKS } from '../../constants';

interface BibleSearchProps {
    isOpen: boolean;
    onClose: () => void;
    onNavigate: (view: string, params?: any) => void;
}

interface SearchResult {
    book: string;
    chapter: number;
    verse: number;
    text: string;
    relevance: string;
}

export default function BibleSearch({ isOpen, onClose, onNavigate }: BibleSearchProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState<string[]>([]);
    const searchCache = useRef<Record<string, SearchResult[]>>({});

    useEffect(() => {
        try {
            const saved = localStorage.getItem('adma_search_cache');
            if (saved) searchCache.current = JSON.parse(saved);
        } catch (e) {}
    }, []);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            const savedHistory = localStorage.getItem('adma_search_history');
            if (savedHistory) setHistory(JSON.parse(savedHistory));
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    const handleSearch = async (searchQuery: string = query) => {
        const cleanQuery = searchQuery.trim().toLowerCase();
        if (!cleanQuery || cleanQuery.length < 2) return;
        
        // Verificar Cache
        if (searchCache.current[cleanQuery]) {
            setResults(searchCache.current[cleanQuery]);
            setQuery(searchQuery);
            return;
        }

        setLoading(true);
        setResults([]);
        
        // Atualizar histórico
        const newHistory = [searchQuery, ...history.filter(h => h !== searchQuery)].slice(0, 5);
        setHistory(newHistory);
        localStorage.setItem('adma_search_history', JSON.stringify(newHistory));

        const prompt = `
            Busque na Bíblia: "${searchQuery}"
            Retorne os 5 versículos mais relevantes.
            Use nomes exatos: ${BIBLE_BOOKS.map(b => b.name).join(', ')}.
            
            Formato JSON:
            [{"book": "Nome", "chapter": 1, "verse": 1, "text": "...", "relevance": "..."}]
        `;

        try {
            const schema = {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        book: { type: 'string' },
                        chapter: { type: 'number' },
                        verse: { type: 'number' },
                        text: { type: 'string' },
                        relevance: { type: 'string' }
                    },
                    required: ['book', 'chapter', 'verse', 'text', 'relevance']
                }
            };

            // Mudamos para 'assistente_chat' que usa o modelo Flash mais rápido e potente
            const response = await generateContent(prompt, schema, false, 'assistente_chat');
            if (Array.isArray(response)) {
                setResults(response);
                // Salvar no Cache Persistente
                searchCache.current[cleanQuery] = response;
                localStorage.setItem('adma_search_cache', JSON.stringify(searchCache.current));
            }
        } catch (error) {
            console.error("Search Error:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleResultClick = (res: SearchResult) => {
        onNavigate('reader', { book: res.book, chapter: res.chapter, verse: res.verse });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-20 px-4">
            <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
                onClick={onClose} 
            />
            
            <motion.div 
                initial={{ scale: 0.9, y: 20, opacity: 0 }} 
                animate={{ scale: 1, y: 0, opacity: 1 }} 
                exit={{ scale: 0.9, y: 20, opacity: 0 }}
                className="bg-[#FDFBF7] dark:bg-[#1A1A1A] w-full max-w-2xl rounded-[32px] shadow-2xl border border-[#C5A059]/30 overflow-hidden relative z-10"
            >
                {/* Botão de Fechar Superior */}
                <button 
                    onClick={onClose}
                    className="absolute top-2 right-2 z-20 p-2 rounded-full bg-black/5 dark:bg-white/5 text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-all active:scale-90"
                    title="Fechar Janela"
                >
                    <X className="w-4 h-4" />
                </button>

                {/* Header / Input */}
                <div className="p-6 border-b border-gray-200 dark:border-white/10">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#C5A059]" />
                        <input 
                            ref={inputRef}
                            type="text" 
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            placeholder="Pesquise por tema, trecho ou referência..."
                            className="w-full bg-gray-100 dark:bg-black/40 border-2 border-transparent focus:border-[#C5A059]/50 rounded-2xl py-4 pl-12 pr-24 text-lg font-medium outline-none transition-all dark:text-white"
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            {query && (
                                <button 
                                    onClick={() => setQuery('')}
                                    className="p-2 hover:bg-gray-200 dark:hover:bg-white/10 rounded-full transition-colors"
                                    title="Limpar"
                                >
                                    <X className="w-4 h-4 text-gray-400" />
                                </button>
                            )}
                            <button 
                                onClick={() => handleSearch()}
                                className="bg-[#C5A059] hover:bg-[#9e8045] text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold text-sm transition-all active:scale-95 shadow-lg shadow-[#C5A059]/20"
                            >
                                <Search className="w-4 h-4" />
                                <span>Buscar</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Content Area */}
                <div className="max-h-[60vh] overflow-y-auto p-4 custom-scrollbar">
                    {loading ? (
                        <div className="py-20 flex flex-col items-center justify-center space-y-4">
                            <Loader2 className="w-10 h-10 text-[#C5A059] animate-spin" />
                            <p className="font-cinzel text-sm text-[#C5A059] animate-pulse">Consultando Manuscritos...</p>
                        </div>
                    ) : results.length > 0 ? (
                        <div className="space-y-3">
                            <p className="px-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <Sparkles className="w-3 h-3 text-[#C5A059]" /> Resultados Encontrados
                            </p>
                            {results.map((res, idx) => (
                                <motion.button
                                    key={idx}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    onClick={() => handleResultClick(res)}
                                    className="w-full text-left p-5 rounded-2xl bg-white dark:bg-black/20 border border-gray-100 dark:border-white/5 hover:border-[#C5A059]/50 transition-all group"
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="font-cinzel font-bold text-[#8B0000] dark:text-[#ff6b6b] text-sm">
                                            {res.book} {res.chapter}:{res.verse}
                                        </span>
                                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#C5A059] transition-colors" />
                                    </div>
                                    <p className="font-cormorant text-lg leading-relaxed text-gray-800 dark:text-gray-200 mb-2">
                                        "{res.text}"
                                    </p>
                                    <div className="flex items-center gap-2 text-[10px] text-[#C5A059] font-bold uppercase tracking-tighter opacity-70">
                                        <Hash className="w-3 h-3" /> {res.relevance}
                                    </div>
                                </motion.button>
                            ))}
                        </div>
                    ) : query.length === 0 ? (
                        <div className="py-10">
                            {history.length > 0 && (
                                <div className="mb-8">
                                    <p className="px-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <History className="w-3 h-3" /> Pesquisas Recentes
                                    </p>
                                    <div className="flex flex-wrap gap-2 px-2">
                                        {history.map((h, i) => (
                                            <button 
                                                key={i} 
                                                onClick={() => { setQuery(h); handleSearch(h); }}
                                                className="px-4 py-2 rounded-full bg-gray-100 dark:bg-white/5 text-sm text-gray-600 dark:text-gray-300 hover:bg-[#C5A059]/10 hover:text-[#C5A059] transition-all border border-transparent hover:border-[#C5A059]/30"
                                            >
                                                {h}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            
                            <div className="text-center space-y-4 px-10">
                                <div className="w-16 h-16 bg-[#C5A059]/10 rounded-full flex items-center justify-center mx-auto">
                                    <BookOpen className="w-8 h-8 text-[#C5A059]" />
                                </div>
                                <h4 className="font-cinzel font-bold text-gray-400">O que você deseja buscar hoje?</h4>
                                <p className="text-xs text-gray-500 leading-relaxed">
                                    Experimente pesquisar por temas como <span className="text-[#C5A059]">"Fé"</span>, <span className="text-[#C5A059]">"Esperança"</span> ou trechos como <span className="text-[#C5A059]">"O Senhor é meu pastor"</span>.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="py-20 text-center">
                            <p className="text-gray-500 font-cinzel">Pressione Enter para buscar</p>
                        </div>
                    )}
                </div>

                {/* Footer Tip */}
                <div className="p-4 bg-gray-50 dark:bg-black/40 border-t border-gray-200 dark:border-white/10 flex justify-between items-center">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em]">
                        Buscador Inteligente Magnum Opus v1.0
                    </p>
                    <button 
                        onClick={onClose}
                        className="text-[10px] font-bold uppercase tracking-widest text-[#C5A059] hover:text-red-500 transition-colors flex items-center gap-1"
                    >
                        <X className="w-3 h-3" /> Fechar
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
