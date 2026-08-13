import { presenceService } from './presenceService';

export interface QuizQuestion {
    id: string;
    text: string;
    chapterRef: string;
    options: string[];
    correctIndex: number;
    proofText: string;
}

export interface DuelInvite {
    id: string;
    senderEmail: string;
    senderName: string;
    receiverEmail: string;
    receiverName: string;
    book: string;
    questionsCount: number;
    status: 'pending' | 'accepted' | 'declined' | 'completed' | 'expired';
    questions: QuizQuestion[];
    createdAt: string;
    expiresAt: string;
    senderScore?: number;
    senderTimeSeconds?: number;
    receiverScore?: number;
    receiverTimeSeconds?: number;
}

export interface OnlineUser {
    id?: string;
    email: string;
    name: string;
    level: number;
    rankTitle: string;
    activity?: string;
    onlineAt?: string;
    lastSeen?: string;
    isAvailable?: boolean;
    isBot?: boolean;
}

const LOCAL_DUEL_STORAGE = 'adma_duels_local';

export const challengeService = {
    // Registrar presença / heartbeat do usuário online na Bíblia/App (Supabase Realtime Channel + HTTP)
    heartbeatPresence: async (params: {
        email: string;
        name: string;
        level: number;
        rankTitle: string;
        activity?: string;
    }) => {
        if (!params.email) return;
        presenceService.initChannel(params);
    },

    // Buscar lista de usuários REALMENTE ONLINE no momento (Supabase Realtime + API + Fallback)
    getAvailableChallengers: async (currentUserEmail: string): Promise<OnlineUser[]> => {
        const cleanCurrent = (currentUserEmail || '').toLowerCase().trim();
        // 1. Obtém do gerenciador de Realtime Presence do Supabase
        const realtimeUsers = presenceService.getOnlineUsers(cleanCurrent);
        if (realtimeUsers.length > 0) {
            return realtimeUsers;
        }

        // 2. Busca da API de Presença
        const httpUsers = await presenceService.fetchHttpOnlineUsers();
        return httpUsers.filter(u => u.email && u.email.toLowerCase() !== cleanCurrent);
    },

    // Enviar convite de duelo (Persistência Supabase + Realtime Broadcast)
    sendInvite: async (params: {
        senderEmail: string;
        senderName: string;
        receiverEmail: string;
        receiverName: string;
        book: string;
    }): Promise<DuelInvite> => {
        const res = await fetch('/api/duel-invite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Falha ao enviar convite.');
        return data.invite;
    },

    // Aceitar, Recusar ou Expirar convite (Persistência Supabase + Realtime Broadcast)
    respondInvite: async (inviteId: string, status: 'accepted' | 'declined' | 'expired'): Promise<boolean> => {
        const res = await fetch('/api/duel-respond', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inviteId, status }),
        });
        return res.ok;
    },

    // Salvar resultado do duelo e atribuir XP
    finishDuel: async (inviteId: string, results: {
        userEmail: string;
        score: number;
        timeSeconds: number;
    }) => {
        const stored: DuelInvite[] = JSON.parse(localStorage.getItem(LOCAL_DUEL_STORAGE) || '[]');
        const index = stored.findIndex(i => i.id === inviteId);
        if (index >= 0) {
            const duel = stored[index];
            if (duel.senderEmail === results.userEmail.toLowerCase()) {
                duel.senderScore = results.score;
                duel.senderTimeSeconds = results.timeSeconds;
            } else {
                duel.receiverScore = results.score;
                duel.receiverTimeSeconds = results.timeSeconds;
            }
            duel.status = 'completed';
            localStorage.setItem(LOCAL_DUEL_STORAGE, JSON.stringify(stored));
            return duel;
        }
        return null;
    }
};
