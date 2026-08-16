import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Swords, Clock, Trophy, ArrowLeft, CheckCircle2, XCircle, 
    Sparkles, Crown, Shield, Award, User, RefreshCw, Flame, BookOpen
} from 'lucide-react';
import { DuelInvite, challengeService } from '../../services/challengeService';
import { db } from '../../services/database';

interface ChallengeArenaProps {
    invite: DuelInvite;
    currentUserEmail: string;
    currentUserName: string;
    opponentScoreInfo: { inviteId: string, score: number, timeSeconds: number } | null;
    onClose: () => void;
    onShowToast: (msg: string, type: 'info' | 'success' | 'error') => void;
    onUpdateUserProgress?: (newProgress: any) => void;
}

export default function ChallengeArena({
    invite,
    currentUserEmail,
    currentUserName,
    opponentScoreInfo,
    onClose,
    onShowToast,
    onUpdateUserProgress
}: ChallengeArenaProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedOption, setSelectedOption] = useState<number | null>(null);
    const [answers, setAnswers] = useState<(number | null)[]>(new Array(invite.questions.length).fill(null));
    const [timeLeft, setTimeLeft] = useState(180); // 180 segundos (3 minutos)
    const [isFinished, setIsFinished] = useState(false);
    const [score, setScore] = useState(0);
    const [timeTaken, setTimeTaken] = useState(0);
    const [showExplanation, setShowExplanation] = useState(false);
    const [xpProcessed, setXpProcessed] = useState(false);

    // Countdown de 5s para começar junto de forma sincronizada
    const [startCountdown, setStartCountdown] = useState(5);
    const [isCountdownActive, setIsCountdownActive] = useState(true);

    // Evitar stale closures usando Refs para timeLeft e answers
    const timeLeftRef = useRef(180);
    const answersRef = useRef(answers);

    useEffect(() => {
        timeLeftRef.current = timeLeft;
    }, [timeLeft]);

    useEffect(() => {
        answersRef.current = answers;
    }, [answers]);

    const questions = invite.questions;
    const currentQ = questions[currentIndex];
    const isSender = (invite.senderEmail || '').toLowerCase() === (currentUserEmail || '').toLowerCase().trim();
    const opponentEmail = isSender ? invite.receiverEmail : invite.senderEmail;
    const opponentName = isSender ? invite.receiverName : invite.senderName;
    
    // Corrige detecção de bot para não considerar emails reais @adma.local como bots
    const isSoloDuel = 
        (opponentEmail || '').includes('bot') || 
        opponentEmail === 'mestre.ebd@adma.local' ||
        (opponentEmail || '').toLowerCase() === (currentUserEmail || '').toLowerCase().trim();
    
    // Estado local para pontuação do oponente para podermos pollar de forma reativa
    const [localOpponentScore, setLocalOpponentScore] = useState<{ inviteId: string, score: number, timeSeconds: number } | null>(opponentScoreInfo);

    useEffect(() => {
        if (opponentScoreInfo) {
            setLocalOpponentScore(opponentScoreInfo);
        }
    }, [opponentScoreInfo]);

    // Polling do status do duelo após finalizar para garantir sincronização instantânea
    useEffect(() => {
        if (!isFinished || isSoloDuel || localOpponentScore) return;

        const pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/duel-status?inviteId=${invite.id}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.invite) {
                        const inv = data.invite;
                        const oppEmail = (opponentEmail || '').toLowerCase().trim();
                        const isOppSender = (inv.senderEmail || '').toLowerCase().trim() === oppEmail;
                        const oppScore = isOppSender ? inv.senderScore : inv.receiverScore;
                        const oppTime = isOppSender ? inv.senderTimeSeconds : inv.receiverTimeSeconds;

                        if (oppScore !== undefined && oppScore !== null) {
                            setLocalOpponentScore({
                                inviteId: invite.id,
                                score: oppScore,
                                timeSeconds: oppTime ?? 90
                            });
                        }
                    }
                }
            } catch (err) {
                console.error("Erro ao pollar status do duelo:", err);
            }
        }, 3000);

        return () => clearInterval(pollInterval);
    }, [isFinished, isSoloDuel, localOpponentScore, invite.id, opponentEmail]);

    // Se for duelo solo, o bot não envia score, então criamos um falso quando o player terminar
    const effectiveOpponentScore = isSoloDuel && isFinished 
        ? { inviteId: invite.id, score: Math.floor(questions.length * 0.4) * 10, timeSeconds: 90 } 
        : localOpponentScore;

    // Processa o XP APENAS quando tivermos os dois scores e apenas se houver um vencedor
    useEffect(() => {
        if (!isFinished || !effectiveOpponentScore || xpProcessed) return;

        const processXp = async () => {
            setXpProcessed(true);

            // Duelos solos (com bot) não dão XP e não contam para o ranking de vitórias
            if (isSoloDuel) return;

            const isWinner = score > effectiveOpponentScore.score || 
                            (score === effectiveOpponentScore.score && timeTaken < effectiveOpponentScore.timeSeconds);

            const xpEarned = isWinner ? score * 2 + 50 : 0;
            
            try {
                const profiles = await db.entities.ReadingProgress.filter({ user_email: currentUserEmail });
                if (profiles && profiles.length > 0) {
                    const userP = profiles[0];
                    const currentWins = userP.duel_wins || 0;
                    const currentLosses = userP.duel_losses || 0;
                    const currentMatches = userP.duel_matches || 0;
                    const currentDuelPoints = userP.duel_points || 0;

                    const updated = {
                        ...userP,
                        duel_wins: isWinner ? currentWins + 1 : currentWins,
                        duel_losses: !isWinner ? currentLosses + 1 : currentLosses,
                        duel_matches: currentMatches + 1,
                        duel_points: currentDuelPoints + xpEarned,
                    };

                    await db.entities.ReadingProgress.update(userP.id, updated);
                    if (onUpdateUserProgress) onUpdateUserProgress(updated);
                }
            } catch (e) {
                console.error("Erro ao atualizar estatísticas do duelo:", e);
            }
        };

        processXp();
    }, [isFinished, effectiveOpponentScore, xpProcessed, score, timeTaken, currentUserEmail, isSoloDuel, onUpdateUserProgress]);

    // Timer regressivo do countdown de início (5s)
    useEffect(() => {
        if (!isCountdownActive) return;

        const timer = setInterval(() => {
            setStartCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    setIsCountdownActive(false);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [isCountdownActive]);

    // Timer regressivo de 180 segundos para responder
    useEffect(() => {
        if (isFinished || isCountdownActive) return;

        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    handleFinishDuel();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [isFinished, isCountdownActive]);

    const handleSelectOption = (index: number) => {
        if (selectedOption !== null || isFinished || isCountdownActive) return; // Trava após escolher

        setSelectedOption(index);
        const newAnswers = [...answers];
        newAnswers[currentIndex] = index;
        setAnswers(newAnswers);

        // Verifica acerto
        const isCorrect = index === currentQ.correctIndex;
        if (isCorrect) {
            setScore(prev => prev + 10);
        }

        setShowExplanation(true);
    };

    const handleNextQuestion = () => {
        setShowExplanation(false);
        setSelectedOption(null);

        if (currentIndex + 1 < questions.length) {
            setCurrentIndex(prev => prev + 1);
        } else {
            handleFinishDuel();
        }
    };

    const handleFinishDuel = async () => {
        setIsFinished(true);
        const finalTime = 180 - timeLeftRef.current;
        setTimeTaken(finalTime);

        const correctCount = answersRef.current.reduce((acc, ans, i) => (ans === questions[i].correctIndex ? acc + 1 : acc), 0);
        const finalScore = correctCount * 10;

        // Atualiza o duelo no serviço
        await challengeService.finishDuel(invite.id, {
            userEmail: currentUserEmail,
            score: finalScore,
            timeSeconds: finalTime
        });

        // Envia pontuação em tempo real para o oponente e atualiza o banco
        try {
            await fetch('/api/duel-score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    invite,
                    userEmail: currentUserEmail,
                    score: finalScore,
                    timeSeconds: finalTime
                })
            });
        } catch (e) {
            console.error("Erro ao enviar broadcast de score:", e);
        }

        onShowToast(`Duelo concluído! Aguardando oponente...`, 'info');
    };

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    return (
        <div className="fixed inset-0 z-50 bg-[#0F0505] text-white flex flex-col overflow-y-auto">
            {/* CABEÇALHO DA ARENA - COM SUPORTE A SAFE AREA NO IPHONE */}
            <div className="p-4 pt-[calc(env(safe-area-inset-top,0px)+1.25rem)] md:p-6 md:pt-6 bg-gradient-to-b from-[#8B0000] to-[#1F0707] border-b border-amber-500/30 flex items-center justify-between shadow-xl shrink-0">
                <button
                    onClick={onClose}
                    className="p-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-gray-200 hover:text-white flex items-center gap-1.5 text-xs font-montserrat font-bold transition-all shadow-sm"
                >
                    <ArrowLeft className="w-4 h-4" /> Sair
                </button>

                <div className="text-center">
                    <div className="flex items-center justify-center gap-1.5 font-cinzel font-black text-xs md:text-sm text-amber-400 tracking-widest uppercase">
                        <Swords className="w-4 h-4" /> Arena de Duelos ADMA
                    </div>
                    <div className="font-montserrat text-xs text-gray-300 mt-0.5">
                        {currentUserName} <span className="text-red-400 font-bold">VS</span> {opponentName}
                    </div>
                </div>

                {/* TIMER DE 180s */}
                <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 font-mono text-sm font-bold ${
                    timeLeft < 30 ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse' : 'bg-black/40 border-white/10 text-amber-400'
                }`}>
                    <Clock className="w-4 h-4" />
                    {formatTime(timeLeft)}
                </div>
            </div>

            {/* CONTEÚDO PRINCIPAL DA ARENA */}
            <div className="flex-1 max-w-3xl w-full mx-auto p-4 md:p-8 flex flex-col justify-center">
                {isCountdownActive ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-[#1C0D0D] p-10 rounded-[32px] border-2 border-amber-500/30 shadow-2xl text-center space-y-6 max-w-md mx-auto"
                    >
                        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-500 via-red-600 to-[#8B0000] text-white mx-auto flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.45)] animate-pulse">
                            <Swords className="w-12 h-12 text-amber-200 animate-bounce" />
                        </div>
                        <div className="space-y-2">
                            <h2 className="font-cinzel text-2xl font-black text-amber-400 tracking-wider">PREPARANDO ARENA</h2>
                            <p className="text-xs text-gray-300 font-montserrat uppercase tracking-widest">
                                Concentre-se! O duelo começa em:
                            </p>
                        </div>
                        
                        <div className="py-4">
                            <motion.span
                                key={startCountdown}
                                initial={{ scale: 0.3, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className="font-cinzel text-7xl font-black text-white block drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)]"
                            >
                                {startCountdown}
                            </motion.span>
                        </div>

                        <div className="text-[11px] text-amber-300/80 font-mono tracking-wider animate-pulse uppercase">
                            Disputa de {invite.book} • 10 Perguntas
                        </div>
                    </motion.div>
                ) : !isFinished ? (
                    <div className="space-y-6">
                        {/* PROGRESSO DE PERGUNTAS */}
                        <div className="flex items-center justify-between text-xs font-montserrat text-gray-400">
                            <span className="font-bold text-amber-400 uppercase tracking-wider">
                                Livro: {invite.book}
                            </span>
                            <span>Pergunta {currentIndex + 1} de {questions.length}</span>
                        </div>

                        <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                            <div 
                                className="h-full bg-gradient-to-r from-amber-500 to-[#8B0000] transition-all duration-300"
                                style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
                            />
                        </div>

                        {/* ENUNCIADO */}
                        <motion.div
                            key={currentQ.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-[#1C0D0D] p-6 md:p-8 rounded-[28px] border border-amber-500/20 shadow-2xl space-y-5"
                        >
                            {/* DESTAQUE DA REFERÊNCIA BÍBLICA / CAPÍTULO */}
                            <div className="flex items-center justify-between pb-3 border-b border-amber-500/20">
                                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/25 via-amber-500/10 to-transparent border border-amber-500/40 text-amber-300 font-cinzel font-black text-xs md:text-sm tracking-wider shadow-sm">
                                    <BookOpen className="w-4 h-4 text-amber-400 shrink-0" />
                                    <span>REFERÊNCIA: <strong className="text-white uppercase underline decoration-amber-400/60 underline-offset-4">{currentQ.chapterRef || `Livro de ${invite.book}`}</strong></span>
                                </div>
                                <span className="text-[11px] font-mono font-bold text-amber-400/90 bg-black/40 px-2.5 py-1 rounded-lg border border-amber-500/20">
                                    Q{currentIndex + 1} de {questions.length}
                                </span>
                            </div>

                            <h3 className="font-cinzel text-lg md:text-xl font-bold text-white leading-relaxed pt-1">
                                {currentQ.text}
                            </h3>

                            {/* OPÇÕES */}
                            <div className="space-y-3 pt-2">
                                {currentQ.options.map((option, idx) => {
                                    let optionStyle = 'bg-white/5 border-white/10 text-gray-200 hover:bg-white/10 hover:border-amber-500/40';

                                    if (selectedOption !== null) {
                                        if (idx === currentQ.correctIndex) {
                                            optionStyle = 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)]';
                                        } else if (idx === selectedOption) {
                                            optionStyle = 'bg-red-500/20 border-red-500 text-red-300';
                                        } else {
                                            optionStyle = 'bg-black/40 border-white/5 text-gray-500 opacity-50';
                                        }
                                    }

                                    return (
                                        <button
                                            key={idx}
                                            disabled={selectedOption !== null}
                                            onClick={() => handleSelectOption(idx)}
                                            className={`w-full p-4 rounded-2xl border text-left font-montserrat text-sm transition-all duration-200 flex items-center justify-between ${optionStyle}`}
                                        >
                                            <span className="flex-1 pr-3">{option}</span>
                                            {selectedOption !== null && idx === currentQ.correctIndex && (
                                                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                                            )}
                                            {selectedOption !== null && idx === selectedOption && idx !== currentQ.correctIndex && (
                                                <XCircle className="w-5 h-5 text-red-400 shrink-0" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* EXPLICAÇÃO / PROOF TEXT */}
                            {showExplanation && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    className="p-4 bg-black/40 rounded-2xl border border-amber-500/30 text-xs text-amber-200/90 leading-relaxed font-serif"
                                >
                                    <div className="font-bold text-amber-400 uppercase font-sans text-[10px] mb-1 flex items-center gap-1">
                                        <Sparkles className="w-3.5 h-3.5" /> Justificativa Bíblica:
                                    </div>
                                    {currentQ.proofText}
                                </motion.div>
                            )}

                            {selectedOption !== null && (
                                <div className="pt-2 flex justify-end">
                                    <button
                                        onClick={handleNextQuestion}
                                        className="px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-[#8B0000] text-white font-cinzel font-bold text-xs tracking-wider shadow-lg hover:scale-105 active:scale-95 transition-all"
                                    >
                                        {currentIndex + 1 < questions.length ? 'PRÓXIMA PERGUNTA' : 'FINALIZAR DUELO'}
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    </div>
                ) : (
                    /* TELA FINAL DE RESULTADO */
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-[#1C0D0D] p-8 rounded-[32px] border border-amber-500/40 shadow-2xl text-center space-y-6"
                    >
                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-500 to-yellow-300 text-black mx-auto flex items-center justify-center shadow-2xl">
                            <Trophy className="w-10 h-10" />
                        </div>

                        <div className="space-y-1">
                            <h2 className="font-cinzel text-3xl font-black text-white">Duelo Concluído!</h2>
                            <p className="text-sm text-gray-300">
                                Veja o seu desempenho no desafio de <span className="text-amber-400 font-bold">{invite.book}</span>:
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto">
                            <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
                                <div className="text-[10px] text-gray-400 uppercase font-montserrat font-bold">Sua Pontuação</div>
                                <div className="font-cinzel text-2xl font-black text-amber-400 mt-1">{score} Pts</div>
                            </div>
                            <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
                                <div className="text-[10px] text-gray-400 uppercase font-montserrat font-bold">Seu Tempo</div>
                                <div className="font-cinzel text-2xl font-black text-white mt-1">{formatTime(timeTaken)}</div>
                            </div>
                        </div>

                        {effectiveOpponentScore ? (
                            <div className="mt-6 border-t border-white/10 pt-6">
                                <h3 className="font-cinzel text-sm text-gray-300 mb-4">Desempenho de {opponentName}</h3>
                                <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto">
                                    <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
                                        <div className="text-[10px] text-gray-400 uppercase font-montserrat font-bold">Pontuação</div>
                                        <div className="font-cinzel text-2xl font-black text-amber-400 mt-1">{effectiveOpponentScore.score} Pts</div>
                                    </div>
                                    <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
                                        <div className="text-[10px] text-gray-400 uppercase font-montserrat font-bold">Tempo Gasto</div>
                                        <div className="font-cinzel text-2xl font-black text-white mt-1">{formatTime(effectiveOpponentScore.timeSeconds)}</div>
                                    </div>
                                </div>
                                
                                <div className="mt-6 font-cinzel text-2xl font-black">
                                    {score > effectiveOpponentScore.score || (score === effectiveOpponentScore.score && timeTaken < effectiveOpponentScore.timeSeconds) ? (
                                        <span className="text-emerald-400 flex justify-center items-center gap-2"><Crown className="w-8 h-8"/> VOCÊ VENCEU!</span>
                                    ) : score < effectiveOpponentScore.score || (score === effectiveOpponentScore.score && timeTaken > effectiveOpponentScore.timeSeconds) ? (
                                        <span className="text-red-400 flex justify-center items-center gap-2">VOCÊ PERDEU</span>
                                    ) : (
                                        <span className="text-blue-400 flex justify-center items-center gap-2">EMPATE TÉCNICO!</span>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="mt-6 border-t border-white/10 pt-6 text-center">
                                <div className="inline-flex items-center gap-2 text-amber-400 text-sm font-bold animate-pulse">
                                    <RefreshCw className="w-4 h-4 animate-spin" /> Aguardando {opponentName} terminar...
                                </div>
                            </div>
                        )}

                        {!isSoloDuel && effectiveOpponentScore && (score > effectiveOpponentScore.score || (score === effectiveOpponentScore.score && timeTaken < effectiveOpponentScore.timeSeconds)) && (
                            <div className="p-4 bg-amber-500/10 rounded-2xl border border-amber-500/20 text-xs text-amber-300 font-mono mt-4">
                                ✨ +{score * 2 + 50} XP concedidos pela vitória!
                            </div>
                        )}
                        {isSoloDuel && (
                            <div className="p-4 bg-blue-500/10 rounded-2xl border border-blue-500/20 text-xs text-blue-300 font-mono mt-4">
                                ℹ️ Duelos de treino (Solo/Bot) não concedem XP.
                            </div>
                        )}

                        <div className="pt-4">
                            <button
                                onClick={onClose}
                                className="px-8 py-3.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-cinzel font-bold text-xs tracking-wider transition-all"
                            >
                                VOLTAR AO APP
                            </button>
                        </div>
                    </motion.div>
                )}
            </div>
        </div>
    );
}
