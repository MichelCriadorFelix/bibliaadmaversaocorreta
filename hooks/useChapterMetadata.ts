import { useState } from 'react';
import { db } from '../services/database';
import { generateContent } from '../services/geminiService';
import { ChapterMetadata } from '../types';

export const useChapterMetadata = (
    chapterKey: string,
    book: string,
    chapter: number,
    isAdmin: boolean,
    onShowToast: (msg: string, type: 'success' | 'error' | 'info') => void
) => {
    const [metadata, setMetadata] = useState<ChapterMetadata | null>(null);
    const [isGeneratingMeta, setIsGeneratingMeta] = useState(false);

    const loadMetadata = async () => {
        setMetadata(null);
        try {
            // Tenta pegar local primeiro
            let meta = await db.entities.ChapterMetadata.get(chapterKey);
            
            if (!meta) {
               // Tenta pegar da nuvem
               const cloudMeta = await db.entities.ChapterMetadata.getCloud(chapterKey);
               if (cloudMeta) {
                   meta = cloudMeta;
                   // Sincroniza localmente para o futuro
                   await db.entities.ChapterMetadata.save(meta);
               }
            }
            
            if (meta) {
                setMetadata(meta);
            } 
        } catch (e) { console.error("Metadata Error", e); }
    };

    const generateMetadata = async () => {
        if (isGeneratingMeta) return;
        setIsGeneratingMeta(true);
        const prompt = `ATUE COMO: Teólogo Brasileiro. TAREFA: Gerar metadados para ${book} ${chapter}. IDIOMA DE RESPOSTA: PORTUGUÊS DO BRASIL (pt-BR). FORMATO JSON OBRIGATÓRIO: { "title": "Título Curto (Max 5 palavras)", "subtitle": "Resumo em 1 frase" }. Estilo: Clássico e Conservador.`;
        try {
            const rawText = await generateContent(prompt, null);
            if (rawText) {
                const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
                const res = JSON.parse(cleanJson);
                if (res && res.title) {
                    const data = { 
                        chapter_key: chapterKey,
                        title: res.title, 
                        subtitle: res.subtitle 
                    };
                    await db.entities.ChapterMetadata.save(data);
                    setMetadata(data);
                    onShowToast("Epígrafe salva para todos!", "success");
                }
            }
        } catch (e) {
            console.error("Failed to generate metadata", e);
            onShowToast("Erro ao regenerar epígrafe.", "error");
        } finally { 
            setIsGeneratingMeta(false); 
        }
    };

    return { metadata, isGeneratingMeta, loadMetadata, generateMetadata };
};
