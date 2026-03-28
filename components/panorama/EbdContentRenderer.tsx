import React, { useEffect } from 'react';
import { Sparkles } from 'lucide-react';

interface EbdContentRendererProps {
    pages: string[];
    currentPage: number;
    fontSize: number;
    isPlaying: boolean;
    currentGlobalIndex: number;
    globalSentences: any[];
    parseInline: (t: string) => React.ReactNode;
}

export const EbdContentRenderer: React.FC<EbdContentRendererProps> = ({
    pages,
    currentPage,
    fontSize,
    isPlaying,
    currentGlobalIndex,
    globalSentences,
    parseInline
}) => {
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
        <div className="space-y-8 md:space-y-12 animate-in fade-in duration-1000">
            {lines.map((line, idx) => {
                const tr = line.trim();
                const isBlockActive = idx === activeBlockIndex;
                const activeClass = isBlockActive ? "bg-yellow-100/50 dark:bg-yellow-900/20 rounded-xl px-2 -mx-2 transition-colors duration-300 shadow-[0_0_15px_rgba(197,160,89,0.1)]" : "transition-colors duration-300";

                if (tr === '__CONTINUATION_MARKER__') return <div key={idx} id={`read-block-${idx}`} className="my-12 border-b border-[#C5A059]/20" />;
                
                // HEADER DE DOSSIÊ ESPECIAL
                if (tr.toUpperCase().includes('DOSSIÊ ESPECIAL') && (tr.startsWith('#') || tr.startsWith('##'))) {
                     const cleanTitle = tr.replace(/#/g, '').trim();
                     return (
                        <div key={idx} id={`read-block-${idx}`} className={`my-16 text-center relative py-12 px-3 md:px-4 border-y-4 border-double border-[#8B0000] ${activeClass}`}>
                            <div className="absolute inset-0 bg-[#8B0000]/5 -z-10"></div>
                            <span className="block font-cinzel font-black text-[#C5A059] text-sm uppercase tracking-[0.5em] mb-4">Documento Histórico</span>
                            <h1 className="font-cinzel font-black text-4xl md:text-6xl text-[#8B0000] dark:text-[#ff6b6b] uppercase tracking-widest leading-tight drop-shadow-xl">
                                {parseInline(cleanTitle)}
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
                                {parseInline(cleanTitle)}
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
                                        {parseInline(title)}
                                    </h3>
                                </div>
                            </div>
                        );
                    }

                    return (
                        <div key={idx} id={`read-block-${idx}`} className={`mt-16 mb-8 text-center relative ${activeClass}`}>
                            <div className="absolute top-1/2 left-0 w-full h-[1px] bg-[#C5A059]/30 -z-10"></div>
                            <h3 className="inline-block bg-[#FDFBF7] dark:bg-dark-card px-4 md:px-6 font-cinzel font-bold text-xl md:text-2xl uppercase tracking-widest text-[#C5A059] leading-tight">
                                {parseInline(title)}
                            </h3>
                        </div>
                    );
                }

                const isH2 = tr.startsWith('##');
                if (isH2) {
                    const title = tr.replace(/##/g, '').trim();
                    return (
                        <h2 key={idx} id={`read-block-${idx}`} className={`font-cinzel font-black text-3xl md:text-4xl text-[#8B0000] dark:text-[#ff6b6b] mt-16 mb-8 uppercase tracking-widest border-l-[6px] border-[#C5A059] pl-4 md:pl-6 leading-tight ${activeClass}`}>
                            {parseInline(title)}
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
                                        {parseInline(p)}
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
                                <div className="font-cormorant text-xl md:text-2xl leading-relaxed text-gray-900 dark:text-gray-100 text-justify tracking-wide font-medium" style={{ fontSize: `${fontSize}px`, lineHeight: '1.8' }}>{parseInline(contentPart)}</div>
                            </div>
                        </div>
                    );
                }

                return (
                    <div key={idx} id={`read-block-${idx}`} className={`font-cormorant text-xl md:text-2xl leading-loose text-gray-950 dark:text-gray-50 text-justify indent-6 md:indent-12 mb-8 tracking-wide font-medium ${activeClass}`} style={{ fontSize: `${fontSize}px`, lineHeight: '1.8' }}>
                        {parseInline(tr)}
                    </div>
                );
            })}
        </div>
    );
};
