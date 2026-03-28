import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Trophy, Medal, Crown, User, Loader2, BookOpen, GraduationCap, X, Flame, Star, Shield, RefreshCw, Brain } from 'lucide-react';
import { db } from '../../services/database';
import { AnimatePresence, motion } from 'framer-motion';

export default function RankingView({ onBack, userProgress }: any) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'chapters' | 'ebd' | 'quiz'>('chapters');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  
  // OTIMIZAÇÃO: Paginação para reduzir DOM
  const [page, setPage] = useState(0);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    loadData();
    // OTIMIZAÇÃO PERFORMANCE: Polling aumentado para 30s (era 5s)
    const interval = setInterval(() => {
        loadData(true); 
    }, 30000); 

    return () => clearInterval(interval);
  }, [activeTab]);

  // Reseta página ao trocar de aba
  useEffect(() => {
      setPage(0);
  }, [activeTab]);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    
    try {
        const rawData = await db.entities.ReadingProgress.list();
        
        const usersMap = new Map<string, any>();

        if (rawData && Array.isArray(rawData)) {
            rawData.forEach((u: any) => {
                if (!u.user_email) return;
                
                const email = u.user_email.toLowerCase().trim();
                const existing = usersMap.get(email);
                
                if (!existing) {
                    const profile = { ...u };
                    profile.total_chapters = profile.chapters_read ? profile.chapters_read.length : (profile.total_chapters || 0);
                    profile.total_ebd_read = profile.ebd_read ? profile.ebd_read.length : (profile.total_ebd_read || 0);
                    profile.total_thematic_read = profile.thematic_read ? profile.thematic_read.length : (profile.total_thematic_read || 0);
                    usersMap.set(email, profile);
                } else {
                    // Merge logic: take the best of each category
                    const merged = { ...existing };
                    
                    // Chapters: Merge arrays to combine progress from different sources
                    const chaptersSet = new Set([
                        ...(existing.chapters_read || []),
                        ...(u.chapters_read || [])
                    ]);
                    merged.chapters_read = Array.from(chaptersSet);
                    merged.total_chapters = merged.chapters_read.length;
                    
                    // EBD: Merge arrays
                    const ebdSet = new Set([
                        ...(existing.ebd_read || []),
                        ...(u.ebd_read || [])
                    ]);
                    merged.ebd_read = Array.from(ebdSet);
                    merged.total_ebd_read = merged.ebd_read.length;

                    // Thematic: Merge arrays
                    const thematicSet = new Set([
                        ...(existing.thematic_read || []),
                        ...(u.thematic_read || [])
                    ]);
                    merged.thematic_read = Array.from(thematicSet);
                    merged.total_thematic_read = merged.thematic_read.length;
                    
                    // Quiz: Take the highest points
                    merged.quiz_points = Math.max(existing.quiz_points || 0, u.quiz_points || 0);
                    
                    // Merge quizzes_taken list
                    const takenSet = new Set([
                        ...(existing.quizzes_taken || []),
                        ...(u.quizzes_taken || [])
                    ]);
                    merged.quizzes_taken = Array.from(takenSet);
                    
                    // Keep the most recent name
                    const dateExisting = new Date(existing.updated_at || existing.created_at || 0).getTime();
                    const dateNew = new Date(u.updated_at || u.created_at || 0).getTime();
                    if (dateNew > dateExisting) {
                        merged.user_name = u.user_name;
                    }
                    
                    usersMap.set(email, merged);
                }
            });
        }

        if (userProgress && userProgress.user_email) {
            const myEmail = userProgress.user_email.toLowerCase().trim();
            const existing = usersMap.get(myEmail);
            
            if (!existing) {
                usersMap.set(myEmail, userProgress);
            } else {
                // Merge local progress with cloud data to ensure the UI shows the latest
                const merged = { ...existing };
                
                // Chapters
                const chaptersSet = new Set([
                    ...(existing.chapters_read || []),
                    ...(userProgress.chapters_read || [])
                ]);
                merged.chapters_read = Array.from(chaptersSet);
                merged.total_chapters = merged.chapters_read.length;
                
                // EBD
                const ebdSet = new Set([
                    ...(existing.ebd_read || []),
                    ...(userProgress.ebd_read || [])
                ]);
                merged.ebd_read = Array.from(ebdSet);
                merged.total_ebd_read = merged.ebd_read.length;

                // Thematic
                const thematicSet = new Set([
                    ...(existing.thematic_read || []),
                    ...(userProgress.thematic_read || [])
                ]);
                merged.thematic_read = Array.from(thematicSet);
                merged.total_thematic_read = merged.thematic_read.length;
                
                // Quiz
                merged.quiz_points = Math.max(existing.quiz_points || 0, userProgress.quiz_points || 0);
                
                const takenSet = new Set([
                    ...(existing.quizzes_taken || []),
                    ...(userProgress.quizzes_taken || [])
                ]);
                merged.quizzes_taken = Array.from(takenSet);
                
                usersMap.set(myEmail, merged);
            }
        }

        const uniqueUsers = Array.from(usersMap.values());

        const sorted = uniqueUsers.sort((a, b) => {
            if (activeTab === 'chapters') {
                const capsA = a.total_chapters || 0;
                const capsB = b.total_chapters || 0;
                if (capsB !== capsA) return capsB - capsA; 
                return (a.user_name || "").localeCompare(b.user_name || ""); 
            } else if (activeTab === 'ebd') {
                const ebdsA = (a.total_ebd_read || 0) + (a.total_thematic_read || 0);
                const ebdsB = (b.total_ebd_read || 0) + (b.total_thematic_read || 0);
                if (ebdsB !== ebdsA) return ebdsB - ebdsA;
                return (a.user_name || "").localeCompare(b.user_name || "");
            } else {
                // Quiz
                const ptsA = a.quiz_points || 0;
                const ptsB = b.quiz_points || 0;
                if (ptsB !== ptsA) return ptsB - ptsA;
                return (a.user_name || "").localeCompare(b.user_name || "");
            }
        });

        setUsers(sorted);

    } catch(e) {
        console.error("Erro ranking:", e);
        if (!silent) setUsers([]);
    } finally {
        if (!silent) setLoading(false);
    }
  };

  const formatUserName = (rawName: string) => {
    if (!rawName) return "Anônimo";
    if (rawName.includes('@')) {
        const prefix = rawName.split('@')[0];
        return prefix.split('.').map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ');
    }
    return rawName;
  };

  const getPositionStyle = (index: number, isMe: boolean) => {
    let baseStyle = 'cursor-pointer transition-all border ';
    
    if (isMe) {
        baseStyle += 'ring-2 ring-[#C5A059] shadow-lg transform scale-[1.02] z-10 ';
    } else {
        baseStyle += 'hover:bg-gray-50 dark:hover:bg-gray-800 ';
    }

    switch (index) {
        case 0: return baseStyle + 'bg-gradient-to-r from-yellow-300 to-yellow-500 text-yellow-900 border-yellow-400';
        case 1: return baseStyle + 'bg-gradient-to-r from-gray-300 to-gray-400 text-gray-900 border-gray-400';
        case 2: return baseStyle + 'bg-gradient-to-r from-orange-300 to-orange-400 text-orange-900 border-orange-400';
        default: return baseStyle + (isMe ? 'bg-[#F5F5DC] dark:bg-[#2a2a2a] border-[#C5A059]' : 'bg-white dark:bg-dark-card border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200');
    }
  };

  const getIcon = (index: number) => {
    switch (index) {
        case 0: return <Crown className="w-6 h-6 text-yellow-800" />;
        case 1: return <Medal className="w-6 h-6 text-gray-800" />;
        case 2: return <Medal className="w-6 h-6 text-orange-900" />;
        default: return <span className="font-cinzel font-bold text-lg w-6 text-center">{index + 1}</span>;
    }
  };

  const getBadges = (u: any) => {
      const badges = [];
      const caps = u.total_chapters || 0;
      const ebds = (u.total_ebd_read || 0) + (u.total_thematic_read || 0);
      const quizPts = u.quiz_points || 0;

      if (caps >= 50) badges.push({ icon: BookOpen, label: "Leitor de Gênesis", color: "text-blue-500" });
      if (caps >= 300) badges.push({ icon: Star, label: "Devoto da Palavra", color: "text-yellow-500" });
      if (caps >= 1189) badges.push({ icon: Crown, label: "Bíblia Completa", color: "text-purple-500" });
      
      if (ebds >= 1) badges.push({ icon: GraduationCap, label: "Estudante EBD", color: "text-green-500" });
      if (ebds >= 10) badges.push({ icon: Shield, label: "Teólogo Jr", color: "text-red-500" });

      if (quizPts >= 50) badges.push({ icon: Brain, label: "Mestre da Lei", color: "text-pink-500" });

      if (u.active_plans?.some((p: any) => p.isCompleted)) {
          badges.push({ icon: Trophy, label: "Finalizador de Planos", color: "text-orange-500" });
      }

      return badges;
  };

  // Cálculo da Paginação
  const totalPages = Math.ceil(users.length / ITEMS_PER_PAGE);
  const paginatedUsers = users.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

  return (
    <div className="min-h-screen bg-[#F5F5DC] dark:bg-dark-bg transition-colors duration-300 pb-20">
        <AnimatePresence>
            {selectedUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <motion.div 
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/90" 
                        onClick={() => setSelectedUser(null)}
                    />
                    <motion.div 
                        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                        className="bg-white dark:bg-[#1E1E1E] w-full max-w-sm rounded-2xl p-6 relative z-10 shadow-2xl border-2 border-[#C5A059]"
                    >
                        <button onClick={() => setSelectedUser(null)} className="absolute top-4 right-4 text-gray-500"><X /></button>
                        
                        <div className="flex flex-col items-center mb-6">
                            <div className="w-20 h-20 bg-gradient-to-br from-[#8B0000] to-[#600018] rounded-full flex items-center justify-center mb-3 shadow-lg">
                                <span className="font-cinzel font-bold text-3xl text-white">
                                    {formatUserName(selectedUser.user_name).charAt(0)}
                                </span>
                            </div>
                            <h2 className="font-cinzel font-bold text-xl text-[#1a0f0f] dark:text-white text-center">
                                {formatUserName(selectedUser.user_name)}
                            </h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Membro ADMA</p>
                        </div>

                        <div className="grid grid-cols-3 gap-3 mb-6">
                            <div className="bg-gray-100 dark:bg-black/30 p-2 rounded-lg text-center">
                                <BookOpen className="w-4 h-4 mx-auto text-[#8B0000] mb-1" />
                                <span className="block font-bold text-sm dark:text-white">{selectedUser.total_chapters || 0}</span>
                                <span className="text-[10px] text-gray-500">Caps</span>
                            </div>
                            <div className="bg-gray-100 dark:bg-black/30 p-2 rounded-lg text-center">
                                <GraduationCap className="w-4 h-4 mx-auto text-[#C5A059] mb-1" />
                                <span className="block font-bold text-sm dark:text-white">{(selectedUser.total_ebd_read || 0) + (selectedUser.total_thematic_read || 0)}</span>
                                <span className="text-[10px] text-gray-500">Estudos</span>
                            </div>
                            <div className="bg-gray-100 dark:bg-black/30 p-2 rounded-lg text-center">
                                <Brain className="w-4 h-4 mx-auto text-pink-600 mb-1" />
                                <span className="block font-bold text-sm dark:text-white">{selectedUser.quiz_points || 0}</span>
                                <span className="text-[10px] text-gray-500">Pts</span>
                            </div>
                        </div>

                        <h3 className="font-bold text-sm text-gray-500 uppercase mb-3 flex items-center gap-1">
                            <Medal className="w-4 h-4" /> Medalhas & Conquistas
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {getBadges(selectedUser).length > 0 ? (
                                getBadges(selectedUser).map((badge, i) => (
                                    <div key={i} className="flex items-center gap-1 bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded-full border border-gray-200 dark:border-gray-700">
                                        <badge.icon className={`w-3 h-3 ${badge.color}`} />
                                        <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{badge.label}</span>
                                    </div>
                                ))
                            ) : (
                                <p className="text-xs text-gray-400 italic">Nenhuma medalha ainda.</p>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>

        {/* Header com Safe Area */}
        <div className="bg-[#8B0000] text-white p-4 pt-[calc(env(safe-area-inset-top)+1rem)] flex items-center justify-between sticky top-0 shadow-lg z-10">
            <div className="flex items-center gap-4">
                <button onClick={onBack}><ChevronLeft /></button>
                <h1 className="font-cinzel font-bold">Ranking Global</h1>
            </div>
            <button onClick={() => loadData(false)} disabled={loading} className="p-2 hover:bg-white/10 rounded-full transition-all active:scale-95">
                <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
            </button>
        </div>

        <div className="flex bg-white dark:bg-dark-card border-b border-[#C5A059]">
            <button 
                onClick={() => setActiveTab('chapters')}
                className={`flex-1 py-4 font-cinzel font-bold flex justify-center items-center gap-2 transition-all ${activeTab === 'chapters' ? 'bg-[#8B0000] text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-[#8B0000]/10'}`}
            >
                <BookOpen className="w-5 h-5" /> Bíblia
            </button>
            <button 
                onClick={() => setActiveTab('ebd')}
                className={`flex-1 py-4 font-cinzel font-bold flex justify-center items-center gap-2 transition-all ${activeTab === 'ebd' ? 'bg-[#C5A059] text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-[#C5A059]/10'}`}
            >
                <GraduationCap className="w-5 h-5" /> EBD
            </button>
            <button 
                onClick={() => setActiveTab('quiz')}
                className={`flex-1 py-4 font-cinzel font-bold flex justify-center items-center gap-2 transition-all ${activeTab === 'quiz' ? 'bg-pink-700 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-pink-700/10'}`}
            >
                <Brain className="w-5 h-5" /> Quiz
            </button>
        </div>

        <div className="p-4 max-w-lg mx-auto">
            {/* Texto motivacional condicional */}
            <div className="bg-[#8B0000]/10 dark:bg-white/5 p-4 rounded-lg mb-6 text-center">
                <p className="font-cinzel font-bold text-[#8B0000] dark:text-[#ff6b6b] text-sm">
                    {activeTab === 'chapters' && '"Lâmpada para os meus pés é a tua palavra..." (Sl 119:105)'}
                    {activeTab === 'ebd' && '"Crescei na graça e no conhecimento..." (2 Pe 3:18)'}
                    {activeTab === 'quiz' && '"Examinais as Escrituras..." (Jo 5:39)'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Toque em um usuário para ver suas medalhas.
                </p>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 animate-in fade-in">
                    <Loader2 className="w-10 h-10 animate-spin text-[#8B0000] dark:text-[#ff6b6b]" />
                    <p className="mt-2 font-cinzel text-gray-500">Sincronizando Ranking...</p>
                </div>
            ) : (
                <>
                    <div className="space-y-3">
                        {paginatedUsers.map((u, idx) => {
                            const isMe = userProgress?.user_email === u.user_email;
                            const realPosition = (page * ITEMS_PER_PAGE) + idx;
                            
                            return (
                                <div 
                                    key={u.id || idx} 
                                    onClick={() => setSelectedUser(u)}
                                    className={`p-4 rounded-xl shadow-md flex items-center gap-4 ${getPositionStyle(realPosition, isMe)}`}
                                >
                                    <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center">
                                        {getIcon(realPosition)}
                                    </div>
                                    
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="font-cinzel font-bold truncate text-lg">
                                                {formatUserName(u.user_name)}
                                            </p>
                                            {isMe && <span className="text-[10px] font-bold bg-[#C5A059] text-black px-1.5 rounded flex-shrink-0">VOCÊ</span>}
                                        </div>
                                        <div className="flex items-center gap-2 text-xs opacity-80 font-bold uppercase tracking-wider">
                                            {activeTab === 'chapters' && <><BookOpen className="w-3 h-3"/> {u.total_chapters || 0} Capítulos</>}
                                            {activeTab === 'ebd' && <><GraduationCap className="w-3 h-3"/> {(u.total_ebd_read || 0) + (u.total_thematic_read || 0)} Estudos</>}
                                            {activeTab === 'quiz' && <><Brain className="w-3 h-3"/> {u.quiz_points || 0} Pontos</>}
                                        </div>
                                    </div>

                                    {realPosition === 0 && (
                                        <div className="text-xs font-bold bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full animate-pulse border border-yellow-200">
                                            LÍDER
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        
                        {users.length === 0 && (
                            <div className="text-center py-10 opacity-50 dark:text-gray-400">
                                <User className="w-16 h-16 mx-auto mb-2 text-gray-300" />
                                <p>Nenhum dado registrado ainda.</p>
                                <p className="text-xs">Seja o primeiro a pontuar!</p>
                            </div>
                        )}
                    </div>

                    {/* CONTROLES DE PAGINAÇÃO */}
                    {totalPages > 1 && (
                        <div className="flex justify-between items-center mt-8 pt-4 border-t border-[#C5A059]/20 px-2">
                            <button 
                                disabled={page === 0} 
                                onClick={() => { setPage(p => Math.max(0, p - 1)); window.scrollTo({top: 0, behavior: 'smooth'}); }}
                                className="flex items-center gap-1 text-sm font-bold text-[#8B0000] dark:text-[#ff6b6b] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#8B0000]/10 px-3 py-2 rounded-lg transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" /> Anterior
                            </button>
                            
                            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                                Pág {page + 1} de {totalPages}
                            </span>

                            <button 
                                disabled={page >= totalPages - 1} 
                                onClick={() => { setPage(p => Math.min(totalPages - 1, p + 1)); window.scrollTo({top: 0, behavior: 'smooth'}); }}
                                className="flex items-center gap-1 text-sm font-bold text-[#8B0000] dark:text-[#ff6b6b] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#8B0000]/10 px-3 py-2 rounded-lg transition-colors"
                            >
                                Próximo <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    </div>
  );
}
