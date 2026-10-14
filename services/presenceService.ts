import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { OnlineUser } from './challengeService';

// 1. Configuração do Cliente Supabase para Realtime Presence
const getSupabaseConfig = () => {
    let url = '';
    let key = '';

    try {
        // O Vite vai substituir process.env... estaticamente no build.
        // O bloco try previne crash caso a variável não exista no ambiente do navegador
        url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
        key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
    } catch (e) {
        try {
            url = (import.meta as any).env.VITE_SUPABASE_URL || (import.meta as any).env.NEXT_PUBLIC_SUPABASE_URL || '';
            key = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || (import.meta as any).env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
        } catch (e2) {}
    }

    return { url, key };
};

let supabaseClient: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient | null => {
    if (supabaseClient) return supabaseClient;
    const { url, key } = getSupabaseConfig();
    if (url && key) {
        supabaseClient = createClient(url, key, {
            realtime: {
                params: {
                    eventsPerSecond: 10,
                },
            },
        });
    }
    return supabaseClient;
};

// NOME FIXO DO CANAL DE PRESENÇA COMPARTILHADO EM TODO O SISTEMA (como no Shokmah)
export const PRESENCE_CHANNEL_NAME = 'adma_presence';

// BroadcastChannel nativo do navegador para sincronização imediata entre abas/janelas locais
let localBus: BroadcastChannel | null = null;
try {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        localBus = new BroadcastChannel('adma_presence_local_bus');
    }
} catch (e) {}

type PresenceListener = (users: OnlineUser[]) => void;
type QuizReleaseListener = (payload: { chapterKey?: string; targetUnit?: string; timestamp: number }) => void;
type RankingUpdateListener = (payload: { email?: string; unit?: string; score?: number; timestamp: number }) => void;

class PresenceManager {
    private channel: RealtimeChannel | null = null;
    private listeners: Set<PresenceListener> = new Set();
    private quizReleaseListeners: Set<QuizReleaseListener> = new Set();
    private rankingUpdateListeners: Set<RankingUpdateListener> = new Set();
    private onlineUsersMap: Map<string, OnlineUser> = new Map();
    private currentTrackData: any = null;
    private isSubscribed = false;
    private pingInterval: any = null;

