import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    X, Trophy, Medal, Crown, Star, Sparkles, BookOpen, GraduationCap, 
    Shield, Swords, Award, Flame, CheckCircle2, Lock, Flame as FireIcon, 
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

    const userName = user?.user_name || userProgress?.user_name || 'Estudante da Palavra';
    const userEmail = user?.user_email || userProgress?.user_email || '';

    const unlockedCount = ACHIEVEMENTS.filter(a => a.checkUnlocked(stats)).length;
    const totalAchievements = ACHIEVEMENTS.length;

    const filteredAchievements = selectedAchievement
        ? ACHIEVEMENTS.filter(a => selectedCategory === 'all' || a.category === selectedCategory)
        : ACHIEVEMENTS.filter(a => selectedCategory === 'all' || a.category === selectedCategory);

    const renderTierBadge = (tier: string) => {
        switch (tier) {
            case 'diamond':
                return <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">Diamante</span>;
            case 'gold':
                return <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/40">Ouro</span>;
            case 'silver':
                return <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-slate-300/20 text-slate-300 border border-slate-300/40">Prata</span>;
            default:
                return <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-orange-700/20 text-orange-400 border border-orange-700/40">Bronze</span>;
        }
    };

    const getAchievementIcon = (iconName: string, isUnlocked: boolean, tier: string) => {
        const iconClass = `w-5 h-5 ${
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 overflow-hidden">
            <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                className="absolute inset-0 bg-black/90 backdrop-blur-md" 
                onClick={onClose} 
            />

            <motion.div 
                initial={{ scale: 0.92, y: 20, opacity: 0 }} 
                animate={{ scale: 1, y: 0, opacity: 1 }} 
                exit={{ scale: 0.92, y: 20, opacity: 0 }} 
                className="bg-[#121214] text-white w-full max-w-2xl max-h-[92vh] rounded-[32px] border border-[#C5A059]/40 shadow-2xl relative z-10 flex flex-col overflow-hidden"
            >
                {/* CABEÇALHO DO PERFIL */}
                <div className="relative p-6 bg-gradient-to-b from-[#8B0000]/60 via-[#1C0D0D] to-[#121214] border-b border-white/10">
                    <button 
                        onClick={onClose} 
                        className="absolute top-5 right-5 p-2 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-all"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    <div className="flex flex-col md:flex-row items-center gap-5">
                        {/* AVATAR COM RANK */}
                        <div className="relative">
                            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#C5A059] to-[#8B0000] p-1 shadow-2xl flex items-center justify-center">
                                <div className="w-full h-full rounded-full bg-[#1A0A0A] flex items-center justify-center overflow-hidden">
                                    <User className="w-12 h-12 text-[#C5A059]" />
                                </div>
                            </div>
                            <div className="absolute -bottom-2 -right-2 bg-gradient-to-r from-[#C5A059] to-[#E5C175] text-[#120808] font-black text-xs px-2.5 py-0.5 rounded-full shadow-lg border border-black/40 flex items-center gap-1 font-mono">
                                <Crown className="w-3 h-3" /> Nv.{rank.currentLevel}
                            </div>
                        </div>

                        {/* INFO DO USUÁRIO */}
                        <div className="flex-1 text-center md:text-left space-y-1">
                            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                                <h2 className="font-cinzel text-2xl font-black text-white tracking-tight">{userName}</h2>
                                <button 
                                    onClick={handleShareProfile}
                                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-all text-xs flex items-center gap-1"
                                    title="Compartilhar Perfil"
                                >
                                    <Share2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            <p className="font-montserrat text-xs text-[#C5A059] font-bold tracking-wider uppercase flex items-center justify-center md:justify-start gap-1.5">
                                <Sparkles className="w-3.5 h-3.5" /> {rank.title}
                            </p>
                            <p className="text-[11px] text-gray-400 font-mono">{userEmail}</p>
                        </div>
                    </div>

                    {/* BARRA DE PROGRESSO DE XP */}
                    <div className="mt-5 bg-black/40 p-3.5 rounded-2xl border border-white/5 space-y-2">
                        <div className="flex justify-between items-center text-xs">
                            <span className="font-montserrat font-bold text-gray-300 flex items-center gap-1.5">
                                <Star className="w-4 h-4 text-amber-400 fill-current" /> {totalXp.toLocaleString('pt-BR')} XP Total
                            </span>
                            <span className="text-[11px] text-gray-400 font-mono font-bold">
                                Próximo Nível: {rank.nextRankXp.toLocaleString('pt-BR')} XP ({rank.percent.toFixed(0)}%)
                            </span>
                        </div>
                        <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden p-0.5">
                            <motion.div 
                                initial={{ width: 0 }} 
                                animate={{ width: `${rank.percent}%` }} 
                                className="h-full rounded-full bg-gradient-to-r from-[#8B0000] via-[#C5A059] to-yellow-300 shadow-[0_0_12px_rgba(197,160,89,0.5)]" 
                            />
                        </div>
                    </div>
                </div>

                {/* RESUMO DE ESTATÍSTICAS E DUELOS */}
                <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-[#17171A] border-b border-white/5 text-center">
                    <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
                        <div className="font-montserrat text-[10px] text-gray-400 uppercase font-black tracking-wider">Capítulos</div>
                        <div className="font-cinzel text-xl font-black text-white mt-0.5">{stats.chaptersRead}</div>
                    </div>
                    <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
                        <div className="font-montserrat text-[10px] text-gray-400 uppercase font-black tracking-wider">Estudos EBD</div>
                        <div className="font-cinzel text-xl font-black text-[#C5A059] mt-0.5">{stats.ebdRead + stats.thematicRead}</div>
                    </div>
                    <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
                        <div className="font-montserrat text-[10px] text-gray-400 uppercase font-black tracking-wider">Pts de Quiz</div>
                        <div className="font-cinzel text-xl font-black text-cyan-400 mt-0.5">{stats.quizPoints}</div>
                    </div>
                    <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
                        <div className="font-montserrat text-[10px] text-gray-400 uppercase font-black tracking-wider">Duelos (V/D)</div>
                        <div className="font-cinzel text-xl font-black text-emerald-400 mt-0.5">{stats.duelWins} / {stats.duelLosses}</div>
                    </div>
                </div>

                {/* BANNER DE DESAFIOS (ARENA) */}
                {onNavigateToArena && (
                    <div className="p-4 bg-gradient-to-r from-[#8B0000]/30 to-amber-950/30 border-b border-amber-500/20 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-[#8B0000] flex items-center justify-center shadow-lg text-white">
                                <Swords className="w-5 h-5" />
                            </div>
                            <div>
                                <h4 className="font-cinzel font-bold text-sm text-white">Arena de Duelos Bíblicos</h4>
                                <p className="text-[11px] text-gray-300">Desafie outros irmãos online em quizzes de 180s!</p>
                            </div>
                        </div>
                        <button 
                            onClick={() => {
                                onClose();
                                onNavigateToArena();
                            }} 
                            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#C5A059] to-[#8B0000] text-white font-cinzel font-bold text-xs flex items-center gap-1 shadow-lg hover:scale-105 active:scale-95 transition-all"
                        >
                            Entrar <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}

                {/* ABAS DE CONQUISTAS */}
                <div className="p-4 border-b border-white/5 flex items-center justify-between gap-2 overflow-x-auto">
                    <div className="flex items-center gap-1.5 text-xs">
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
                                className={`px-3 py-1.5 rounded-xl font-montserrat font-bold text-[11px] transition-all whitespace-nowrap ${
                                    selectedCategory === cat.id
                                        ? 'bg-[#C5A059] text-black shadow-md'
                                        : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                                }`}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>

                    <div className="text-[11px] font-mono text-gray-400 font-bold whitespace-nowrap pl-2">
                        <span className="text-[#C5A059]">{unlockedCount}</span> / {totalAchievements}
                    </div>
                </div>

                {/* LISTAGEM DAS 36 MEDALHAS */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2.5 max-h-[350px]">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {filteredAchievements.map((ach) => {
                            const isUnlocked = ach.checkUnlocked(stats);
                            const progress = ach.progressCalc ? ach.progressCalc(stats) : null;

                            return (
                                <motion.div
                                    key={ach.id}
                                    whileHover={{ scale: 1.01 }}
                                    onClick={() => setSelectedAchievement(ach)}
                                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 relative overflow-hidden ${
                                        isUnlocked
                                            ? 'bg-gradient-to-br from-white/10 to-white/5 border-[#C5A059]/40 shadow-lg'
                                            : 'bg-black/40 border-white/5 opacity-60'
                                    }`}
                                >
                                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                                        isUnlocked
                                            ? 'bg-gradient-to-br from-white/15 to-transparent border border-white/10 shadow-inner'
                                            : 'bg-white/5 border border-white/5'
                                    }`}>
                                        {getAchievementIcon(ach.iconName, isUnlocked, ach.tier)}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-1 mb-0.5">
                                            <h4 className={`font-cinzel text-xs font-bold truncate ${isUnlocked ? 'text-white' : 'text-gray-400'}`}>
                                                {ach.title}
                                            </h4>
                                            {renderTierBadge(ach.tier)}
                                        </div>

                                        <p className="text-[11px] text-gray-400 line-clamp-2 leading-relaxed">
                                            {ach.description}
                                        </p>

                                        {/* BARRA DE PROGRESSO INDIVIDUAL DA CONQUISTA */}
                                        {progress && (
                                            <div className="mt-2 space-y-1">
                                                <div className="flex justify-between text-[9px] font-mono text-gray-400">
                                                    <span>{isUnlocked ? 'Concluída' : 'Em progresso'}</span>
                                                    <span>{progress.current} / {progress.total}</span>
                                                </div>
                                                <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                                                    <div 
                                                        className={`h-full rounded-full ${isUnlocked ? 'bg-[#C5A059]' : 'bg-white/40'}`} 
                                                        style={{ width: `${Math.min(100, (progress.current / progress.total) * 100)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        <div className="mt-2 flex items-center justify-between">
                                            <span className="text-[10px] text-amber-400 font-bold font-mono">
                                                +{ach.xpReward} XP
                                            </span>
                                            {isUnlocked ? (
                                                <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                                                    <CheckCircle2 className="w-3 h-3" /> Desbloqueada
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-gray-500 flex items-center gap-1">
                                                    <Lock className="w-3 h-3" /> Bloqueada
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>

                {/* RODAPÉ */}
                <div className="p-4 bg-black/50 border-t border-white/10 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-cinzel font-bold text-xs tracking-wider transition-all"
                    >
                        FECHAR
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
