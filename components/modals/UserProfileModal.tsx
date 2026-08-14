import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    X, Trophy, Medal, Crown, Star, Sparkles, BookOpen, GraduationCap, 
    Shield, Swords, Award, Flame, CheckCircle2, Lock, 
    Layers, HeartHandshake, Compass, Zap, HelpCircle, Highlighter, Share2, 
    User, ArrowUpRight
} from 'lucide-react';
import { 
    ACHIEVEMENTS, 
    calculateUserStats, 
    calculateTotalXP, 
    getUserRank, 
    Achievement, 
    GamificationStats 
} from '../../services/gamificationService';

interface UserProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: any;
    userProgress: any;
    onNavigateToArena?: () => void;
    onShowToast?: (msg: string, type: 'info' | 'success' | 'error') => void;
}

export default function UserProfileModal({
    isOpen,
    onClose,
    user,
    userProgress,
    onNavigateToArena,
    onShowToast
}: UserProfileModalProps) {
    const [selectedCategory, setSelectedCategory] = useState<'all' | 'reading' | 'ebd' | 'thematic' | 'quiz' | 'duel' | 'special'>('all');
    const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);

    if (!isOpen) return null;

    const stats: GamificationStats = calculateUserStats(userProgress);
    const totalXp = calculateTotalXP(stats);
    const rank = getUserRank(totalXp);

    const userName = user?.user_name || user?.name || userProgress?.user_name || 'Estudante da Palavra';
    const userEmail = user?.user_email || user?.email || userProgress?.user_email || '';

    const unlockedCount = ACHIEVEMENTS.filter(a => a.checkUnlocked(stats)).length;
    const totalAchievements = ACHIEVEMENTS.length;

    const filteredAchievements = ACHIEVEMENTS.filter(
        a => selectedCategory === 'all' || a.category === selectedCategory
    );

    const renderTierBadge = (tier: string) => {
        switch (tier) {
            case 'diamond':
                return <span className="px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] font-black uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">Diamante</span>;
            case 'gold':
                return <span className="px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">Ouro</span>;
            case 'silver':
                return <span className="px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] font-black uppercase tracking-wider bg-slate-300/20 text-slate-300 border border-slate-300/40">Prata</span>;
            default:
                return <span className="px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] font-black uppercase tracking-wider bg-orange-700/20 text-orange-300 border border-orange-700/40">Bronze</span>;
        }
    };

    const getAchievementIcon = (iconName: string, isUnlocked: boolean, tier: string) => {
        const iconClass = `w-4 h-4 sm:w-5 sm:h-5 ${
            isUnlocked 
                ? tier === 'diamond' ? 'text-cyan-400' : tier === 'gold' ? 'text-amber-400' : tier === 'silver' ? 'text-slate-300' : 'text-orange-400'
                : 'text-gray-500'
        }`;

        switch (iconName) {
            case 'BookOpen': return <BookOpen className={iconClass} />;
            case 'GraduationCap': return <GraduationCap className={iconClass} />;
            case 'Crown': return <Crown className={iconClass} />;
            case 'Star': return <Star className={iconClass} />;
            case 'Shield': case 'ShieldAlert': return <Shield className={iconClass} />;
            case 'Swords': return <Swords className={iconClass} />;
            case 'Award': return <Award className={iconClass} />;
            case 'Flame': return <Flame className={iconClass} />;
            case 'Sparkles': return <Sparkles className={iconClass} />;
            case 'FileText': case 'Layers': return <Layers className={iconClass} />;
            case 'HeartHandshake': return <HeartHandshake className={iconClass} />;
            case 'Compass': return <Compass className={iconClass} />;
            case 'Zap': return <Zap className={iconClass} />;
            case 'HelpCircle': case 'Brain': return <HelpCircle className={iconClass} />;
            case 'Highlighter': return <Highlighter className={iconClass} />;
            case 'Trophy': return <Trophy className={iconClass} />;
            default: return <Medal className={iconClass} />;
        }
    };

    const handleShareProfile = async () => {
        const text = `🏆 *Meu Perfil Bíblia ADMA*\n👤 Aluno: ${userName}\n⭐ Nível ${rank.currentLevel} - ${rank.title}\n✨ XP Total: ${totalXp.toLocaleString('pt-BR')} XP\n🎖️ Conquistas: ${unlockedCount}/${totalAchievements}\n⚔️ Vitórias em Duelos: ${stats.duelWins}`;
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Meu Perfil Bíblia ADMA',
                    text: text,
                });
            } catch (e) {}
        } else {
            navigator.clipboard.writeText(text);
            if (onShowToast) onShowToast('Resumo do perfil copiado!', 'success');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] sm:p-4 md:p-6 overflow-hidden">
            <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                className="absolute inset-0 bg-black/85 backdrop-blur-sm" 
                onClick={onClose} 
            />

            <motion.div 
                initial={{ scale: 0.95, y: 15, opacity: 0 }} 
                animate={{ scale: 1, y: 0, opacity: 1 }} 
                exit={{ scale: 0.95, y: 15, opacity: 0 }} 
                className="bg-[#121214] text-white w-full max-w-lg max-h-[calc(100vh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-1.5rem)] rounded-[24px] sm:rounded-[32px] border border-[#C5A059]/40 shadow-2xl relative z-10 flex flex-col overflow-hidden"
            >
                {/* CABEÇALHO COMPACTO E NOBRE */}
                <div className="relative p-4 sm:p-5 bg-gradient-to-b from-[#8B0000]/70 via-[#1C0D0D] to-[#121214] border-b border-amber-500/20 shrink-0">
                    <button 
                        onClick={onClose} 
                        className="absolute top-3.5 right-3.5 p-1.5 rounded-full bg-black/40 hover:bg-white/20 text-gray-300 hover:text-white transition-all border border-white/10 shadow-sm"
                        aria-label="Fechar"
                    >
                        <X className="w-4 h-4" />
                    </button>

                    <div className="flex items-center gap-3.5 sm:gap-4 pr-7">
                        {/* AVATAR COM RANK */}
                        <div className="relative shrink-0">
                            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-[#C5A059] to-[#8B0000] p-0.5 shadow-lg flex items-center justify-center">
                                <div className="w-full h-full rounded-full bg-[#1A0A0A] flex items-center justify-center overflow-hidden">
                                    <User className="w-7 h-7 sm:w-8 sm:h-8 text-[#C5A059]" />
                                </div>
                            </div>
                            <div className="absolute -bottom-1 -right-1 bg-gradient-to-r from-[#C5A059] to-[#E5C175] text-[#120808] font-black text-[10px] sm:text-xs px-1.5 py-0.2 rounded-full shadow-md border border-black/40 flex items-center gap-0.5 font-mono">
                                <Crown className="w-2.5 h-2.5" /> {rank.currentLevel}
                            </div>
                        </div>

                        {/* INFO DO USUÁRIO */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <h2 className="font-cinzel text-base sm:text-lg font-black text-white truncate tracking-tight">{userName}</h2>
                                <button 
                                    onClick={handleShareProfile}
                                    className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-all text-xs shrink-0"
                                    title="Compartilhar Perfil"
                                >
                                    <Share2 className="w-3 h-3" />
                                </button>
                            </div>
                            <p className="font-montserrat text-[11px] sm:text-xs text-[#C5A059] font-bold tracking-wider uppercase flex items-center gap-1 mt-0.5">
                                <Sparkles className="w-3 h-3 shrink-0" /> <span className="truncate">{rank.title}</span>
                            </p>
                            {userEmail && (
                                <p className="text-[10px] text-gray-400 font-mono truncate">{userEmail}</p>
                            )}
                        </div>
                    </div>

                    {/* BARRA DE PROGRESSO DE XP */}
                    <div className="mt-3 bg-black/40 p-2.5 rounded-xl border border-white/5 space-y-1.5">
                        <div className="flex justify-between items-center text-[11px]">
                            <span className="font-montserrat font-bold text-gray-200 flex items-center gap-1">
                                <Star className="w-3.5 h-3.5 text-amber-400 fill-current" /> {totalXp.toLocaleString('pt-BR')} XP Total
                            </span>
                            <span className="text-[10px] text-gray-400 font-mono font-bold">
                                Nv. {rank.currentLevel + 1}: {rank.nextRankXp.toLocaleString('pt-BR')} XP ({rank.percent.toFixed(0)}%)
                            </span>
                        </div>
                        <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden p-0.5">
                            <motion.div 
                                initial={{ width: 0 }} 
                                animate={{ width: `${Math.min(100, Math.max(5, rank.percent))}%` }} 
                                className="h-full rounded-full bg-gradient-to-r from-[#8B0000] via-[#C5A059] to-yellow-300 shadow-[0_0_8px_rgba(197,160,89,0.5)]" 
                            />
                        </div>
                    </div>
                </div>

                {/* CORPO ROLÁVEL COM SCROLLBAR ELEGANTE */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 space-y-3 p-3 sm:p-4">
                    
                    {/* RESUMO DE ESTATÍSTICAS E DUELOS (GRID 4 COLUNAS COMPACTO) */}
                    <div className="grid grid-cols-4 gap-2 text-center">
                        <div className="bg-black/35 p-2 rounded-xl border border-white/5 flex flex-col justify-center">
                            <div className="font-montserrat text-[8px] sm:text-[9px] text-gray-400 uppercase font-black tracking-wider truncate">Capítulos</div>
                            <div className="font-cinzel text-sm sm:text-base font-black text-white mt-0.5">{stats.chaptersRead}</div>
                        </div>
                        <div className="bg-black/35 p-2 rounded-xl border border-white/5 flex flex-col justify-center">
                            <div className="font-montserrat text-[8px] sm:text-[9px] text-gray-400 uppercase font-black tracking-wider truncate">EBD & Estudos</div>
                            <div className="font-cinzel text-sm sm:text-base font-black text-[#C5A059] mt-0.5">{stats.ebdRead + stats.thematicRead}</div>
                        </div>
                        <div className="bg-black/35 p-2 rounded-xl border border-white/5 flex flex-col justify-center">
                            <div className="font-montserrat text-[8px] sm:text-[9px] text-gray-400 uppercase font-black tracking-wider truncate">Pts Quiz</div>
                            <div className="font-cinzel text-sm sm:text-base font-black text-cyan-400 mt-0.5">{stats.quizPoints}</div>
                        </div>
                        <div className="bg-black/35 p-2 rounded-xl border border-white/5 flex flex-col justify-center">
                            <div className="font-montserrat text-[8px] sm:text-[9px] text-gray-400 uppercase font-black tracking-wider truncate">Duelos V/D</div>
                            <div className="font-cinzel text-sm sm:text-base font-black text-emerald-400 mt-0.5">{stats.duelWins} / {stats.duelLosses}</div>
                        </div>
                    </div>

                    {/* BANNER DA ARENA DE DUELOS */}
                    {onNavigateToArena && (
                        <div className="p-3 rounded-2xl bg-gradient-to-r from-amber-500/15 via-[#8B0000]/25 to-black border border-amber-500/30 flex items-center justify-between gap-2.5 shadow-md">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-[#8B0000] flex items-center justify-center shadow-sm text-white shrink-0">
                                    <Swords className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                    <h4 className="font-cinzel font-bold text-xs sm:text-sm text-white truncate">Arena de Duelos Bíblicos</h4>
                                    <p className="text-[10px] sm:text-[11px] text-gray-300 truncate">Desafie outros irmãos online em 180s!</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => {
                                    onClose();
                                    onNavigateToArena();
                                }} 
                                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#C5A059] to-[#8B0000] text-white font-cinzel font-black text-xs flex items-center gap-1 shadow hover:scale-105 active:scale-95 transition-all shrink-0"
                            >
                                Entrar <ArrowUpRight className="w-3 h-3" />
                            </button>
                        </div>
                    )}

                    {/* FILTROS DE CATEGORIAS DE CONQUISTAS */}
                    <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between pb-1 border-b border-white/5">
                            <h3 className="font-cinzel text-xs font-black text-[#C5A059] uppercase tracking-wider flex items-center gap-1.5">
                                <Award className="w-3.5 h-3.5" /> Conquistas Teológicas
                            </h3>
                            <span className="text-[10px] font-mono text-gray-300 font-bold bg-white/5 px-2 py-0.5 rounded-md">
                                <strong className="text-amber-400">{unlockedCount}</strong> / {totalAchievements}
                            </span>
                        </div>

                        {/* CARROSSEL DE CATEGORIAS */}
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 pt-0.5 no-scrollbar scroll-smooth">
                            {[
                                { id: 'all', label: 'Todas' },
                                { id: 'reading', label: 'Leitura' },
                                { id: 'ebd', label: 'EBD' },
                                { id: 'thematic', label: 'Temáticas' },
                                { id: 'quiz', label: 'Quiz' },
                                { id: 'duel', label: 'Duelos' },
                                { id: 'special', label: 'Especiais' },
                            ].map((cat) => (
                                <button
                                    key={cat.id}
                                    onClick={() => setSelectedCategory(cat.id as any)}
                                    className={`px-2.5 py-1 rounded-lg font-montserrat font-bold text-[10px] transition-all whitespace-nowrap shrink-0 ${
                                        selectedCategory === cat.id
                                            ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-black shadow-sm font-black'
                                            : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                                    }`}
                                >
                                    {cat.label}
                                </button>
                            ))}
                        </div>

                        {/* LISTAGEM DE CONQUISTAS */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                            {filteredAchievements.map((ach) => {
                                const isUnlocked = ach.checkUnlocked(stats);
                                const progress = ach.progressCalc ? ach.progressCalc(stats) : null;

                                return (
                                    <div
                                        key={ach.id}
                                        className={`p-2.5 sm:p-3 rounded-xl border transition-all flex items-start gap-2.5 relative overflow-hidden ${
                                            isUnlocked
                                                ? 'bg-gradient-to-br from-white/10 via-white/5 to-black/30 border-[#C5A059]/40 shadow-sm'
                                                : 'bg-black/40 border-white/5 opacity-55'
                                        }`}
                                    >
                                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                            isUnlocked
                                                ? 'bg-gradient-to-br from-amber-500/20 to-transparent border border-amber-500/30 shadow-inner'
                                                : 'bg-white/5 border border-white/5'
                                        }`}>
                                            {getAchievementIcon(ach.iconName, isUnlocked, ach.tier)}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-1 mb-0.5">
                                                <h4 className={`font-cinzel text-[11px] sm:text-xs font-bold truncate ${isUnlocked ? 'text-white' : 'text-gray-400'}`}>
                                                    {ach.title}
                                                </h4>
                                                {renderTierBadge(ach.tier)}
                                            </div>

                                            <p className="text-[10px] text-gray-400 line-clamp-2 leading-relaxed">
                                                {ach.description}
                                            </p>

                                            {/* BARRA DE PROGRESSO INDIVIDUAL DA CONQUISTA */}
                                            {progress && (
                                                <div className="mt-1.5 space-y-0.5">
                                                    <div className="flex justify-between text-[8px] font-mono text-gray-400">
                                                        <span>{isUnlocked ? 'Concluída' : 'Progresso'}</span>
                                                        <span>{progress.current} / {progress.total}</span>
                                                    </div>
                                                    <div className="w-full bg-white/10 rounded-full h-1 overflow-hidden">
                                                        <div 
                                                            className={`h-full rounded-full ${isUnlocked ? 'bg-[#C5A059]' : 'bg-white/30'}`} 
                                                            style={{ width: `${Math.min(100, (progress.current / progress.total) * 100)}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            <div className="mt-1.5 flex items-center justify-between text-[9px]">
                                                <span className="text-amber-400 font-bold font-mono">
                                                    +{ach.xpReward} XP
                                                </span>
                                                {isUnlocked ? (
                                                    <span className="text-emerald-400 font-bold flex items-center gap-0.5">
                                                        <CheckCircle2 className="w-2.5 h-2.5" /> Desbloqueada
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-500 flex items-center gap-0.5">
                                                        <Lock className="w-2.5 h-2.5" /> Bloqueada
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* RODAPÉ ELEGANTE E COMPACTO */}
                <div className="p-3 bg-black/60 border-t border-white/10 flex justify-end shrink-0">
                    <button
                        onClick={onClose}
                        className="w-full sm:w-auto px-5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-cinzel font-black text-xs tracking-wider transition-all"
                    >
                        FECHAR
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
