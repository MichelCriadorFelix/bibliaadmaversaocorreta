import React, { useEffect, useState } from 'react';
import { Sparkles, Plus, Edit, PenLine } from 'lucide-react';
import { db } from '../../services/database';
import { AnnotationModal } from './AnnotationModal';

interface EbdContentRendererProps {
    pages: string[];
    currentPage: number;
    fontSize: number;
    isPlaying: boolean;
    currentGlobalIndex: number;
    globalSentences: any[];
    parseInline: (t: string) => React.ReactNode;
    isAdmin: boolean;
    studyKey: string;
}

export const EbdContentRenderer: React.FC<EbdContentRendererProps> = ({
    pages,
    currentPage,
    fontSize,
    isPlaying,
    currentGlobalIndex,
    globalSentences,
    parseInline,
    isAdmin,
    studyKey
}) => {
    const [annotations, setAnnotations] = useState<any[]>([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [activeParagraph, setActiveParagraph] = useState<number | null>(null);

    // HIGHLIGHTS MANAGEMENT
    const [highlights, setHighlights] = useState<any[]>([]);
    const [showHighlightButton, setShowHighlightButton] = useState(false);
    const [buttonPosition, setButtonPosition] = useState({ top: 0, left: 0 });
    const [selectedText, setSelectedText] = useState("");

    useEffect(() => {
        const loadAnnotations = async () => {
            try {
                // Use filter instead of list for better performance and to avoid 1000 items limit issues
                const filtered = await db.entities.Commentary.filter({ 
                    study_key: studyKey, 
                    type: 'annotation' 
                });
                setAnnotations(filtered);
            } catch (error) {
                console.error("Error loading annotations:", error);
            }
        };
        const loadHighlights = async () => {
            if (!isAdmin) return;
            try {
                const filtered = await db.entities.Highlights.filter({ study_key: studyKey });
                setHighlights(filtered || []);
            } catch (error) {
                console.error("Error loading highlights:", error);
            }
        };
        loadAnnotations();
        loadHighlights();
    }, [studyKey, isAdmin]);

    const handleCreateHighlight = async () => {
        if (!selectedText || !isAdmin) return;
        const highlightId = `highlight_${studyKey}_${Date.now()}`;
        const userEmail = 'michel.felix@adma.local';
        
        try {
            await db.entities.Highlights.save({
                id: highlightId,
                study_key: studyKey,
                text: selectedText,
                user_email: userEmail,
                created_at: new Date().toISOString()
            });
            
            // Refresh local state immediately
            const filtered = await db.entities.Highlights.filter({ study_key: studyKey });
            setHighlights(filtered || []);
            
            // Clear selection browser-side
            window.getSelection()?.removeAllRanges();
            setShowHighlightButton(false);
            setSelectedText("");
        } catch (error) {
            console.error("Error saving highlight:", error);
        }
    };

    const handleRemoveHighlight = async (id: string) => {
        if (!isAdmin) return;
        if (window.confirm("Deseja remover este destaque em amarelo?")) {
            try {
                await db.entities.Highlights.delete(id);
                // Refresh local state immediately
                const filtered = await db.entities.Highlights.filter({ study_key: studyKey });
                setHighlights(filtered || []);
            } catch (error) {
                console.error("Error deleting highlight:", error);
            }
        }
    };

    const handleSaveAnnotation = async (content: string) => {
        if (activeParagraph === null) return;
        const userEmail = 'michel.felix@adma.local';
        const annotationId = `annotation_${studyKey}_${activeParagraph}`;

        try {
            await db.entities.Commentary.save({ 
                id: annotationId,
                study_key: studyKey, 
                paragraph_index: Number(activeParagraph),
                content, 
                type: 'annotation',
                user_email: userEmail,
                updated_at: new Date().toISOString()
            });

            // Refresh local state immediately
            const filtered = await db.entities.Commentary.filter({ 
                study_key: studyKey, 
                type: 'annotation' 
            });
            setAnnotations(filtered);
            setModalOpen(false);
        } catch (error) {
            console.error("Error saving annotation:", error);
        }
    };

    const handleMouseUpOrTouchEnd = () => {
        if (!isAdmin) return;
        // Delay slight to ensure selection object is stable
        setTimeout(() => {
            const selection = window.getSelection();
            if (!selection) {
                setShowHighlightButton(false);
                return;
            }
            const text = selection.toString().trim();
            if (text.length > 0) {
                try {
                    const range = selection.getRangeAt(0);
                    const rect = range.getBoundingClientRect();
                    // Position highlight button just above the center of selected text
                    setButtonPosition({
                        top: rect.top + window.scrollY - 45,
                        left: rect.left + window.scrollX + (rect.width / 2) - 40
                    });
                    setSelectedText(text);
                    setShowHighlightButton(true);
                } catch (e) {
                    setShowHighlightButton(false);
                }
            } else {
                setShowHighlightButton(false);
            }
        }, 100);
    };

    // Recursive React Tree Walker mapper to highlight matches inside text nodes
    const highlightTree = (node: React.ReactNode, activeHighlights: any[], onRemoveHighlight: (id: string) => void): React.ReactNode => {
        if (!activeHighlights || activeHighlights.length === 0 || !isAdmin) return node;

        if (typeof node === 'string') {
            // Sort matches descending by length to tackle longest sub-strings first
            const sortedHighlights = [...activeHighlights].sort((a, b) => b.text.length - a.text.length);
            let parts: React.ReactNode[] = [node];

            for (const highlight of sortedHighlights) {
                const hText = highlight.text;
                if (!hText) continue;

                const nextParts: React.ReactNode[] = [];
                for (const part of parts) {
                    if (typeof part === 'string') {
                        let currentStr = part;
                        while (true) {
                            const matchIndex = currentStr.indexOf(hText);
                            if (matchIndex === -1) {
                                if (currentStr) nextParts.push(currentStr);
                                break;
                            }
                            if (matchIndex > 0) {
                                nextParts.push(currentStr.substring(0, matchIndex));
                            }
                            nextParts.push(
                                <mark 
                                    key={`hl-${highlight.id}-${matchIndex}-${Date.now()}`} 
                                    className="bg-yellow-300 dark:bg-yellow-600/70 text-[#1a1a1a] dark:text-white px-1 py-0.5 rounded cursor-pointer select-all font-semibold transition-all hover:bg-yellow-400 active:scale-95"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRemoveHighlight(highlight.id);
                                    }}
                                    title="Remover Destaque em Amarelo (Admin)"
                                >
                                    {hText}
                                </mark>
                            );
                            currentStr = currentStr.substring(matchIndex + hText.length);
                        }
                    } else {
                        nextParts.push(part);
                    }
                }
                parts = nextParts;
            }
            return <>{parts}</>;
        }

        if (React.isValidElement(node)) {
            const element = node as React.ReactElement<any>;
            if (element.props && element.props.children) {
                const children = element.props.children;
                let updatedChildren;
                if (Array.isArray(children)) {
                    updatedChildren = React.Children.map(children, child => highlightTree(child, activeHighlights, onRemoveHighlight));
                } else {
                    updatedChildren = highlightTree(children, activeHighlights, onRemoveHighlight);
                }
                return React.cloneElement(element, { ...element.props }, updatedChildren);
            }
        }

        if (Array.isArray(node)) {
            return node.map((child, idx) => (
                <React.Fragment key={idx}>
                    {highlightTree(child, activeHighlights, onRemoveHighlight)}
                </React.Fragment>
            ));
        }

        return node;
    };

    // Identifica o bloco ativo para highlight
    const activeBlockIndex = isPlaying && globalSentences[currentGlobalIndex]?.pageIndex === currentPage 
        ? globalSentences[currentGlobalIndex]?.blockIndex 
        : -1;

    useEffect(() => {
        if (activeBlockIndex !== -1) {
            const el = document.getElementById(`read-block-${activeBlockIndex}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [activeBlockIndex]);

    if (pages.length === 0) return null;

    const text = pages[currentPage];
    if (!text) return null;

    const lines = text.split('\n').filter(b => b.trim().length > 0);

    return (
        <div 
            className="space-y-8 md:space-y-12 animate-in fade-in duration-1000 relative select-text"
            onMouseUp={handleMouseUpOrTouchEnd}
            onTouchEnd={handleMouseUpOrTouchEnd}
        >
            <AnnotationModal 
                isOpen={modalOpen} 
                onClose={() => setModalOpen(false)} 
                onSave={handleSaveAnnotation} 
                initialContent={annotations.find(a => Number(a.paragraph_index) === activeParagraph)?.content || ''}
                key={`modal-${activeParagraph}-${annotations.length}`}
            />

            {/* Floating Highlighter Buttons for Admin */}
            {showHighlightButton && (
                <button
                    style={{
                        position: 'absolute',
                        top: `${buttonPosition.top}px`,
                        left: `${buttonPosition.left}px`,
                        zIndex: 1000,
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        handleCreateHighlight();
                    }}
                    className="flex items-center gap-2 bg-[#C5A059] hover:bg-[#8B0000] text-white px-4 py-2 rounded-full shadow-2xl text-xs font-bold font-cinzel tracking-wider animate-in fade-in zoom-in-95 duration-200 border border-white/20 hover:scale-105 active:scale-95 transition-all"
                >
                    <PenLine className="w-4 h-4 text-white" />
                    Destacar Texto
                </button>
            )}

            {lines.map((line, idx) => {
                const tr = line.trim();
                const isBlockActive = idx === activeBlockIndex;
                const activeClass = isBlockActive ? "bg-yellow-100/50 dark:bg-yellow-900/20 rounded-xl px-2 -mx-2 transition-colors duration-300 shadow-[0_0_15px_rgba(197,160,89,0.1)]" : "transition-colors duration-300";

                const annotation = annotations.find(a => a.paragraph_index === idx);

                const renderAnnotationButton = () => {
                    if (!isAdmin) return null;
                    return (
                        <button 
                            onClick={(e) => { e.stopPropagation(); setActiveParagraph(idx); setModalOpen(true); }}
                            className={`ml-2 p-1 rounded-full transition-all ${annotation ? 'bg-[#C5A059] text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 hover:bg-[#8B0000] hover:text-white'}`}
                            title={annotation ? "Editar Anotação" : "Adicionar Anotação"}
                        >
                            {annotation ? <Edit className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                        </button>
                    );
                };

                if (tr === '__CONTINUATION_MARKER__') return <div key={idx} id={`read-block-${idx}`} className="my-12 border-b border-[#C5A059]/20" />;
                
                // HEADER DE DOSSIÊ ESPECIAL
                if (tr.toUpperCase().includes('DOSSIÊ ESPECIAL') && (tr.startsWith('#') || tr.startsWith('##'))) {
                     const cleanTitle = tr.replace(/#/g, '').trim();
                     return (
                        <div key={idx} id={`read-block-${idx}`} className={`my-16 text-center relative py-12 px-3 md:px-4 border-y-4 border-double border-[#8B0000] ${activeClass}`}>
                            <div className="absolute inset-0 bg-[#8B0000]/5 -z-10"></div>
                            <span className="block font-cinzel font-black text-[#C5A059] text-sm uppercase tracking-[0.5em] mb-4">Documento Histórico</span>
                            <h1 className="font-cinzel font-black text-4xl md:text-6xl text-[#8B0000] dark:text-[#ff6b6b] uppercase tracking-widest leading-tight drop-shadow-xl">
                                {highlightTree(parseInline(cleanTitle), highlights, handleRemoveHighlight)}
                            </h1>
                        </div>
                     );
                }

                const isMainTitle = tr.startsWith('# ') || 
                                    tr.toUpperCase().startsWith('PANORÂMA BÍBLICO') || 
                                    tr.toUpperCase().startsWith('PANORAMA BÍBLICO');

                if (isMainTitle) {
                    const cleanTitle = tr.replace(/#/g, '').trim();
                    return (
                        <div key={idx} id={`read-block-${idx}`} className={`mb-14 text-center border-b-8 border-[#8B0000] pb-8 pt-4 bg-gradient-to-b from-transparent to-[#8B0000]/5 rounded-b-[3rem] ${activeClass}`}>
                            <h1 className="font-cinzel font-black text-4xl md:text-6xl text-[#8B0000] dark:text-[#ff6b6b] uppercase tracking-widest leading-tight drop-shadow-xl">
                                {highlightTree(parseInline(cleanTitle), highlights, handleRemoveHighlight)}
                            </h1>
                        </div>
                    );
                }

                const isH3 = tr.startsWith('###');
                if (isH3) {
                    const title = tr.replace(/###/g, '').trim();
                    const isPremium = title.toUpperCase().includes('TIPOLOGIA') || 
                                     title.toUpperCase().includes('CURIOSIDADES') || 
                                     title.toUpperCase().includes('ARQUEOLOGIA');
                    
                    if (isPremium) {
                        return (
                            <div key={idx} id={`read-block-${idx}`} className={`mt-10 mb-6 ${activeClass}`}>
                                <div className="w-full bg-gradient-to-br from-[#C5A059] to-[#9e8045] px-6 py-3 rounded-lg shadow-md">
                                    <h3 className="font-cinzel font-black text-base md:text-lg text-[#1a1a1a] uppercase tracking-[0.15em] leading-tight">
                                        {highlightTree(parseInline(title), highlights, handleRemoveHighlight)}
                                    </h3>
                                </div>
                            </div>
                        );
                    }

                    return (
                        <div key={idx} id={`read-block-${idx}`} className={`mt-16 mb-8 text-center relative ${activeClass}`}>
                            <div className="absolute top-1/2 left-0 w-full h-[1px] bg-[#C5A059]/30 -z-10"></div>
                            <h3 className="inline-block bg-[#FDFBF7] dark:bg-dark-card px-4 md:px-6 font-cinzel font-bold text-xl md:text-2xl uppercase tracking-widest text-[#C5A059] leading-tight">
                                {highlightTree(parseInline(title), highlights, handleRemoveHighlight)}
                            </h3>
                        </div>
                    );
                }

                const isH2 = tr.startsWith('##');
                if (isH2) {
                    const title = tr.replace(/##/g, '').trim();
                    return (
                        <h2 key={idx} id={`read-block-${idx}`} className={`font-cinzel font-black text-3xl md:text-4xl text-[#8B0000] dark:text-[#ff6b6b] mt-16 mb-8 uppercase tracking-widest border-l-[6px] border-[#C5A059] pl-4 md:pl-6 leading-tight ${activeClass}`}>
                            {highlightTree(parseInline(title), highlights, handleRemoveHighlight)}
                        </h2>
                    );
                }

                if (tr.toUpperCase().includes('PÉROLA DE OURO')) {
                    const parts = tr.split(/(\*\*PÉROLA DE OURO:\*\*|\*\*PÉROLA DE OURO\*\*|PÉROLA DE OURO:|PÉROLA DE OURO)/i);
                    return (
                        <div key={idx} id={`read-block-${idx}`} className={`mb-6 md:mb-8 ${activeClass}`}>
                            {parts.map((p, i) => {
                                if (!p) return null;
                                if (p.toUpperCase().match(/PÉROLA DE OURO/)) {
                                    return (
                                        <div key={i} className="text-[#000000] bg-gradient-to-br from-[#C5A059] to-[#9e8045] px-4 py-3 md:px-6 md:py-4 rounded-xl border-l-[6px] border-[#8B0000] shadow-lg font-black my-4 tracking-wider uppercase text-sm md:text-base">
                                            {p.replace(/\*\*/g, '').trim()}
                                        </div>
                                    );
                                }
                                return (
                                    <div key={i} className="text-gray-800 dark:text-gray-300 text-lg md:text-xl leading-relaxed text-justify mt-2">
                                        {highlightTree(parseInline(p), highlights, handleRemoveHighlight)}
                                    </div>
                                );
                            })}
                        </div>
                    );
                }

                if (/^\d+\./.test(tr)) {
                    const firstSpaceIndex = tr.indexOf(' ');
                    const numPart = tr.substring(0, firstSpaceIndex).replace('.', '');
                    const contentPart = tr.substring(firstSpaceIndex + 1).trim();
                    
                    return (
                        <div key={idx} id={`read-block-${idx}`} className={`mb-10 flex gap-4 md:gap-6 items-start animate-in slide-in-from-left-6 group ${activeClass}`}>
                            <span className="font-cinzel font-black text-6xl text-[#C5A059] opacity-80 shrink-0 select-none drop-shadow-sm leading-none -mt-1 group-hover:text-[#8B0000] transition-colors duration-500">{numPart}</span>
                            <div className="flex-1 pt-1">
                                <div className="font-cormorant text-xl md:text-2xl leading-relaxed text-gray-900 dark:text-gray-100 text-justify tracking-wide font-medium" style={{ fontSize: `${fontSize}px`, lineHeight: '1.8' }}>
                                    {highlightTree(parseInline(contentPart), highlights, handleRemoveHighlight)}
                                </div>
                            </div>
                        </div>
                    );
                }

                return (
                    <div key={idx} id={`read-block-${idx}`} className={`font-cormorant text-xl md:text-2xl leading-loose text-gray-950 dark:text-gray-50 text-justify indent-6 md:indent-12 mb-8 tracking-wide font-medium ${activeClass}`} style={{ fontSize: `${fontSize}px`, lineHeight: '1.8' }}>
                        {renderAnnotationButton()}
                        {highlightTree(parseInline(tr), highlights, handleRemoveHighlight)}
                    </div>
                );
            })}
        </div>
    );
};
