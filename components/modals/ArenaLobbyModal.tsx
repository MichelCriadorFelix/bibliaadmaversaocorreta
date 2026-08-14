import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Swords, X, Search, Sparkles, Crown, Zap, User, Clock, 
    BookOpen, CheckCircle2, Loader2, ArrowRight, ShieldCheck, Flame, Users, ChevronDown
} from 'lucide-react';
import { OnlineUser, DuelInvite, challengeService } from '../../services/challengeService';
import { presenceService } from '../../services/presenceService';

interface ArenaLobbyModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentUser: any;
    onStartDuel: (invite: DuelInvite) => void;
    onShowToast: (msg: string, type: 'info' | 'success' | 'error') => void;
}

const BIBLE_BOOKS = [
    'Bíblia Completa',
    'Gênesis', 'Êxodo', 'Levítico', 'Números', 'Deuteronômio',
    'Josué', 'Juízes', 'Rute', '1 Samuel', '2 Samuel', '1 Reis', '2 Reis',
    '1 Crônicas', '2 Crônicas', 'Esdras', 'Neemias', 'Ester',
    'Jó', 'Salmos', 'Provérbios', 'Eclesiastes', 'Cantares',
    'Isaías', 'Jeremias', 'Lamentações', 'Ezequiel', 'Daniel',
    'Oséias', 'Joel', 'Amós', 'Obadias', 'Jonas', 'Miquéias',
    'Naum', 'Habacuque', 'Sofonias', 'Ageu', 'Zacarias', 'Malaquias',
    'Mateus', 'Marcos', 'Lucas', 'João', 'Atos',
    'Romanos', '1 Coríntios', '2 Coríntios', 'Gálatas', 'Efésios',
    'Filipenses', 'Colossenses', '1 Tessalonicenses', '2 Tessalonicenses',
    '1 Timóteo', '2 Timóteo', 'Tito', 'Filemom',
    'Hebreus', 'Tiago', '1 Pedro', '2 Pedro', '1 João', '2 João', '3 João',
    'Judas', 'Apocalipse'
];

