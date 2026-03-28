import React, { useState, useEffect } from 'react';
import { Send, Bot, Loader2, Save, Wand2, Trash2 } from 'lucide-react';
import { generateContent } from '../../services/geminiService';
import { db } from '../../services/database';
import { AppConfig, DynamicModule } from '../../types';
import { Type as GenType } from "@google/genai";

interface AppBuilderProps {
  onBack: () => void;
  onShowToast: (msg: string, type: 'success'|'error'|'info') => void;
  currentConfig: AppConfig | null;
}

export default function AppBuilder({ onBack, onShowToast, currentConfig }: AppBuilderProps) {
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [existingModules, setExistingModules] = useState<DynamicModule[]>([]);
    const [messages, setMessages] = useState<{role: 'user'|'model', text: string}[]>([
        { role: 'model', text: 'Olá! Sou o Construtor do ADMA. Posso alterar cores, ativar/desativar funções ou gerenciar módulos (Criar/Excluir Quizzes e Páginas). O que deseja fazer?' }
    ]);

    // Carrega módulos existentes para que a IA saiba o que pode ser deletado
    useEffect(() => {
        loadModules();
    }, []);

    const loadModules = async () => {
        try {
            const list = await db.entities.DynamicModules.list();
            setExistingModules(list);
        } catch(e) { console.error(e); }
    };

    const handleSend = async () => {
        if (!input.trim()) return;
        
        const userMsg = input;
        setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setInput('');
        setLoading(true);

        // Define schema para a resposta da IA
        const schema = {
            type: GenType.OBJECT,
            properties: {
                actionType: { type: GenType.STRING, enum: ['update_config', 'create_module', 'delete_module', 'unknown'] },
                replyMessage: { type: GenType.STRING },
                moduleIdToDelete: { type: GenType.STRING, description: "ID do módulo para excluir, se actionType for delete_module" },
                configChanges: {
                    type: GenType.OBJECT,
                    properties: {
                        primaryColor: { type: GenType.STRING },
                        secondaryColor: { type: GenType.STRING },
                        appName: { type: GenType.STRING },
                        enableRanking: { type: GenType.BOOLEAN },
                        enableDevotional: { type: GenType.BOOLEAN },
                        enablePlans: { type: GenType.BOOLEAN },
                        enableMessages: { type: GenType.BOOLEAN },
                        requirePasswordLogin: { type: GenType.BOOLEAN }
                    }
                },
                moduleData: {
                    type: GenType.OBJECT,
                    properties: {
                        type: { type: GenType.STRING, enum: ['quiz', 'page', 'link'] },
                        title: { type: GenType.STRING },
                        description: { type: GenType.STRING },
                        iconName: { type: GenType.STRING },
                        accessLevel: { type: GenType.STRING, enum: ['public', 'admin', 'login'] },
                        data: { 
                            type: GenType.OBJECT,
                            properties: {
                                html: { type: GenType.STRING, description: "HTML content for pages" },
                                url: { type: GenType.STRING, description: "URL for links" },
                                questions: {
                                    type: GenType.ARRAY,
                                    items: {
                                        type: GenType.OBJECT,
                                        properties: {
                                            text: { type: GenType.STRING },
                                            options: { type: GenType.ARRAY, items: { type: GenType.STRING } },
                                            correctIndex: { type: GenType.INTEGER }
                                        }
                                    }
                                }
                            }
                        } 
                    }
                }
            }
        };

        const prompt = `
            ATUE COMO: Um Arquiteto de Software e Gerenciador do App "Bíblia ADMA".
            
            --- ESTADO ATUAL ---
            CONFIGURAÇÃO GLOBAL: ${JSON.stringify(currentConfig || {})}
            MÓDULOS DINÂMICOS EXISTENTES (ID e Título): ${JSON.stringify(existingModules.map(m => ({ id: m.id, title: m.title, type: m.type })))}
            
            --- COMANDO DO USUÁRIO ---
            "${userMsg}"
            
            --- OBJETIVO ---
            Interprete o pedido e gere uma ação estruturada (JSON).
            
            --- REGRAS DE AÇÃO ---
            1. EXCLUIR MÓDULO: Se o usuário pedir para remover/excluir/apagar uma funcionalidade que está na lista de 'MÓDULOS DINÂMICOS EXISTENTES', use 'actionType': 'delete_module' e preencha 'moduleIdToDelete' com o ID correto encontrado na lista.
            2. DESATIVAR FUNÇÃO NATIVA: Se o usuário pedir para remover uma função nativa (Ranking, Devocional, Planos, Mensagens/Anúncios), use 'update_config' e defina a flag correspondente (ex: enableMessages: false).
            3. CRIAR MÓDULO: Se for criar Quiz ou Página, use 'create_module' e preencha 'moduleData'.
            4. ALTERAR CONFIG: Se for mudança de cor ou nome do app, use 'update_config'.
            
            Retorne JSON estritamente conforme o schema.
        `;

        try {
            const res = await generateContent(prompt, schema);
            
            if (res.actionType === 'update_config' && res.configChanges) {
                // Atualiza Config Global
                const newConfig = {
                    ...currentConfig,
                    theme: {
                        ...currentConfig?.theme,
                        ...(res.configChanges.primaryColor ? { primaryColor: res.configChanges.primaryColor } : {}),
                        ...(res.configChanges.secondaryColor ? { secondaryColor: res.configChanges.secondaryColor } : {}),
                        ...(res.configChanges.appName ? { appName: res.configChanges.appName } : {}),
                    },
                    features: {
                        ...currentConfig?.features,
                        ...(res.configChanges.enableRanking !== undefined ? { enableRanking: res.configChanges.enableRanking } : {}),
                        ...(res.configChanges.enableDevotional !== undefined ? { enableDevotional: res.configChanges.enableDevotional } : {}),
                        ...(res.configChanges.enablePlans !== undefined ? { enablePlans: res.configChanges.enablePlans } : {}),
                        ...(res.configChanges.enableMessages !== undefined ? { enableMessages: res.configChanges.enableMessages } : {}),
                    },
                    auth: {
                         ...currentConfig?.auth,
                         ...(res.configChanges.requirePasswordLogin !== undefined ? { requirePasswordLogin: res.configChanges.requirePasswordLogin } : {})
                    }
                };
                
                await db.entities.AppConfig.save(newConfig);
                onShowToast('Configurações atualizadas! Recarregue para ver.', 'success');
            } 
            else if (res.actionType === 'create_module' && res.moduleData) {
                // Cria Módulo Dinâmico
                await db.entities.DynamicModules.create(res.moduleData);
                await loadModules(); // Recarrega lista local
                onShowToast(`Módulo "${res.moduleData.title}" criado!`, 'success');
            }
            else if (res.actionType === 'delete_module' && res.moduleIdToDelete) {
                // Exclui Módulo Dinâmico (IMPLEMENTAÇÃO CORRIGIDA)
                await db.entities.DynamicModules.delete(res.moduleIdToDelete);
                await loadModules(); // Recarrega lista local para a IA saber que sumiu
                onShowToast('Funcionalidade excluída com sucesso!', 'success');
            }

            setMessages(prev => [...prev, { role: 'model', text: res.replyMessage || "Operação realizada com sucesso." }]);

        } catch (e: any) {
            setMessages(prev => [...prev, { role: 'model', text: `Erro: ${e.message}` }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-gray-50 dark:bg-[#121212] rounded-xl overflow-hidden shadow-2xl border border-[#C5A059]">
            <div className="bg-[#1a0f0f] text-white p-4 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <Wand2 className="w-5 h-5 text-[#C5A059]" />
                    <h2 className="font-cinzel font-bold">ADMA Builder AI</h2>
                </div>
                <button onClick={onBack} className="text-xs underline text-gray-400 hover:text-white">Fechar</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-3 rounded-xl text-sm ${m.role === 'user' ? 'bg-[#C5A059] text-white rounded-tr-none' : 'bg-white dark:bg-[#1E1E1E] text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-tl-none'}`}>
                            {m.role === 'model' && <Bot className="w-4 h-4 mb-1 text-[#8B0000]"/>}
                            {m.text}
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="flex justify-start">
                         <div className="bg-white dark:bg-[#1E1E1E] p-3 rounded-xl rounded-tl-none border border-gray-200 dark:border-gray-700">
                             <Loader2 className="w-5 h-5 animate-spin text-[#C5A059]" />
                         </div>
                    </div>
                )}
            </div>

            <div className="p-4 bg-white dark:bg-[#1E1E1E] border-t border-gray-200 dark:border-gray-700 flex gap-2">
                <input 
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                    placeholder='Ex: "Excluir Gerenciar Anúncios" ou "Mude a cor para Roxo"'
                    className="flex-1 p-3 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-[#121212] dark:text-white focus:ring-2 focus:ring-[#C5A059] outline-none"
                    disabled={loading}
                />
                <button 
                    onClick={handleSend}
                    disabled={loading || !input.trim()}
                    className="bg-[#8B0000] text-white p-3 rounded-lg hover:bg-[#600018] disabled:opacity-50"
                >
                    <Send className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
}