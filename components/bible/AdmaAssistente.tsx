
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Send, X, ChevronDown, Sparkles, Navigation, BookOpen, GraduationCap, Loader2, MessageCircle } from 'lucide-react';
import { generateContent } from '../../services/geminiService';
import { Type } from "@google/genai";
import { AssistenteMessage } from '../../types';

interface AdmaAssistenteProps {
    isAdmin: boolean;
    user: any;
    onNavigate: (view: string, params?: any) => void;
    darkMode: boolean;
}

export default function AdmaAssistente({ isAdmin, user, onNavigate, darkMode }: AdmaAssistenteProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<AssistenteMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (messages.length === 0) {
            setMessages([
                { 
                    role: 'model', 
                    text: `Olá, ${user?.user_name?.split(' ')[0] || 'irmão'}! Eu sou o ADMA Assistente. Posso te guiar pelos estudos do Professor Michel Felix ou te ajudar na navegação. O que busca hoje?` 
                }
            ]);
        }
    }, [user]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMsg: AssistenteMessage = { role: 'user', text: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        const prompt = `
            VOCÊ É: ADMA Assistente, o GPS Teológico do App Bíblia ADMA.
            SEU PAPEL: Guiar o usuário dentro do aplicativo.
            
            ESTADO DO USUÁRIO: ${isAdmin ? 'ADMINISTRADOR / EDITOR CHEFE' : 'ALUNO / MEMBRO'}.
            NOME DO USUÁRIO: ${user?.user_name}.

            --- REGRAS DE OURO (ECONOMIA DE API) ---
            1. NÃO gere longas explicações teológicas se o conteúdo já existir no app. 
            2. Se o usuário perguntar "não entendi o verso X" ou "me explique Gênesis 1", sua missão é GUIAR ao EBD Panorama ou Leitura.
            3. Se for ALUNO: Você é um monitor. Diga que o Professor já preparou um estudo e que você vai abrir para ele. 
            4. Se for ADMIN: Você é o braço direito dele para comandos de gestão.
            
            --- COMANDO DE NAVEGAÇÃO (JSON OBRIGATÓRIO) ---
            Sempre que identificar que o usuário quer ver um Livro ou Capítulo específico, use o campo 'action' no JSON de resposta.
            Target 'panorama' para estudos profundos. Target 'reader' para a Bíblia pura.

            Retorne um JSON conforme o schema.
        `;

        const schema = {
            type: Type.OBJECT,
            properties: {
                text: { type: Type.STRING, description: "Mensagem curta e amigável de resposta" },
                action: {
                    type: Type.OBJECT,
                    properties: {
                        type: { type: Type.STRING, enum: ['navigate'] },
                        target: { type: Type.STRING, enum: ['panorama', 'reader'] },
                        book: { type: Type.STRING },
                        chapter: { type: Type.NUMBER }
                    }
                }
            },
            required: ["text"]
        };

        try {
            const res = await generateContent(input + "\n" + prompt, schema, false, 'assistente_chat');
            
            const modelMsg: AssistenteMessage = {
                role: 'model',
                text: res.text,
                action: res.action
            };

            setMessages(prev => [...prev, modelMsg]);

            // Se houver ação de navegação, executa após 2 segundos para o usuário ler a mensagem
            if (res.action && res.action.type === 'navigate') {
                setTimeout(() => {
                    onNavigate(res.action.target, { book: res.action.book, chapter: res.action.chapter });
                    setIsOpen(false);
                }, 1500);
            }

        } catch (e: any) {
            setMessages(prev => [...prev, { role: 'model', text: "Perdão, tive uma falha na conexão. Pode repetir?" }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed bottom-24 right-6 z-[60] flex flex-col items-end">
            <AnimatePresence>
                {isOpen && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.8, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: 20 }}
                        className="bg-white dark:bg-[#1E1E1E] w-[90vw] md:w-[400px] h-[500px] rounded-[32px] shadow-2xl border border-[#C5A059]/30 flex flex-col overflow-hidden mb-4"
                    >
                        {/* Header do Assistente */}
                        <div className="bg-gradient-to-r from-[#8B0000] to-[#500000] p-5 flex justify-between items-center text-white">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center border border-white/20">
                                    <Bot className="w-6 h-6 text-[#C5A059]" />
                                </div>
                                <div>
                                    <h3 className="font-cinzel font-bold text-sm leading-none">ADMA Assistente</h3>
                                    <span className="text-[9px] uppercase tracking-widest opacity-60 font-bold">GPS Teológico</span>
                                </div>
                            </div>
                            <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                <ChevronDown className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Corpo do Chat */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#FDFBF7] dark:bg-[#121212]">
                            {messages.map((m, i) => (
                                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] p-4 rounded-2xl text-sm shadow-sm ${
                                        m.role === 'user' 
                                            ? 'bg-[#C5A059] text-white rounded-tr-none' 
                                            : 'bg-white dark:bg-white/5 dark:text-white border border-gray-200 dark:border-white/10 rounded-tl-none'
                                    }`}>
                                        <p className="font-montserrat leading-relaxed">{m.text}</p>
                                        {m.action && (
                                            <div className="mt-3 pt-3 border-t border-black/5 dark:border-white/5 flex items-center gap-2 text-[10px] font-bold uppercase text-[#8B0000] dark:text-[#C5A059]">
                                                <Navigation className="w-3 h-3 animate-pulse" /> Navegando para {m.action.book} {m.action.chapter}...
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {loading && (
                                <div className="flex justify-start">
                                    <div className="bg-white dark:bg-white/5 p-3 rounded-2xl rounded-tl-none border border-gray-200 dark:border-white/10">
                                        <Loader2 className="w-4 h-4 animate-spin text-[#C5A059]" />
                                    </div>
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Input */}
                        <div className="p-4 bg-white dark:bg-[#1E1E1E] border-t border-gray-100 dark:border-white/5 flex gap-2">
                            <input 
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSend()}
                                placeholder="Diga o que você precisa..."
                                className="flex-1 bg-gray-100 dark:bg-black/40 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-[#C5A059] dark:text-white outline-none"
                                disabled={loading}
                            />
                            <button 
                                onClick={handleSend}
                                disabled={loading || !input.trim()}
                                className="bg-[#8B0000] text-white p-3 rounded-xl hover:bg-[#600018] transition-colors disabled:opacity-50"
                            >
                                <Send className="w-5 h-5" />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Botão Gatilho */}
            <motion.button 
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setIsOpen(!isOpen)}
                className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all border-2 border-white/20 relative group ${
                    isOpen ? 'bg-white text-[#8B0000]' : 'bg-gradient-to-br from-[#8B0000] to-[#500000] text-white'
                }`}
            >
                <div className="absolute inset-0 bg-[#C5A059] rounded-full blur-xl opacity-20 group-hover:opacity-40 animate-pulse"></div>
                {isOpen ? <X className="w-7 h-7" /> : <MessageCircle className="w-7 h-7" />}
                
                {!isOpen && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#C5A059] rounded-full flex items-center justify-center border-2 border-white dark:border-[#1E1E1E]">
                        <Sparkles className="w-2 h-2 text-[#8B0000]" />
                    </span>
                )}
            </motion.button>
        </div>
    );
}
