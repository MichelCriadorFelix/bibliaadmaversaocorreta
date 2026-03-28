import React, { useState, useEffect } from 'react';
import { ChevronLeft, CheckCircle, BookOpen, ChevronRight, Play, Clock, AlertTriangle, RefreshCw, Trophy, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { READING_PLANS, BIBLE_BOOKS, generateChapterKey } from '../../constants';
import { db } from '../../services/database';
import { addDays, differenceInDays, isAfter } from 'date-fns';
import { ActivePlan, UserProgress } from '../../types';

interface PlansViewProps {
    onBack: () => void;
    onNavigate: (view: string, params: any) => void;
    userProgress: UserProgress;
    onProgressUpdate: (updated: UserProgress) => void;
    onShowToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export default function PlansView({ onBack, onNavigate, userProgress, onProgressUpdate, onShowToast }: PlansViewProps) {
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [activePlanData, setActivePlanData] = useState<ActivePlan | null>(null);
  const [expandedBook, setExpandedBook] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  // Carrega os dados do plano ativo (se houver) quando um plano é selecionado
  useEffect(() => {
    if (selectedPlan && userProgress) {
        const found = userProgress.active_plans?.find((p: ActivePlan) => p.planId === selectedPlan.id);
        setActivePlanData(found || null);
        
        // Verifica se completou automaticamente ao abrir
        if (found && !found.isCompleted) {
            checkCompletion(selectedPlan, found);
        }
    }
  }, [selectedPlan, userProgress]);

  const startPlan = async () => {
    if (!selectedPlan || !userProgress || !userProgress.id || isStarting) return;
    
    setIsStarting(true);
    try {
        const newPlanData: ActivePlan = {
            planId: selectedPlan.id,
            startDate: new Date().toISOString(),
            isCompleted: false
        };

        const currentPlans = userProgress.active_plans || [];
        // Remove versão antiga se existir (restart)
        const filteredPlans = currentPlans.filter((p: ActivePlan) => p.planId !== selectedPlan.id);
        const newPlansList = [...filteredPlans, newPlanData];
        
        // 1. ATUALIZAÇÃO LOCAL IMEDIATA (UI Responsiva)
        setActivePlanData(newPlanData);
        
        // 2. PREPARAÇÃO DE PAYLOAD SEGURO (CRÍTICO: ENVIA OBJETO COMPLETO)
        const safePayload = {
            ...userProgress, // Espalha todas as props existentes
            active_plans: newPlansList,
            user_email: userProgress.user_email, // Redundância explícita para o Upsert
            user_name: userProgress.user_name    
        };

        // 3. SALVAMENTO NO BANCO (IndexedDB + API) with Strict Error Handling
        const updatedUser = await db.entities.ReadingProgress.update(userProgress.id, safePayload);
        
        // 4. NOTIFICA O APP GLOBAL
        if (updatedUser && onProgressUpdate) {
            onProgressUpdate(updatedUser);
        } else {
            onProgressUpdate(safePayload);
        }

        if (onShowToast) onShowToast("Plano iniciado! Prazo definido.", "success");

    } catch (error: any) {
        console.error("Erro ao iniciar plano:", error);
        // Exibe a mensagem real do erro (ex: "Sem internet", "Erro 500")
        const msg = error.message || "Não foi possível iniciar o plano. Verifique sua conexão.";
        if (onShowToast) onShowToast(msg, "error");
        else alert(msg);
        
        // Reverte estado local se falhou
        setActivePlanData(null);
    } finally {
        setIsStarting(false);
    }
  };

  const restartPlan = async () => {
    if (window.confirm("Deseja realmente reiniciar este plano? O prazo será renovado.")) {
        await startPlan();
        setExpandedBook(null);
    }
  };

  const checkCompletion = async (plan: any, planData: ActivePlan) => {
    if (!userProgress.id) return;

    // Verifica se todos os capítulos de todos os livros foram lidos
    let allRead = true;
    for (const bookName of plan.books) {
        const bookMeta = BIBLE_BOOKS.find(b => b.name === bookName);
        if (!bookMeta) continue;
        for (let i = 1; i <= bookMeta.chapters; i++) {
            const key = generateChapterKey(bookName, i);
            if (!userProgress.chapters_read.includes(key)) {
                allRead = false;
                break;
            }
        }
        if (!allRead) break;
    }

    if (allRead) {
        try {
            const currentPlans = userProgress.active_plans || [];
            const updatedPlans = currentPlans.map((p: ActivePlan) => {
                if (p.planId === plan.id) return { ...p, isCompleted: true, completedDate: new Date().toISOString() };
                return p;
            });
            
            // Payload seguro também na conclusão
            const safePayload = {
                ...userProgress,
                active_plans: updatedPlans,
                user_email: userProgress.user_email
            };

            // Tenta salvar na nuvem
            const updatedUser = await db.entities.ReadingProgress.update(userProgress.id, safePayload);
            
            if (updatedUser && onProgressUpdate) {
                onProgressUpdate(updatedUser);
            }
            
            setActivePlanData({ ...planData, isCompleted: true });
            triggerConfetti();
            if (onShowToast) onShowToast("Parabéns! Plano concluído e salvo na nuvem.", "success");

        } catch (error: any) {
            console.error("Erro ao salvar conclusão:", error);
            const msg = error.message || "Erro de conexão ao salvar conclusão.";
            if (onShowToast) onShowToast(msg, "error");
        }
    }
  };

  const triggerConfetti = () => {
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 5000);
  };

  // Renderiza a grade de capítulos
  const renderChapterGrid = (bookName: string) => {
    const bookMeta = BIBLE_BOOKS.find(b => b.name === bookName);
    if (!bookMeta) return null;

    const chapters = Array.from({ length: bookMeta.chapters }, (_, i) => i + 1);

    return (
        <div className="grid grid-cols-5 md:grid-cols-10 gap-2 p-4 bg-gray-50 dark:bg-black/20 rounded-b-lg border-x border-b border-[#C5A059]/20 animate-in slide-in-from-top-2">
            {chapters.map(chap => {
                const key = generateChapterKey(bookName, chap);
                const isRead = userProgress?.chapters_read?.includes(key);
                return (
                    <button
                        key={chap}
                        onClick={(e) => {
                            e.stopPropagation();
                            onNavigate('reader', { book: bookName, chapter: chap });
                        }}
                        className={`h-10 rounded flex items-center justify-center text-sm font-bold transition-all hover:scale-105 ${
                            isRead 
                                ? 'bg-green-600 text-white shadow-sm' 
                                : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-[#C5A059] hover:text-white'
                        }`}
                    >
                        {chap}
                    </button>
                );
            })}
        </div>
    );
  };

  if (selectedPlan) {
    // Lógica de Prazo
    let isExpired = false;
    let daysLeft = selectedPlan.estimatedDays;
    let progress = 0;
    
    if (activePlanData) {
        const start = new Date(activePlanData.startDate);
        const deadline = addDays(start, selectedPlan.estimatedDays);
        const now = new Date();
        
        // Verifica expiração (só se não estiver completo)
        if (isAfter(now, deadline) && !activePlanData.isCompleted) {
            isExpired = true;
            daysLeft = 0;
        } else {
            daysLeft = Math.max(0, differenceInDays(deadline, now));
        }

        // Calcula progresso visual simples (baseado em capítulos lidos globais vs total do plano)
        let totalPlanChapters = 0;
        let readPlanChapters = 0;
        selectedPlan.books.forEach((bName: string) => {
            const b = BIBLE_BOOKS.find(x => x.name === bName);
            if (b) {
                totalPlanChapters += b.chapters;
                for(let i=1; i<=b.chapters; i++) {
                    if (userProgress.chapters_read.includes(generateChapterKey(b.name, i))) {
                        readPlanChapters++;
                    }
                }
            }
        });
        progress = totalPlanChapters > 0 ? (readPlanChapters / totalPlanChapters) * 100 : 0;
    }

    return (
        <div className="min-h-screen bg-[#F5F5DC] dark:bg-dark-bg transition-colors duration-300 relative overflow-hidden">
            {showConfetti && (
                <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/20" />
                    <div className="bg-white dark:bg-dark-card p-8 rounded-2xl shadow-2xl text-center animate-bounce z-50 border-2 border-[#C5A059]">
                        <Trophy className="w-20 h-20 mx-auto text-yellow-500 mb-4" />
                        <h2 className="font-cinzel font-bold text-2xl text-[#8B0000] dark:text-[#ff6b6b]">PARABÉNS!</h2>
                        <p className="font-montserrat text-gray-600 dark:text-gray-300">Você concluiu o plano {selectedPlan.name}!</p>
                    </div>
                </div>
            )}

            {/* Header Plan Details - CORREÇÃO iOS SAFE AREA */}
            <div className="bg-[#8B0000] text-white p-4 pt-[calc(env(safe-area-inset-top)+1rem)] flex items-center gap-4 sticky top-0 shadow-lg z-10">
                <button onClick={() => setSelectedPlan(null)}><ChevronLeft /></button>
                <h1 className="font-cinzel font-bold truncate">{selectedPlan.name}</h1>
            </div>
            
            <div className="p-4 max-w-3xl mx-auto pb-20">
                {/* Header Card */}
                <div className="bg-white dark:bg-dark-card p-6 rounded-xl shadow-md border border-[#C5A059]/20 mb-6">
                    <p className="font-montserrat text-gray-600 dark:text-gray-300 mb-4">{selectedPlan.description}</p>
                    
                    {!activePlanData ? (
                        <div className="mt-4">
                             <div className="flex gap-2 mb-4">
                                <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded font-bold flex items-center gap-1"><Clock className="w-3 h-3"/> {selectedPlan.estimatedDays} dias</span>
                                <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded font-bold">{selectedPlan.books.length} Livros</span>
                            </div>
                            <button 
                                onClick={startPlan} 
                                disabled={isStarting}
                                className="w-full bg-[#8B0000] text-white py-3 rounded font-bold font-cinzel hover:bg-[#600018] flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                                {isStarting ? 'SALVANDO NA NUVEM...' : 'INICIAR PLANO'}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {activePlanData.isCompleted ? (
                                <div className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 p-3 rounded flex items-center gap-2 font-bold justify-center border border-green-200">
                                    <Trophy className="w-5 h-5" /> PLANO CONCLUÍDO
                                </div>
                            ) : isExpired ? (
                                <div className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 p-3 rounded flex items-center gap-2 font-bold justify-center border border-red-200">
                                    <AlertTriangle className="w-5 h-5" /> PRAZO EXPIRADO
                                </div>
                            ) : (
                                <div>
                                    <div className="flex justify-between text-xs font-bold mb-1 dark:text-gray-300">
                                        <span>Progresso</span>
                                        <span>{progress.toFixed(0)}%</span>
                                    </div>
                                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-2">
                                        <div className="bg-[#8B0000] h-2.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                                    </div>
                                    <p className="text-xs text-right text-gray-500 dark:text-gray-400">Restam {daysLeft} dias</p>
                                </div>
                            )}

                            {(isExpired || activePlanData.isCompleted) && (
                                <button onClick={restartPlan} className="w-full border border-[#8B0000] text-[#8B0000] dark:text-[#ff6b6b] dark:border-[#8B0000] py-2 rounded font-bold text-sm hover:bg-[#8B0000]/10 flex items-center justify-center gap-2">
                                    <RefreshCw className="w-4 h-4" /> RECOMEÇAR PLANO
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Books List */}
                <h3 className="font-cinzel font-bold text-[#8B0000] dark:text-[#ff6b6b] mb-3 ml-2">Livros do Plano</h3>
                <div className="space-y-2 opacity-100">
                    {/* Se expirado, aplica opacidade visual para indicar bloqueio, mas permite ver */}
                    <div className={isExpired ? "opacity-50 pointer-events-none grayscale" : ""}>
                        {selectedPlan.books.map((b: string) => (
                            <div key={b} className="rounded-lg shadow-sm overflow-hidden border border-[#C5A059]/10 mb-2">
                                <div 
                                    onClick={() => setExpandedBook(expandedBook === b ? null : b)}
                                    className={`bg-white dark:bg-dark-card p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${expandedBook === b ? 'bg-gray-50 dark:bg-gray-800' : ''}`}
                                >
                                    <span className="font-cinzel font-bold dark:text-gray-200">{b}</span>
                                    {expandedBook === b ? <ChevronUp className="w-4 h-4 text-[#C5A059]" /> : <ChevronDown className="w-4 h-4 text-[#C5A059]" />}
                                </div>
                                
                                {expandedBook === b && renderChapterGrid(b)}
                            </div>
                        ))}
                    </div>
                    {isExpired && (
                        <p className="text-center text-red-500 text-sm font-bold mt-4">Reinicie o plano para continuar marcando capítulos.</p>
                    )}
                </div>
            </div>
        </div>
    )
  }

  // Lista de Planos (Menu Principal)
  return (
    <div className="min-h-screen bg-[#F5F5DC] dark:bg-dark-bg transition-colors duration-300">
        {/* Header List - CORREÇÃO iOS SAFE AREA */}
        <div className="bg-[#8B0000] text-white p-4 pt-[calc(env(safe-area-inset-top)+1rem)] flex items-center gap-4 sticky top-0 shadow-lg z-20">
            <button onClick={onBack}><ChevronLeft /></button>
            <h1 className="font-cinzel font-bold">Planos de Leitura</h1>
        </div>
        <div className="p-4 space-y-4 pb-20">
            {READING_PLANS.map(plan => {
                const active = userProgress?.active_plans?.find((p: ActivePlan) => p.planId === plan.id);
                
                return (
                    <div 
                        key={plan.id} 
                        onClick={() => setSelectedPlan(plan)}
                        className={`bg-white dark:bg-dark-card p-6 rounded-xl shadow-md border cursor-pointer hover:shadow-lg transition-all active:scale-95 relative overflow-hidden ${active ? 'border-[#8B0000] dark:border-[#ff6b6b]' : 'border-[#C5A059]/20'}`}
                    >
                        {active && active.isCompleted && (
                            <div className="absolute top-0 right-0 bg-green-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl">CONCLUÍDO</div>
                        )}
                        {active && !active.isCompleted && (
                            <div className="absolute top-0 right-0 bg-[#C5A059] text-white text-[10px] font-bold px-2 py-1 rounded-bl">EM ANDAMENTO</div>
                        )}

                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="font-cinzel font-bold text-lg text-[#1a0f0f] dark:text-white">{plan.name}</h3>
                                <p className="font-montserrat text-sm text-gray-500 dark:text-gray-400 mb-2 line-clamp-2">{plan.description}</p>
                                <div className="flex items-center gap-2 text-xs font-bold text-[#8B0000] dark:text-[#ff6b6b]">
                                    <CheckCircle className="w-4 h-4" /> {plan.estimatedDays} dias
                                </div>
                            </div>
                            <ChevronRight className="text-[#C5A059]" />
                        </div>
                    </div>
                );
            })}
        </div>
    </div>
  );
}
