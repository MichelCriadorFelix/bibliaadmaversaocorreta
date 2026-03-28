import React, { useState, useEffect, useRef } from 'react';
import { HelpCircle, X } from 'lucide-react';

interface GlossaryTermProps {
    term: string;
    explanation: string;
    children: React.ReactNode;
}

export const GlossaryTerm: React.FC<GlossaryTermProps> = ({ term, explanation, children }) => {
    const [isOpen, setIsOpen] = useState(false);
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
    }, [isOpen]);

    return (
        <span className="relative inline-block">
            <button 
                ref={buttonRef}
                onClick={() => setIsOpen(true)}
                className="text-[#C5A059] dark:text-[#e6c27a] font-bold border-b-2 border-dotted border-[#C5A059] hover:bg-[#C5A059]/10 transition-colors rounded px-1"
                title="Clique para ver o significado"
            >
                {children}
            </button>

            {isOpen && (
                <div 
                    ref={popoverRef}
                    className="absolute z-50 bottom-full left-1/2 mb-2 w-64 md:w-80 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-[#C5A059]/30 p-4 animate-in fade-in slide-in-from-bottom-2"
                    style={{ transform: `translateX(calc(-50% + ${shiftX}px))` }}
                >
                    <div className="flex justify-between items-start mb-3 border-b border-gray-100 dark:border-gray-800 pb-2">
                        <div className="flex items-center gap-2 text-[#C5A059] font-cinzel font-bold">
                            <HelpCircle className="w-4 h-4" />
                            <span className="capitalize">{term}</span>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    
                    <div className="max-h-60 overflow-y-auto no-scrollbar">
                        <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed font-inter">
                            {explanation}
                        </p>
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