    constructor() {
        if (typeof window !== 'undefined') {
            // Ouve broadcast local
            if (localBus) {
                localBus.onmessage = (event) => {
                    if (event.data && event.data.type === 'PING') {
                        const user = event.data.user;
                        if (user && user.email) {
                            this.addOrUpdateUser(user);
                            this.notifyListeners();
                        }
                    } else if (event.data && event.data.type === 'QUIZ_RELEASED') {
                        this.quizReleaseListeners.forEach(cb => {
                            try { cb(event.data.payload); } catch (e) {}
                        });
                    } else if (event.data && event.data.type === 'RANKING_UPDATED') {
                        this.rankingUpdateListeners.forEach(cb => {
                            try { cb(event.data.payload); } catch (e) {}
                        });
                    }
                };
            }

            // Ao voltar do segundo plano no celular, reativa presença imediatamente
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && this.currentTrackData) {
                    this.currentTrackData.timestamp = Date.now();
                    if (this.channel && this.isSubscribed) {
                        this.channel.track(this.currentTrackData).catch(() => {});
                    }
                    this.lastHttpPingAt = Date.now();
                    this.sendHttpHeartbeat(this.currentTrackData);
                }
            });
        }
    }

    private addOrUpdateUser(u: any) {
        const email = String(u.email || u.user_email || '').toLowerCase().trim();
        if (!email) return;

        this.onlineUsersMap.set(email, {
            email: email,
            name: u.name || u.user_name || email.split('@')[0],
            level: Number(u.level) || 1,
            rankTitle: u.rankTitle || 'Estudante da Bíblia',
            lastSeen: 'Online agora',
            activity: u.activity || 'Com a Bíblia Aberta',
            isAvailable: true,
            isBot: false
        });
    }

    private notifyListeners() {
        const userList = Array.from(this.onlineUsersMap.values());
        this.listeners.forEach(cb => {
            try { cb(userList); } catch (e) {}
        });
    }

    // Inicializa o canal do Supabase Realtime Presence
    public initChannel(userData: {
        email: string;
        name: string;
        level: number;
        rankTitle: string;
        activity?: string;
    }) {
        if (!userData.email) return;
        const cleanEmail = userData.email.toLowerCase().trim();
        this.currentTrackData = {
            user_id: cleanEmail,
            user_email: cleanEmail,
            email: cleanEmail,
            name: userData.name || cleanEmail.split('@')[0],
            level: Number(userData.level) || 1,
            rankTitle: userData.rankTitle || 'Estudante da Bíblia',
            activity: userData.activity || 'Com a Bíblia Aberta',
            timestamp: Date.now()
        };

        // 1. Broadcast local imediato
        if (localBus) {
            try {
                localBus.postMessage({ type: 'PING', user: this.currentTrackData });
            } catch (e) {}
        }

        // 2. Sincroniza Supabase Realtime Channel
        const supabase = getSupabase();
        if (supabase) {
            if (!this.channel) {
                this.channel = supabase.channel(PRESENCE_CHANNEL_NAME, {
                    config: {
                        presence: {
                            key: cleanEmail,
                        },
                    },
                });

                // Registrar ouvinte ANTES do subscribe (Regra de Ouro do Realtime)
                this.channel
                    .on('presence', { event: 'sync' }, () => {
                        try {
                            const state = this.channel?.presenceState() || {};
                            // state = { [presence_key]: [ { ...user_data } ] }
                            this.onlineUsersMap.clear();

                            Object.values(state).forEach((presences: any) => {
                                if (Array.isArray(presences)) {
                                    presences.forEach(p => {
                                        this.addOrUpdateUser(p);
                                    });
                                }
                            });

                            this.notifyListeners();
                        } catch (err) {
                            console.error("Erro no sync de presence do Supabase:", err);
                        }
                    })
                    .on('presence', { event: 'join' }, ({ key, newPresences }: any) => {
                        if (Array.isArray(newPresences)) {
                            newPresences.forEach(p => this.addOrUpdateUser(p));
                            this.notifyListeners();
                        }
                    })
                    .on('presence', { event: 'leave' }, ({ key, leftPresences }: any) => {
                        if (key) {
                            this.onlineUsersMap.delete(String(key).toLowerCase().trim());
                            this.notifyListeners();
                        }
                    })
                    .on('broadcast', { event: 'quiz_released' }, (event: any) => {
                        const payload = event.payload || event;
                        this.quizReleaseListeners.forEach(cb => {
                            try { cb(payload); } catch (e) {}
                        });
                    })
                    .on('broadcast', { event: 'ranking_updated' }, (event: any) => {
                        const payload = event.payload || event;
                        this.rankingUpdateListeners.forEach(cb => {
                            try { cb(payload); } catch (e) {}
                        });
                    })
                    .subscribe(async (status) => {
                        if (status === 'SUBSCRIBED') {
                            this.isSubscribed = true;
                            // SÓ APÓS SUBSCRIBED chamamos track (Padrão exato do Shokmah)
                            try {
                                if (this.currentTrackData && this.channel) {
                                    await this.channel.track(this.currentTrackData);
                                }
                            } catch (e) {
                                console.warn("Falha ao rastrear presença no canal:", e);
                            }
                        }
                    });
            } else if (this.isSubscribed && this.currentTrackData) {
                this.channel.track(this.currentTrackData).catch(() => {});
            }
        }

        // 3. Fallback via API / Supabase DB (Heartbeat de segurança controlado)
        const now = Date.now();
        if (!this.lastHttpPingAt || now - this.lastHttpPingAt > 25000) {
            this.lastHttpPingAt = now;
            this.sendHttpHeartbeat(this.currentTrackData);
        }

        if (!this.pingInterval) {
            this.pingInterval = setInterval(() => {
                if (typeof document !== 'undefined' && document.hidden) return;
                if (this.currentTrackData) {
                    this.currentTrackData.timestamp = Date.now();
                    if (this.channel && this.isSubscribed) {
                        this.channel.track(this.currentTrackData).catch(() => {});
                    }
                    if (localBus) {
                        try {
                            localBus.postMessage({ type: 'PING', user: this.currentTrackData });
                        } catch (e) {}
                    }
                    this.lastHttpPingAt = Date.now();
                    this.sendHttpHeartbeat(this.currentTrackData);
                }
            }, 30000); // a cada 30s (evita sobrecarga de memória/rede no celular)
        }
    }

    private lastHttpPingAt = 0;

    private async sendHttpHeartbeat(data: any) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) return;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            await fetch('/api/presence', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
                signal: controller.signal
            });
        } catch (e) {
            // Silencioso para não acumular erros em conexões móveis instáveis
        } finally {
            clearTimeout(timeout);
        }
    }

    // Atualiza a atividade atual (ex: mudou de capítulo ou tela)
    public updateActivity(activity: string) {
        if (this.currentTrackData) {
            this.currentTrackData.activity = activity;
            if (this.channel && this.isSubscribed) {
                this.channel.track(this.currentTrackData).catch(() => {});
            }
            if (localBus) {
                localBus.postMessage({ type: 'PING', user: this.currentTrackData });
            }
        }
    }

    // Assinar mudanças de usuários online
    public subscribeToUsers(callback: PresenceListener): () => void {
        this.listeners.add(callback);
        // Emite imediatamente o estado atual
        callback(Array.from(this.onlineUsersMap.values()));

        // Tenta também buscar via API para preenchimento imediato
        this.fetchHttpOnlineUsers().then(users => {
            users.forEach(u => this.addOrUpdateUser(u));
            this.notifyListeners();
        });

        return () => {
            this.listeners.delete(callback);
        };
    }

    public async fetchHttpOnlineUsers(): Promise<OnlineUser[]> {
        try {
            const res = await fetch(`/api/presence?t=${Date.now()}`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data.onlineUsers)) {
                    return data.onlineUsers;
                }
            }
        } catch (e) {}
        return [];
    }

    public getOnlineUsers(excludeEmail?: string): OnlineUser[] {
        const cleanExclude = (excludeEmail || '').toLowerCase().trim();
        const result: OnlineUser[] = [];
        this.onlineUsersMap.forEach((u, key) => {
            if (key !== cleanExclude) {
                result.push(u);
            }
        });
        return result;
    }

    public broadcastQuizRelease(payload: { chapterKey?: string; targetUnit?: string; timestamp: number }) {
        if (localBus) {
            try {
                localBus.postMessage({ type: 'QUIZ_RELEASED', payload });
            } catch (e) {}
        }
        if (this.channel && this.isSubscribed) {
            this.channel.send({
                type: 'broadcast',
                event: 'quiz_released',
                payload
            }).catch(() => {});
        }
    }

    public subscribeToQuizRelease(callback: QuizReleaseListener): () => void {
        this.quizReleaseListeners.add(callback);
        return () => {
            this.quizReleaseListeners.delete(callback);
        };
    }

    public broadcastRankingUpdate(payload: { email?: string; unit?: string; score?: number; timestamp: number }) {
        if (localBus) {
            try {
                localBus.postMessage({ type: 'RANKING_UPDATED', payload });
            } catch (e) {}
        }
        if (this.channel && this.isSubscribed) {
            this.channel.send({
                type: 'broadcast',
                event: 'ranking_updated',
                payload
            }).catch(() => {});
        }
    }

    public subscribeToRankingUpdate(callback: RankingUpdateListener): () => void {
        this.rankingUpdateListeners.add(callback);
        return () => {
            this.rankingUpdateListeners.delete(callback);
        };
    }

    public destroy() {
        if (this.pingInterval) clearInterval(this.pingInterval);
        if (this.channel) {
            const supabase = getSupabase();
            if (supabase) supabase.removeChannel(this.channel);
            this.channel = null;
        }
        this.isSubscribed = false;
        this.listeners.clear();
        this.quizReleaseListeners.clear();
        this.rankingUpdateListeners.clear();
    }
}

export const presenceService = new PresenceManager();
