import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Book, ChevronRight, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BIBLE_BOOKS, generateChapterKey } from '../../constants';

// --- CATEGORIZAÇÃO DIDÁTICA DA BÍBLIA ---
const BIBLE_CATEGORIES = [
    {
        id: 'ot_law',
        name: 'Pentateuco (Lei)',
        color: 'text-blue-600 dark:text-blue-400',
        books: ['Gênesis', 'Êxodo', 'Levítico', 'Números', 'Deuteronômio']
    },
    {
        id: 'ot_history',
        name: 'Históricos (AT)',
        color: 'text-green-600 dark:text-green-400',
        books: ['Josué', 'Juízes', 'Rute', '1 Samuel', '2 Samuel', '1 Reis', '2 Reis', '1 Crônicas', '2 Crônicas', 'Esdras', 'Neemias', 'Ester']
    },
    {
        id: 'ot_poetry',
        name: 'Poéticos & Sabedoria',
        color: 'text-purple-600 dark:text-purple-400',
        books: ['Jó', 'Salmos', 'Provérbios', 'Eclesiastes', 'Cantares']
    },
    {
        id: 'ot_prophets',
        name: 'Profetas',
        color: 'text-orange-600 dark:text-orange-400',
        books: ['Isaías', 'Jeremias', 'Lamentações', 'Ezequiel', 'Daniel', 'Oséias', 'Joel', 'Amós', 'Obadias', 'Jonas', 'Miquéias', 'Naum', 'Habacuque', 'Sofonias', 'Ageu', 'Zacarias', 'Malaquias']
    },
    {
        id: 'nt_gospels',
        name: 'Evangelhos & Atos',
        color: 'text-red-600 dark:text-red-400',
        books: ['Mateus', 'Marcos', 'Lucas', 'João', 'Atos']
    },
    {
        id: 'nt_paul',
        name: 'Cartas de Paulo',
        color: 'text-indigo-600 dark:text-indigo-400',
        books: ['Romanos', '1 Coríntios', '2 Coríntios', 'Gálatas', 'Efésios', 'Filipenses', 'Colossenses', '1 Tessalonicenses', '2 Tessalonicenses', '1 Timóteo', '2 Timóteo', 'Tito', 'Filemom']
    },
    {
        id: 'nt_general',
        name: 'Cartas Gerais & Revelação',
        color: 'text-teal-600 dark:text-teal-400',
        books: ['Hebreus', 'Tiago', '1 Pedro', '2 Pedro', '1 João', '2 João', '3 João', 'Judas', 'Apocalipse']
    }
];