export default function ArenaLobbyModal({
    isOpen,
    onClose,
    currentUser,
    onStartDuel,
    onShowToast
}: ArenaLobbyModalProps) {
    const [challengers, setChallengers] = useState<OnlineUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedBook, setSelectedBook] = useState('Bíblia Completa');
    const [invitingEmail, setInvitingEmail] = useState<string | null>(null);

    const currentUserEmail = currentUser?.user_email || currentUser?.email || (typeof window !== 'undefined' && localStorage.getItem('adma_user') ? JSON.parse(localStorage.getItem('adma_user') || '{}').email : '') || 'estudante@adma.local';
    const currentUserName = currentUser?.user_name || currentUser?.name || (typeof window !== 'undefined' && localStorage.getItem('adma_user') ? JSON.parse(localStorage.getItem('adma_user') || '{}').name : '') || 'Estudante ADMA';

    useEffect(() => {
        if (!isOpen) return;

        setLoading(true);
        const cleanCurrent = (currentUserEmail || '').toLowerCase().trim();

        // 1. Assinatura reativa no Supabase Realtime Presence Channel (como no Shokmah)
        const unsubscribe = presenceService.subscribeToUsers((allUsers) => {
            const opponents = allUsers.filter(u => u.email && u.email.toLowerCase() !== cleanCurrent);
            setChallengers(opponents);
            setLoading(false);
        });

        // 2. Chamada de backup para garantir preenchimento inicial
        challengeService.getAvailableChallengers(currentUserEmail).then(list => {
            if (list.length > 0) {
                setChallengers(list);
            }
            setLoading(false);
        }).catch(() => setLoading(false));

        return () => {
            unsubscribe();
        };
    }, [isOpen, currentUserEmail]);

    if (!isOpen) return null;

    const filteredChallengers = challengers.filter(u => 
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.rankTitle.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleSendInvite = async (opponent: OnlineUser) => {
        setInvitingEmail(opponent.email);
        onShowToast(`Enviando desafio de ${selectedBook} para ${opponent.name}...`, 'info');

        try {
            const invite = await challengeService.sendInvite({
                senderEmail: currentUserEmail,
                senderName: currentUserName,
                receiverEmail: opponent.email,
                receiverName: opponent.name,
                book: selectedBook
            });

            // Se for um bot ou simulação rápida de teste no preview, aceita automaticamente após 1.5s
            if (opponent.email.includes('bot') || opponent.email.includes('@adma.com.br')) {
                setTimeout(async () => {
                    await challengeService.respondInvite(invite.id, 'accepted');
                    onStartDuel(invite);
                    setInvitingEmail(null);
                    onClose();
                }, 1200);
            } else {
                // Usuário real: aguarda ou notifica
                setTimeout(() => {
                    setInvitingEmail(null);
                    onShowToast(`Desafio enviado! Aguardando ${opponent.name} aceitar.`, 'success');
                }, 1000);
            }
        } catch (e: any) {
            setInvitingEmail(null);
            onShowToast(e?.message || 'Erro ao enviar convite de duelo.', 'error');
        }
    };

    const handleSoloPractice = async () => {
        setInvitingEmail('solo');
        onShowToast(`Iniciando Duelo de Treino (${selectedBook})...`, 'info');

        try {
            const invite = await challengeService.sendInvite({
                senderEmail: currentUserEmail,
                senderName: currentUserName,
                receiverEmail: 'mestre.ebd@adma.local',
                receiverName: 'Mestre da EBD (Treino)',
                book: selectedBook
            });

            await challengeService.respondInvite(invite.id, 'accepted');
            onStartDuel(invite);
            setInvitingEmail(null);
            onClose();
        } catch (e: any) {
            setInvitingEmail(null);
            onShowToast(e?.message || 'Erro ao iniciar treino.', 'error');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] md:p-6 overflow-hidden">
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
                className="bg-[#121214] text-white w-full max-w-2xl max-h-[calc(100vh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-2rem)] rounded-[32px] border border-amber-500/40 shadow-2xl relative z-10 flex flex-col overflow-hidden"
            >
                {/* CABEÇALHO DA ARENA */}
                <div className="relative p-6 bg-gradient-to-b from-[#8B0000] via-[#220707] to-[#121214] border-b border-amber-500/20">
                    <button 
                        onClick={onClose} 
                        className="absolute top-5 right-5 p-2 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-all"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-[#8B0000] flex items-center justify-center shadow-lg text-white">
                            <Swords className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="font-cinzel text-2xl font-black text-white tracking-tight flex items-center gap-2">
                                Arena de Duelos (1v1)
                            </h2>
                            <p className="text-xs text-amber-300 font-montserrat font-bold flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5" /> Escolha um irmão online e dispute 10 perguntas em 180s!
                            </p>
                        </div>
                    </div>

                    {/* SELEÇÃO DO LIVRO BÍBLICO */}
                    <div className="mt-4 pt-3 border-t border-white/10">
                        <label className="text-[10px] font-montserrat font-black uppercase text-amber-400 tracking-wider mb-2 flex items-center gap-1">
                            <BookOpen className="w-3.5 h-3.5" /> Livro Bíblico do Duelo:
                        </label>
                        <div className="relative group">
                            <select
                                value={selectedBook}
                                onChange={(e) => setSelectedBook(e.target.value)}
                                className="w-full appearance-none bg-black/40 border border-white/10 rounded-xl py-3 pl-4 pr-10 text-white font-montserrat font-bold text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all cursor-pointer hover:bg-white/5"
                            >
                                {BIBLE_BOOKS.map((b) => (
                                    <option key={b} value={b} className="bg-[#121214] text-white">
                                        {b === 'Bíblia Completa' ? '📖 Bíblia Completa (Todos os Livros)' : b}
                                    </option>
                                ))}
                            </select>
                            <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none text-amber-500 group-hover:text-amber-400 transition-colors">
                                <ChevronDown className="w-4 h-4" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* BOTÃO DE TREINO SOLO OU IA */}
                <div className="p-4 bg-gradient-to-r from-amber-500/10 via-[#8B0000]/10 to-transparent border-b border-white/5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                            <Zap className="w-4 h-4" />
                        </div>
                        <div>
                            <h4 className="text-xs font-bold text-white font-cinzel">Duelo Solo Imediato</h4>
                            <p className="text-[10px] text-gray-400">Teste sua pontuação e ganhe XP contra o relógio agora.</p>
                        </div>
                    </div>
                    <button
                        onClick={handleSoloPractice}
                        disabled={invitingEmail !== null}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-[#8B0000] text-white font-cinzel font-bold text-xs shadow-md hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 shrink-0"
                    >
                        {invitingEmail === 'solo' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flame className="w-3.5 h-3.5" />}
                        Jogar Agora
                    </button>
                </div>

                {/* BARRA DE BUSCA DE USUÁRIOS */}
                <div className="p-4 border-b border-white/5">
                    <div className="relative">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Buscar irmão ou oponente online..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-black/40 rounded-xl border border-white/10 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
                        />
                    </div>
                </div>

                {/* LISTA DE USUÁRIOS ONLINE */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2.5 max-h-[340px]">
                    {loading ? (
                        <div className="py-12 flex flex-col items-center justify-center gap-2 text-gray-400">
                            <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
                            <span className="text-xs font-montserrat">Identificando quem está com a Bíblia aberta...</span>
                        </div>
                    ) : filteredChallengers.length === 0 ? (
                        <div className="py-8 px-4 text-center space-y-4">
                            <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                                <Users className="w-6 h-6" />
                            </div>
                            <div className="space-y-1">
                                <h4 className="font-cinzel text-sm font-bold text-white">Nenhum outro irmão conectado no momento</h4>
                                <p className="text-xs text-gray-400 font-montserrat max-w-md mx-auto">
                                    Apenas você está com o aplicativo aberto agora. Assim que outro irmão entrar na Bíblia, ele aparecerá aqui instantaneamente!
                                </p>
                            </div>

                            {/* CARD MENTOR TEOLÓGICO IA */}
                            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-[#8B0000]/20 to-black border border-amber-500/30 flex items-center justify-between gap-3 text-left max-w-md mx-auto shadow-lg">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 text-black flex items-center justify-center font-bold">
                                        <Sparkles className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h5 className="font-cinzel text-xs font-black text-amber-300">Mentor Teológico (IA)</h5>
                                        <p className="text-[10px] text-gray-300">Dispute 10 perguntas e ganhe XP agora</p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleSoloPractice}
                                    className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-cinzel font-black text-xs shadow-md active:scale-95 transition-all flex items-center gap-1"
                                >
                                    <Swords className="w-3.5 h-3.5" /> Desafiar
                                </button>
                            </div>
                        </div>
                    ) : (
                        filteredChallengers.map((opponent) => {
                            const isInvitingThis = invitingEmail === opponent.email;

                            return (
                                <motion.div
                                    key={opponent.email}
                                    whileHover={{ scale: 1.01 }}
                                    className="p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-amber-500/30 transition-all flex items-center justify-between gap-3"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        {/* AVATAR COM STATUS VERDE */}
                                        <div className="relative shrink-0">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500/30 to-[#8B0000]/30 border border-white/10 flex items-center justify-center">
                                                <User className="w-5 h-5 text-amber-300" />
                                            </div>
                                            <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#121214] animate-pulse" />
                                        </div>

                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-cinzel text-xs font-bold text-white truncate">
                                                    {opponent.name}
                                                </h4>
                                                <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                                                    Nv. {opponent.level}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400 font-montserrat">
                                                <span className="text-[#C5A059] font-bold">{opponent.rankTitle}</span>
                                                <span>•</span>
                                                <span className="text-emerald-400 font-mono flex items-center gap-1">
                                                    {opponent.activity || 'Com a Bíblia Aberta'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => handleSendInvite(opponent)}
                                        disabled={invitingEmail !== null}
                                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#8B0000] to-[#500000] hover:from-[#a00000] hover:to-[#600000] text-white font-cinzel font-bold text-xs uppercase tracking-wider shadow-md hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 shrink-0"
                                    >
                                        {isInvitingThis ? (
                                            <>
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                <span>Convidando...</span>
                                            </>
                                        ) : (
                                            <>
                                                <Swords className="w-3.5 h-3.5 text-amber-400" />
                                                <span>Desafiar</span>
                                            </>
                                        )}
                                    </button>
                                </motion.div>
                            );
                        })
                    )}
                </div>

                {/* RODAPÉ */}
                <div className="p-4 bg-black/50 border-t border-white/10 flex justify-between items-center text-xs text-gray-400 font-montserrat">
                    <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-400" /> Duelos de 10 perguntas • 180 segundos
                    </span>
                    <button
                        onClick={onClose}
                        className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-cinzel font-bold text-xs tracking-wider transition-all"
                    >
                        FECHAR
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
