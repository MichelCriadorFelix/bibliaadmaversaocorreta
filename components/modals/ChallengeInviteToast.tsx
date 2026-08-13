import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Swords, Check, X, Clock, Sparkles } from 'lucide-react';
import { DuelInvite, challengeService } from '../../services/challengeService';
import { getSupabase } from '../../services/presenceService';

interface ChallengeInviteToastProps {
    userEmail: string;
    onAcceptInvite: (invite: DuelInvite) => void;
    onShowToast?: (msg: string, type: 'info' | 'success' | 'error') => void;
}

export default function ChallengeInviteToast({
    userEmail,
    onAcceptInvite,
    onShowToast
}: ChallengeInviteToastProps) {
    const [currentInvite, setCurrentInvite] = useState<DuelInvite | null>(null);
    const [timeLeft, setTimeLeft] = useState(60);

    useEffect(() => {
        if (!userEmail) return;
        const supabase = getSupabase();
        if (!supabase) {
            console.warn('[ChallengeInviteToast] Supabase indisponível — convites em tempo real desabilitados.');
            return;
        }

        const cleanEmail = userEmail.toLowerCase().trim();
        const channel = supabase.channel(`adma_user_${cleanEmail}`);

        channel
            .on('broadcast', { event: 'duel_invite' }, ({ payload }) => {
                console.log('[ChallengeInviteToast] Convite recebido via broadcast:', payload);
                if (payload?.invite) {
                    setCurrentInvite(payload.invite);
                    setTimeLeft(60);
                }
            })
            .subscribe((status, err) => {
                console.log('[ChallengeInviteToast] Status do canal', `adma_user_${cleanEmail}`, ':', status, err || '');
            });

        return () => { 
            supabase.removeChannel(channel); 
        };
    }, [userEmail]);

    // Timer de 60 segundos para expirar o convite
    useEffect(() => {
        if (!currentInvite) return;

        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    challengeService.respondInvite(currentInvite.id, 'expired');
                    setCurrentInvite(null);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [currentInvite]);

    if (!currentInvite) return null;

    const handleAccept = async () => {
        await challengeService.respondInvite(currentInvite.id, 'accepted');
        onAcceptInvite(currentInvite);
        setCurrentInvite(null);
        if (onShowToast) onShowToast('Duelo aceito! Preparando arena...', 'success');
    };

    const handleDecline = async () => {
        await challengeService.respondInvite(currentInvite.id, 'declined');
        setCurrentInvite(null);
        if (onShowToast) onShowToast('Convite de duelo recusado.', 'info');
    };

    return (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4 pointer-events-auto">
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0, y: -40, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.9 }}
                    className="bg-[#1A0A0A] text-white p-4 rounded-2xl border-2 border-amber-500/80 shadow-[0_10px_35px_rgba(245,158,11,0.3)] relative overflow-hidden"
                >
                    {/* Barra de progresso de tempo */}
                    <div className="absolute top-0 left-0 right-0 h-1.5 bg-black/60 overflow-hidden">
                        <div 
                            className="h-full bg-gradient-to-r from-amber-500 to-red-500 transition-all duration-1000"
                            style={{ width: `${(timeLeft / 60) * 100}%` }}
                        />
                    </div>

                    <div className="flex items-center gap-3.5 pt-1">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-red-700 flex items-center justify-center shrink-0 shadow-lg text-white animate-pulse">
                            <Swords className="w-6 h-6" />
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 text-amber-400 font-cinzel text-xs font-bold uppercase tracking-wider">
                                <Sparkles className="w-3.5 h-3.5" /> Desafio de Duelo!
                            </div>
                            <h4 className="font-bold text-sm text-white truncate">
                                {currentInvite.senderName}
                            </h4>
                            <p className="text-[11px] text-gray-300">
                                Livro: <span className="font-semibold text-[#C5A059]">{currentInvite.book}</span> (10 Perguntas)
                            </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                            <button
                                onClick={handleAccept}
                                className="w-10 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-lg transition-transform active:scale-90"
                                title="Aceitar Duelo"
                            >
                                <Check className="w-5 h-5" />
                            </button>
                            <button
                                onClick={handleDecline}
                                className="w-10 h-10 rounded-xl bg-white/10 hover:bg-red-500/80 text-gray-300 hover:text-white flex items-center justify-center transition-all active:scale-90"
                                title="Recusar"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-white/10 flex justify-between items-center text-[10px] text-gray-400 font-mono">
                        <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-400" /> Responda em: {timeLeft}s
                        </span>
                        <span className="text-amber-300/80">Arena Bíblica ADMA</span>
                    </div>
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