export const PremiumNavigator = ({ isOpen, onClose, currentBook, onSelect, userProgress }: any) => {
    const [selectedBook, setSelectedBook] = useState<string>(currentBook);
    const [searchTerm, setSearchTerm] = useState('');

    // Rola para o livro selecionado ao abrir
    const bookListRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (isOpen) {
            setSelectedBook(currentBook);
            setSearchTerm('');
        }
    }, [isOpen, currentBook]);

    const activeBookData = BIBLE_BOOKS.find(b => b.name === selectedBook);
    
    // Filtragem de busca
    const filteredCategories = searchTerm.trim() === '' 
        ? BIBLE_CATEGORIES 
        : BIBLE_CATEGORIES.map(cat => ({
            ...cat,
            books: cat.books.filter(b => b.toLowerCase().includes(searchTerm.toLowerCase()))
          })).filter(cat => cat.books.length > 0);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-6 bg-black/90 animate-in fade-in duration-300">
                <motion.div 
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 20 }}
                    className="bg-[#FDFBF7] dark:bg-[#121212] w-full md:w-[90%] md:max-w-5xl h-full md:h-[85vh] md:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-[#C5A059]/30"
                >
                    {/* Header Luxuoso - CORREÇÃO iOS SAFE AREA */}
                    <div className="bg-[#1a0f0f] text-white p-5 pt-[calc(env(safe-area-inset-top)+1.25rem)] md:pt-5 flex items-center justify-between shrink-0 border-b border-[#C5A059]/50 relative overflow-hidden">
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                        <div className="relative z-10 flex flex-col">
                            <h2 className="font-cinzel font-bold text-xl md:text-2xl tracking-widest text-[#C5A059]">NAVEGAÇÃO BÍBLICA</h2>
                            <p className="font-montserrat text-[10px] text-gray-400 uppercase tracking-[0.3em]">Selecione Livro & Capítulo</p>
                        </div>
                        <button onClick={onClose} className="relative z-10 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-all active:scale-95 border border-white/10">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="flex flex-col md:flex-row h-full overflow-hidden">
                        {/* COLUNA ESQUERDA: LISTA DE LIVROS (Com Busca e Categorias) */}
                        <div className="w-full md:w-1/3 border-r border-[#C5A059]/20 bg-[#F5F5DC]/50 dark:bg-black/20 flex flex-col h-[50vh] md:h-full">
                            {/* Barra de Busca */}
                            <div className="p-4 border-b border-[#C5A059]/10 bg-white dark:bg-[#1E1E1E]">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input 
                                        type="text" 
                                        placeholder="Buscar livro..." 
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        className="w-full pl-10 pr-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm font-montserrat focus:ring-2 focus:ring-[#C5A059] focus:bg-white dark:focus:bg-gray-900 transition-all outline-none dark:text-white"
                                    />
                                </div>
                            </div>

                            {/* Lista Categorizada */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide" ref={bookListRef}>
                                {filteredCategories.map((cat) => (
                                    <div key={cat.id} className="animate-in slide-in-from-left-5 duration-500">
                                        <h3 className={`font-cinzel font-bold text-xs uppercase tracking-widest mb-3 pl-2 border-l-2 ${cat.color.replace('text', 'border')} ${cat.color} opacity-80`}>
                                            {cat.name}
                                        </h3>
                                        <div className="space-y-1">
                                            {cat.books.map(bookName => {
                                                const isActive = selectedBook === bookName;
                                                return (
                                                    <button
                                                        key={bookName}
                                                        onClick={() => setSelectedBook(bookName)}
                                                        className={`w-full text-left px-4 py-3 rounded-xl transition-all duration-300 flex items-center justify-between group ${
                                                            isActive 
                                                            ? 'bg-gradient-to-r from-[#C5A059] to-[#9e8045] text-white shadow-lg shadow-[#C5A059]/30 transform scale-[1.02]' 
                                                            : 'hover:bg-white dark:hover:bg-white/5 text-gray-700 dark:text-gray-300'
                                                        }`}
                                                    >
                                                        <span className={`font-montserrat font-bold text-sm ${isActive ? 'text-white' : ''}`}>
                                                            {bookName}
                                                        </span>
                                                        {isActive && <ChevronRight className="w-4 h-4" />}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                ))}
                                {filteredCategories.length === 0 && (
                                    <div className="text-center py-10 text-gray-400">
                                        <Book className="w-10 h-10 mx-auto mb-2 opacity-30"/>
                                        <p>Livro não encontrado</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* COLUNA DIREITA: CAPÍTULOS (Visual Premium) */}
                        <div className="w-full md:w-2/3 bg-white dark:bg-[#1E1E1E] flex flex-col h-[50vh] md:h-full relative">
                             {/* Título do Livro Selecionado */}
                             <div className="p-6 md:p-8 text-center border-b border-[#C5A059]/10 bg-gradient-to-b from-[#FDFBF7] to-white dark:from-[#1E1E1E] dark:to-[#151515]">
                                <motion.div 
                                    key={selectedBook}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="inline-block"
                                >
                                    <h2 className="font-cinzel text-3xl md:text-5xl font-bold text-[#8B0000] dark:text-[#ff6b6b] mb-1">
                                        {selectedBook}
                                    </h2>
                                    <div className="flex items-center justify-center gap-2 opacity-60">
                                        <div className="h-[1px] w-8 bg-[#C5A059]"></div>
                                        <p className="font-montserrat text-xs uppercase tracking-[0.3em] text-[#C5A059]">
                                            {activeBookData?.chapters} Capítulos
                                        </p>
                                        <div className="h-[1px] w-8 bg-[#C5A059]"></div>
                                    </div>
                                </motion.div>
                             </div>

                             {/* Grid de Capítulos */}
                             <div className="flex-1 overflow-y-auto p-6 md:p-10 pb-32 md:pb-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed">
                                <motion.div 
                                    key={selectedBook + "_grid"}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.1 }}
                                    className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3 md:gap-4"
                                >
                                    {Array.from({ length: activeBookData?.chapters || 0 }, (_, i) => i + 1).map(chap => {
                                        // Verifica se o capítulo já foi lido
                                        const chapterKey = generateChapterKey(selectedBook, chap);
                                        const isRead = userProgress?.chapters_read?.includes(chapterKey);

                                        return (
                                            <button 
                                                key={chap} 
                                                onClick={() => { onSelect(selectedBook, chap); onClose(); }}
                                                className={`aspect-square rounded-2xl border shadow-sm flex items-center justify-center font-cinzel font-bold text-lg transition-all duration-300 group active:scale-90 relative overflow-hidden
                                                ${isRead 
                                                    ? 'bg-green-600 text-white border-green-500 shadow-green-500/30' 
                                                    : 'bg-white dark:bg-[#2A2A2A] border-[#C5A059]/20 text-gray-700 dark:text-gray-200 hover:shadow-md hover:border-[#8B0000] hover:bg-[#8B0000] hover:text-white dark:hover:bg-[#ff6b6b] dark:hover:border-[#ff6b6b]'
                                                }`}
                                            >
                                                <span className="relative z-10">{chap}</span>
                                                {isRead && <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-20 transition-opacity"></div>}
                                            </button>
                                        );
                                    })}
                                </motion.div>
                             </div>

                             {/* Botão Flutuante 'Ler Capítulo 1' se não quiser escolher */}
                             <div className="absolute bottom-6 right-6 md:hidden">
                                <button 
                                    onClick={() => { onSelect(selectedBook, 1); onClose(); }}
                                    className="bg-[#8B0000] text-white p-4 rounded-full shadow-xl flex items-center gap-2 font-bold animate-bounce"
                                >
                                    <Play className="w-5 h-5 fill-current" />
                                </button>
                             </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
