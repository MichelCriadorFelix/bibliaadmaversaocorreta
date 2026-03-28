import React, { useState, useEffect } from 'react';
import { X, ClipboardList, CheckCircle, Clock, XCircle, RefreshCw, Search, Users, ShieldAlert, Award, Calendar } from 'lucide-react';
import { db } from '../../services/database';
import { UserProgress, EbdAttendanceState, EbdAttendanceHistory } from '../../types';
import { format } from 'date-fns';

interface Props {
    onClose: () => void;
    isAdmin: boolean;
    onShowToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export default function AttendanceManager({ onClose, isAdmin, onShowToast }: Props) {
    const [users, setUsers] = useState<UserProgress[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));

    const todayStr = format(new Date(), 'yyyy-MM-dd');

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        setLoading(true);
        try {
            const list = await db.entities.ReadingProgress.list();
            // Ordena alfabeticamente
            const sorted = list.sort((a: any, b: any) => a.user_name.localeCompare(b.user_name));
            setUsers(sorted);
        } catch (e) {
            console.error(e);
            onShowToast("Erro ao carregar lista de alunos.", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleMark = async (user: UserProgress, newStatus: 'P' | 'A' | 'F') => {
        if (!user.id) return;
        setProcessingId(user.id);

        try {
            const currentAttendance = user.ebd_attendance || { p: 0, a: 0, f: 0, last_status: null, last_updated: '', history: [] };
            
            // Garantia de Histórico: Recupera ou Inicializa
            let history: EbdAttendanceHistory[] = Array.isArray(currentAttendance.history) ? [...currentAttendance.history] : [];

            // --- MIGRAÇÃO AUTOMÁTICA DE DADOS ANTIGOS ---
            // Se não tem histórico mas tem pontos, cria entradas legadas para não perder a contagem
            const hasHistory = history.length > 0;
            const hasPoints = currentAttendance.p > 0 || currentAttendance.a > 0 || currentAttendance.f > 0;
            
            if (!hasHistory && hasPoints) {
                for(let i=0; i<currentAttendance.p; i++) history.push({ date: `legacy-p-${i}`, status: 'P' });
                for(let i=0; i<currentAttendance.a; i++) history.push({ date: `legacy-a-${i}`, status: 'A' });
                for(let i=0; i<currentAttendance.f; i++) history.push({ date: `legacy-f-${i}`, status: 'F' });
            }
            // ---------------------------------------------

            // Lógica de Atualização por Data
            const index = history.findIndex(h => h.date === selectedDate);
            
            if (index >= 0) {
                // Se já existe registro nesta data
                if (history[index].status === newStatus) {
                    // Clicou no mesmo status: Desmarcar (Remover)
                    history.splice(index, 1);
                    onShowToast("Marcação removida para esta data.", "info");
                } else {
                    // Trocar status
                    history[index].status = newStatus;
                    onShowToast("Status atualizado para esta data.", "success");
                }
            } else {
                // Nova data
                history.push({ date: selectedDate, status: newStatus });
                onShowToast("Frequência registrada.", "success");
            }

            // Recálculo Total Baseado no Histórico (Fonte da Verdade)
            let newP = 0, newA = 0, newF = 0;
            history.forEach(h => {
                if (h.status === 'P') newP++;
                else if (h.status === 'A') newA++;
                else if (h.status === 'F') newF++;
            });

            // Atualiza Objeto
            const updatedAttendance: EbdAttendanceState = {
                p: newP,
                a: newA,
                f: newF,
                last_status: newStatus,
                last_updated: selectedDate,
                history: history
            };

            // Salva no Banco
            await db.entities.ReadingProgress.update(user.id, { 
                ebd_attendance: updatedAttendance,
                user_email: user.user_email
            });

            // Atualiza Localmente
            setUsers(prev => prev.map(u => u.id === user.id ? { ...u, ebd_attendance: updatedAttendance } : u));

        } catch (e) {
            onShowToast("Erro ao salvar frequência.", "error");
        } finally {
            setProcessingId(null);
        }
    };

    const handleResetPeriod = async () => {
        if (!isAdmin) return;
        if (!window.confirm("ATENÇÃO ABSOLUTA:\n\nIsso irá ZERAR a contagem de presenças de TODOS os alunos.\nUse isso apenas quando iniciar um NOVO LIVRO ou NOVO TRIMESTRE.\n\nTem certeza?")) return;
        if (!window.confirm("Confirmação Final: Zerar todas as faltas e presenças agora?")) return;

        setLoading(true);
        try {
            const allUsers = await db.entities.ReadingProgress.list();
            for (const user of allUsers) {
                if (user.id) {
                    await db.entities.ReadingProgress.update(user.id, {
                        ebd_attendance: { p: 0, a: 0, f: 0, last_status: null, last_updated: '', history: [] },
                        user_email: user.user_email
                    });
                }
            }
            await loadUsers();
            onShowToast("Período Reiniciado! Todas as frequências foram zeradas.", "success");
        } catch (e) {
            onShowToast("Erro ao resetar período.", "error");
        } finally {
            setLoading(false);
        }
    };

    const filteredUsers = users.filter(u => u.user_name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white dark:bg-[#1E1E1E] w-full max-w-4xl h-[90vh] rounded-3xl shadow-2xl border-2 border-[#C5A059] flex flex-col overflow-hidden">
                
                {/* Header */}
                <div className="bg-[#1a0f0f] p-5 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="bg-[#C5A059] p-2 rounded-lg text-black">
                            <ClipboardList className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="font-cinzel font-bold text-white text-xl">Gestão de Frequência EBD</h2>
                            <p className="text-[#C5A059] text-xs font-bold uppercase tracking-widest">Secretaria Acadêmica</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X className="w-8 h-8" />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="bg-gray-100 dark:bg-black/20 p-4 border-b border-[#C5A059]/20 flex flex-col md:flex-row gap-4 justify-between items-center shrink-0">
                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <div className="relative flex-1 md:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input 
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                placeholder="Buscar aluno..."
                                className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm focus:ring-2 focus:ring-[#C5A059] outline-none"
                            />
                        </div>
                        
                        <div className="flex items-center gap-2 bg-white dark:bg-gray-800 p-1.5 rounded-xl border border-gray-300 dark:border-gray-700">
                            <Calendar className="w-4 h-4 text-[#C5A059] ml-2" />
                            <input 
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="bg-transparent border-none text-sm font-bold text-gray-700 dark:text-white outline-none"
                            />
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-4 text-xs font-bold text-gray-500 dark:text-gray-400">
                        <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500"></span> Presente (1.0)</div>
                        <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-500"></span> Atrasado (0.5)</div>
                        <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500"></span> Falta (0.0)</div>
                    </div>

                    {isAdmin && (
                        <button 
                            onClick={handleResetPeriod}
                            className="px-4 py-2 bg-red-900/10 hover:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-500/30 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors whitespace-nowrap"
                        >
                            <ShieldAlert className="w-4 h-4" /> ZERAR PERÍODO (ADMIN)
                        </button>
                    )}
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-4 bg-[#FDFBF7] dark:bg-[#121212]">
                    <div className="space-y-3">
                        {filteredUsers.map((user) => {
                            const att = user.ebd_attendance || { p: 0, a: 0, f: 0, last_status: null, last_updated: '', history: [] };
                            
                            // Verifica status específico para a DATA SELECIONADA
                            const historyEntry = att.history?.find(h => h.date === selectedDate);
                            const statusOnDate = historyEntry ? historyEntry.status : null;
                            
                            // Totais acumulados
                            const totalPoints = (att.p * 1) + (att.a * 0.5);
                            
                            return (
                                <div key={user.id} className={`bg-white dark:bg-dark-card p-4 rounded-xl border-l-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4 transition-all ${statusOnDate ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/10' : 'border-gray-300 dark:border-gray-700'}`}>
                                    
                                    <div className="flex items-center gap-4 w-full md:w-auto">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#8B0000] to-[#500000] flex items-center justify-center text-white font-cinzel font-bold shrink-0">
                                            {user.user_name.charAt(0)}
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="font-bold text-gray-800 dark:text-white truncate">{user.user_name}</h3>
                                            <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                                                <span title="Total Presenças" className="text-green-600 font-bold">P: {att.p}</span>
                                                <span title="Total Atrasos" className="text-yellow-600 font-bold">A: {att.a}</span>
                                                <span title="Total Faltas" className="text-red-600 font-bold">F: {att.f}</span>
                                                <span className="h-3 w-px bg-gray-300 dark:bg-gray-600 mx-1"></span>
                                                <span title="Pontuação Acumulada" className="text-[#C5A059] font-black uppercase tracking-wider flex items-center gap-1">
                                                    <Award className="w-3 h-3"/> Total: {totalPoints}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        {/* PRESENÇA */}
                                        <button 
                                            onClick={() => handleMark(user, 'P')}
                                            disabled={processingId === user.id}
                                            className={`w-12 h-12 rounded-xl flex items-center justify-center border-2 transition-all active:scale-95 ${statusOnDate === 'P' ? 'bg-green-500 border-green-600 text-white shadow-lg scale-110 ring-2 ring-green-300' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-300 hover:border-green-500 hover:text-green-500'}`}
                                            title="Marcar Presença (+1.0)"
                                        >
                                            <CheckCircle className="w-6 h-6" />
                                        </button>

                                        {/* ATRASO */}
                                        <button 
                                            onClick={() => handleMark(user, 'A')}
                                            disabled={processingId === user.id}
                                            className={`w-12 h-12 rounded-xl flex items-center justify-center border-2 transition-all active:scale-95 ${statusOnDate === 'A' ? 'bg-yellow-500 border-yellow-600 text-white shadow-lg scale-110 ring-2 ring-yellow-300' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-300 hover:border-yellow-500 hover:text-yellow-500'}`}
                                            title="Marcar Atraso (+0.5)"
                                        >
                                            <Clock className="w-6 h-6" />
                                        </button>

                                        {/* FALTA */}
                                        <button 
                                            onClick={() => handleMark(user, 'F')}
                                            disabled={processingId === user.id}
                                            className={`w-12 h-12 rounded-xl flex items-center justify-center border-2 transition-all active:scale-95 ${statusOnDate === 'F' ? 'bg-red-500 border-red-600 text-white shadow-lg scale-110 ring-2 ring-red-300' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-300 hover:border-red-500 hover:text-red-500'}`}
                                            title="Marcar Falta (0.0)"
                                        >
                                            <XCircle className="w-6 h-6" />
                                        </button>
                                    </div>

                                </div>
                            )
                        })}
                        {filteredUsers.length === 0 && (
                            <div className="text-center py-20 text-gray-400">
                                <Users className="w-16 h-16 mx-auto mb-4 opacity-20" />
                                <p>Nenhum aluno encontrado.</p>
                            </div>
                        )}
                    </div>
                </div>
                
                {/* Footer Status */}
                <div className="bg-gray-100 dark:bg-black/40 p-2 text-center text-[10px] text-gray-500 uppercase tracking-widest border-t border-[#C5A059]/20">
                    ADMA EBD System v2.0 • Data Selecionada: {format(new Date(selectedDate), 'dd/MM/yyyy')}
                </div>
            </div>
        </div>
    );
}
