import React from 'react';
import { Sparkles, Loader2, Info, FileText, Settings, Zap, Trash2, Edit, Save, X, RefreshCw, FileDown, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface PanoramaAdminPanelProps {
    isAdmin: boolean;
    isGenerating: boolean;
    theologicalDensity: number;
    validationPhase: string;
    validationLog: string[];
    customInstructions: string;
    setCustomInstructions: (val: string) => void;
    depthLevel: string;
    setDepthLevel: (val: string) => void;
    targetPages: number;
    setTargetPages: (val: number) => void;
    showInstructions: boolean;
    setShowInstructions: (val: boolean) => void;
    handleGenerate: () => void;
    handleUpgrade?: () => void;
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
    book: string;
    activeTab: string;
    bookDownloadStatus: {
        status: 'idle' | 'checking' | 'missing' | 'success';
        missing: number[];
        bookName: string;
        modeLabel: string;
    } | null;
    isCheckingDownload: boolean;
    handleDownloadBook: () => void;
    onNavigate: (view: string, params?: any) => void;
}

export const PanoramaAdminPanel: React.FC<PanoramaAdminPanelProps> = ({
    isAdmin,
    isGenerating,
    theologicalDensity,
    validationPhase,
    validationLog,
    customInstructions,
    setCustomInstructions,
    depthLevel,
    setDepthLevel,
    targetPages,
    setTargetPages,
    showInstructions,
    setShowInstructions,
    handleGenerate,
    handleUpgrade,
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
    loadingStatusMessages,
    book,
    activeTab,
    bookDownloadStatus,
    isCheckingDownload,
    handleDownloadBook,
    onNavigate
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
                            <div className="flex flex-col gap-6 mb-6">
                                <div>
                                    <label className="text-[10px] font-black text-[#8B0000] uppercase tracking-widest flex items-center gap-2 mb-2">
                                        <Zap className="w-3 h-3" /> Nível de Profundidade
                                    </label>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setDepthLevel('padrao')}
                                            className={`flex-1 py-2 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${depthLevel === 'padrao' ? 'bg-[#C5A059] text-black shadow-md' : 'bg-white dark:bg-black/40 text-gray-500 border border-gray-200 dark:border-gray-800 hover:border-[#C5A059]'}`}
                                        >
                                            Padrão
                                        </button>
                                        <button
                                            onClick={() => setDepthLevel('estendido')}
                                            className={`flex-1 py-2 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${depthLevel === 'estendido' ? 'bg-[#C5A059] text-black shadow-md' : 'bg-white dark:bg-black/40 text-gray-500 border border-gray-200 dark:border-gray-800 hover:border-[#C5A059]'}`}
                                        >
                                            Estendido
                                        </button>
                                        <button
                                            onClick={() => setDepthLevel('profundo')}
                                            className={`flex-1 py-2 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${depthLevel === 'profundo' ? 'bg-[#C5A059] text-black shadow-md' : 'bg-white dark:bg-black/40 text-gray-500 border border-gray-200 dark:border-gray-800 hover:border-[#C5A059]'}`}
                                        >
                                            Profundo
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-gray-500 mt-2">
                                        {depthLevel === 'padrao' && 'Foco no essencial, direto ao ponto. Ideal para aulas rápidas.'}
                                        {depthLevel === 'estendido' && 'Mais contexto histórico, referências e explicações detalhadas.'}
                                        {depthLevel === 'profundo' && 'Análise exaustiva. Explora teorias, idiomas originais e debates teológicos. Ideal para capítulos complexos.'}
                                    </p>
                                </div>
                                
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-[10px] font-black text-[#8B0000] uppercase tracking-widest flex items-center gap-2">
                                            <FileText className="w-3 h-3" /> Tamanho da Aula (Páginas)
                                        </label>
                                        <span className="text-xs font-bold text-[#C5A059] bg-[#C5A059]/10 px-2 py-1 rounded-md">
                                            Aprox. {targetPages} {targetPages === 1 ? 'página' : 'páginas'}
                                        </span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="2" 
                                        max="10" 
                                        step="1"
                                        value={targetPages} 
                                        onChange={(e) => setTargetPages(parseInt(e.target.value))}
                                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-[#C5A059]"
                                    />
                                    <div className="relative h-6 mt-1">
                                        <div className="absolute left-0 text-[10px] text-gray-400 font-bold">2</div>
                                        <div className="absolute left-[37.5%] -translate-x-1/2 text-[10px] text-gray-400 font-bold">5</div>
                                        <div className="absolute right-0 text-[10px] text-gray-400 font-bold">10</div>
                                    </div>
                                    <p className="text-[10px] text-gray-500 mt-2">
                                        A IA tentará gerar conteúdo suficiente para preencher aproximadamente {targetPages} páginas ({targetPages * 800} palavras).
                                    </p>
                                </div>
                            </div>
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
                                
                                <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto self-stretch md:self-auto justify-end">
                                    <button 
                                        onClick={handleGenerate}
                                        disabled={isGenerating}
                                        className="flex-1 md:flex-initial px-8 py-5 bg-gradient-to-br from-[#C5A059] to-[#9e8045] text-black font-black rounded-3xl shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex flex-col items-center justify-center gap-1.5 md:min-w-[160px]"
                                    >
                                        {isGenerating ? <Loader2 className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />}
                                        <span className="text-[10px] uppercase tracking-widest whitespace-nowrap">{isGenerating ? 'Processando...' : 'Gerar Novo'}</span>
                                    </button>

                                    {handleUpgrade && (
                                        <button 
                                            onClick={handleUpgrade}
                                            disabled={isGenerating}
                                            className="flex-1 md:flex-initial px-8 py-5 bg-gradient-to-br from-[#8B0000] to-[#600018] text-white font-black rounded-3xl shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex flex-col items-center justify-center gap-1.5 md:min-w-[160px] border border-[#C5A059]/40"
                                        >
                                            {isGenerating ? <Loader2 className="w-6 h-6 animate-spin" /> : <RefreshCw className="w-6 h-6" />}
                                            <span className="text-[10px] uppercase tracking-widest whitespace-nowrap">{isGenerating ? 'Atualizando...' : 'Atualizar IA'}</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Seção de Exportação de Estudos */}
                        {activeTab !== 'thematic' && (
                            <div className="bg-gray-50 dark:bg-black/20 p-6 rounded-3xl border-2 border-dashed border-[#C5A059]/30 space-y-4">
                                <div>
                                    <h4 className="font-cinzel font-black text-sm text-[#8B0000] dark:text-[#C5A059] uppercase tracking-wider flex items-center gap-2 mb-1">
                                        <FileDown className="w-5 h-5" /> Exportação de Livro Completo
                                    </h4>
                                    <p className="text-xs text-gray-500">
                                        Baixe todos os capítulos de <strong className="text-gray-800 dark:text-gray-200">{book}</strong> consolidados em formato Markdown (.md) leve, ideal para impressão ou leitura. O compilado será relativo ao modo atual: <strong className="text-gray-800 dark:text-gray-200">{activeTab === 'teacher' ? 'Guia do Mestre (Professor)' : 'EBD Panorama (Aluno)'}</strong>.
                                    </p>
                                </div>
                                
                                <div className="flex flex-col gap-4">
                                    <button
                                        onClick={handleDownloadBook}
                                        disabled={isCheckingDownload || isGenerating}
                                        className="w-full sm:w-auto px-6 py-4 bg-gradient-to-br from-[#8B0000] to-[#600018] text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-md hover:scale-102 flex items-center justify-center gap-2.5 transition-all disabled:opacity-50"
                                    >
                                        {isCheckingDownload ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 text-[#C5A059]" />}
                                        <span>{isCheckingDownload ? 'Verificando Capítulo por Capítulo...' : `Verificar e Baixar Livro Completo (${activeTab === 'teacher' ? 'Mestre' : 'Aluno'})`}</span>
                                    </button>

                                    {/* Lista de Capítulos Ausentes */}
                                    {bookDownloadStatus && bookDownloadStatus.status === 'missing' && (
                                        <div className="p-5 bg-red-50 dark:bg-[#8B0000]/10 rounded-2xl border border-red-200 dark:border-[#8B0000]/30 animate-in fade-in slide-in-from-top-4 duration-300">
                                            <p className="text-xs font-black text-red-700 dark:text-red-400 flex items-center gap-2 mb-2">
                                                ⚠️ ATENÇÃO: NÃO É POSSÍVEL BAIXAR COMPILAÇÃO COMPLETA
                                            </p>
                                            <p className="text-xs text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
                                                Existem <strong className="text-red-700 dark:text-red-300">{bookDownloadStatus.missing.length}</strong> capítulos sem aulas geradas no modo <strong className="text-[#8B0000] dark:text-[#C5A059]">{bookDownloadStatus.modeLabel}</strong> para o livro de <strong className="text-gray-800 dark:text-gray-200">{bookDownloadStatus.bookName}</strong>. Gere ou complete esses capítulos antes de baixar:
                                            </p>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-48 overflow-y-auto p-3 bg-white dark:bg-black/40 rounded-xl border border-gray-100 dark:border-gray-800">
                                                {bookDownloadStatus.missing.map(c => (
                                                    <button
                                                        key={c}
                                                        onClick={() => onNavigate('panorama', { book: bookDownloadStatus.bookName, chapter: c })}
                                                        className="px-3 py-1.5 bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 text-[10px] font-black rounded-lg hover:bg-red-200 dark:hover:bg-red-900 transition-all flex items-center justify-center gap-1 border border-red-200/50"
                                                    >
                                                        <span>Capitulo {c}</span>
                                                        <Sparkles className="w-3 h-3 text-[#C5A059]" />
                                                    </button>
                                                ))}
                                            </div>
                                            <p className="text-[10px] text-gray-400 mt-3 font-semibold italic flex items-center gap-1.5">
                                                💡 Clique em qualquer botão de capítulo acima para mudar o visor para ele e clicar em "Gerar Novo".
                                            </p>
                                        </div>
                                    )}

                                    {bookDownloadStatus && bookDownloadStatus.status === 'success' && (
                                        <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-2xl border border-green-200 dark:border-green-900/30 text-xs text-green-700 dark:text-green-400 font-bold flex items-center gap-2 animate-in fade-in duration-300">
                                            ✓ PRONTO! O compilado consolidado de {bookDownloadStatus.bookName} ({bookDownloadStatus.modeLabel}) foi baixado com sucesso!
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

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
