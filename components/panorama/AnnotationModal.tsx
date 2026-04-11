import React, { useState } from 'react';
import { X, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AnnotationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (content: string) => void;
    initialContent: string;
}

export const AnnotationModal: React.FC<AnnotationModalProps> = ({ isOpen, onClose, onSave, initialContent }) => {
    const [content, setContent] = useState(initialContent);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            >
                <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }} 
                    animate={{ scale: 1, opacity: 1 }} 
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-white dark:bg-dark-card rounded-3xl p-6 w-full max-w-lg shadow-2xl border border-gray-100 dark:border-gray-800"
                >
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-cinzel font-black text-[#8B0000] dark:text-[#ff6b6b] uppercase tracking-widest">Anotação do Admin</h3>
                        <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-black/20 rounded-full"><X className="w-5 h-5" /></button>
                    </div>
                    <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        className="w-full h-64 p-4 bg-gray-50 dark:bg-dark-bg rounded-2xl border-2 border-gray-200 dark:border-gray-700 focus:border-[#8B0000] outline-none mb-6"
                        placeholder="Escreva sua anotação, aplicação ou ilustração aqui..."
                    />
                    <button 
                        onClick={() => { onSave(content); onClose(); }}
                        className="w-full py-4 bg-[#8B0000] text-white font-bold rounded-2xl flex items-center justify-center gap-2 hover:bg-[#a00000] transition-all"
                    >
                        <Save className="w-5 h-5" /> Salvar Anotação
                    </button>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
