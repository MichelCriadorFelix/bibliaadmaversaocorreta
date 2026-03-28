import React from 'react';
import { Sparkles, Loader2, Info, FileText, Settings, Zap, Trash2, Edit, Save, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface PanoramaAdminPanelProps {
    isAdmin: boolean;
    isGenerating: boolean;
    theologicalDensity: number;
    validationPhase: string;
    validationLog: string[];
    customInstructions: string;
    setCustomInstructions: (val: string) => void;
    showInstructions: boolean;
    setShowInstructions: (val: boolean) => void;
    handleGenerate: () => void;
    adminPanelExpanded: boolean;
    setAdminPanelExpanded: (val: boolean) => void;
    isEditing: boolean;
    setIsEditing: (val: boolean) => void;
    editValue: string;
    setEditValue: (val: string) => void;
    handleSaveEdit: () => void;
    handleDelete: () => void;
    generationTime: number;
    currentStatusIndex: number;
    loadingStatusMessages: string[];
}

export const PanoramaAdminPanel: React.FC<PanoramaAdminPanelProps> = ({
    isAdmin,
    isGenerating,
    theologicalDensity,
    validationPhase,
    validationLog,
    customInstructions,
    setCustomInstructions,
    showInstructions,
    setShowInstructions,
    handleGenerate,
    adminPanelExpanded,
    setAdminPanelExpanded,
    isEditing,
    setIsEditing,
    editValue,
    setEditValue,
    handleSaveEdit,
    handleDelete,
    generationTime,
    currentStatusIndex,
    loadingStatusMessages
}) => {
    if (!isAdmin) return null;

    return (
        <div className="mb-12 bg-white dark:bg-dark-card rounded-[2.5rem] border-4 border-[#C5A059]/30 overflow-hidden shadow-2xl relative">
            <div className="bg-gradient-to-r from-[#8B0000] to-[#600018] p-6 flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/20">
                        <Sparkles className="w-6 h-6 text-[#C5A059] animate-pulse" />
                    </div>
                    <div>
                        <h3 className="font-cinzel font-black text-white text-lg tracking-widest">Painel de Controle Magnum Opus</h3>
                        <p className="text-[10px] text-[#C5A059] font-bold uppercase tracking-[0.3em]">Protocolo de Geração v116.0</p>
                    </div>
                </div>
                <button 
                    onClick={() => setAdminPanelExpanded(!adminPanelExpanded)}
                    className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-all"
                >
                    <Settings className={`w-5 h-5 transition-transform duration-500 ${adminPanelExpanded ? 'rotate-180' : ''}`} />
                </button>
            </div>

            <AnimatePresence>
                {adminPanelExpanded && (
                    <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="p-8 space-y-8"
                    >
                        {/* Ações Rápidas */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <button 
                                onClick={() => setIsEditing(!isEditing)}
                                className={`flex items-center justify-center gap-3 p-4 rounded-2xl font-bold uppercase tracking-widest text-xs transition-all ${isEditing ? 'bg-[#8B0000] text-white' : 'bg-gray-100 dark:bg-black/20 text-gray-600 hover:bg-gray-200'}`}
                            >
                                {isEditing ? <X className="w-4 h-4" /> : <Edit className="w-4 h-4" />}
                                {isEditing ? 'Cancelar Edição' : 'Editar Manuscrito'}
                            </button>
                            
                            {isEditing && (
                                <button 
                                    onClick={handleSaveEdit}
                                    className="flex items-center justify-center gap-3 p-4 bg-green-600 text-white rounded-2xl font-bold uppercase tracking-widest text-xs hover:bg-green-700 transition-all"
                                >
                                    <Save className="w-4 h-4" /> Salvar Alterações
                                </button>
                            )}

                            <button 
                                onClick={handleDelete}
                                className="flex items-center justify-center gap-3 p-4 bg-red-100 dark:bg-red-900/20 text-red-600 rounded-2xl font-bold uppercase tracking-widest text-xs hover:bg-red-600 hover:text-white transition-all"
                            >
                                <Trash2 className="w-4 h-4" /> Apagar do Acervo
                            </button>
                        </div>

                        {/* Motor de Geração */}
                        <div className="bg-gray-50 dark:bg-black/20 p-6 rounded-3xl border-2 border-dashed border-[#C5A059]/30">
                            <div className="flex flex-col md:flex-row gap-6 items-center">
                                <div className="flex-1 w-full">
                                    <div className="flex justify-between items-end mb-4">
                                        <label className="text-[10px] font-black text-[#8B0000] uppercase tracking-widest flex items-center gap-2">
                                            <Zap className="w-3 h-3" /> Instruções Customizadas (Opcional)
                                        </label>
                                        <button 
                                            onClick={() => setShowInstructions(!showInstructions)}
                                            className="text-[10px] font-bold text-[#C5A059] hover:underline"
                                        >
                                            {showInstructions ? 'Ocultar' : 'Ver Dicas'}
                                        </button>
                                    </div>
                                    <textarea 
                                        value={customInstructions}
                                        onChange={(e) => setCustomInstructions(e.target.value)}
                                        placeholder="Ex: Foque na arqueologia do local... Use tom mais acadêmico... Explique o contexto de Josefo..."
                                        className="w-full bg-white dark:bg-black/40 border-2 border-gray-200 dark:border-gray-800 rounded-2xl p-4 text-sm focus:border-[#C5A059] outline-none transition-all min-h-[100px]"
                                    />
                                </div>
                                
                                <button 
                                    onClick={handleGenerate}
                                    disabled={isGenerating}
                                    className="w-full md:w-auto px-12 py-6 bg-gradient-to-br from-[#C5A059] to-[#9e8045] text-black font-black rounded-3xl shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex flex-col items-center gap-2"
                                >
                                    {isGenerating ? <Loader2 className="w-8 h-8 animate-spin" /> : <Sparkles className="w-8 h-8" />}
                                    <span className="text-xs uppercase tracking-widest">{isGenerating ? 'Processando...' : 'Gerar Magnum Opus'}</span>
                                </button>
                            </div>
                        </div>

                        {/* Status de Geração */}
                        {isGenerating && (
                            <div className="space-y-6 animate-in fade-in zoom-in duration-500">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black text-[#C5A059] uppercase tracking-[0.3em]">Densidade Teológica</span>
                                    <span className="text-xl font-black text-[#8B0000]">{Math.floor(theologicalDensity)}%</span>
                                </div>
                                <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden p-1 border border-gray-300 dark:border-gray-700">
                                    <motion.div 
                                        className="h-full bg-gradient-to-r from-[#8B0000] via-[#C5A059] to-[#8B0000] rounded-full"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${theologicalDensity}%` }}
                                    />
                                </div>
                                <div className="bg-black/5 dark:bg-white/5 p-4 rounded-2xl border border-black/10 dark:border-white/10">
                                    <p className="text-xs font-mono text-gray-500 animate-pulse flex items-center gap-3">
                                        <span className="w-2 h-2 bg-[#C5A059] rounded-full"></span>
                                        {loadingStatusMessages[currentStatusIndex]}
                                    </p>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
