import { db } from './database';
import { BIBLE_BOOKS } from '../constants';
import { Verse, SourceMode } from '../types';
import { generateContent } from './geminiService';

export interface ChapterResult {
    verses: Verse[];
    source: SourceMode;
}

export const BibleService = {
    /**
     * Busca um capítulo da Bíblia seguindo a hierarquia de cache:
     * 1. IndexedDB (Offline)
     * 2. LocalStorage (Legado)
     * 3. Supabase (Cloud)
     * 4. API Externa (Online)
     */
    async getChapter(bookName: string, chapter: number, forceBypassCache = false): Promise<ChapterResult> {
        const cleanInput = bookName.toLowerCase().replace(/[\s\.]/g, "");
        const normalizedInput = cleanInput.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        
        // 1. Try exact match first (case-insensitive, keeping accents)
        let bookMeta = BIBLE_BOOKS.find(b => {
            const cleanName = b.name.toLowerCase().replace(/[\s\.]/g, "");
            const cleanAbbrev = b.abbrev.toLowerCase().replace(/[\s\.]/g, "");
            return cleanName === cleanInput || cleanAbbrev === cleanInput;
        });

        // 2. Fallback to normalized match (ignoring accents)
        if (!bookMeta) {
            bookMeta = BIBLE_BOOKS.find(b => {
                const normName = b.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f\s\.]/g, "");
                const normAbbrev = b.abbrev.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f\s\.]/g, "");
                return normName === normalizedInput || normAbbrev === normalizedInput;
            });
        }
        
        if (!bookMeta) throw new Error(`Livro "${bookName}" não encontrado.`);

        const cacheKey = `bible_acf_${bookMeta.abbrev}_${chapter}`;
        
        if (!forceBypassCache) {
            // 1. TENTA OFFLINE (IndexedDB)
            try {
                const cached = await db.entities.BibleChapter.getOffline(cacheKey);
                if (cached && Array.isArray(cached) && cached.length > 0) {
                    const formatted = cached.map((t: string, i: number) => ({ number: i + 1, text: t }));
                    return { verses: formatted, source: 'offline' };
                }
            } catch (e) {
                console.warn("IndexedDB error:", e);
            }

            // 2. TENTA LOCAL STORAGE (LEGADO)
            try {
                const legacyCache = localStorage.getItem(cacheKey);
                if (legacyCache) {
                    const parsed = JSON.parse(legacyCache);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        if (typeof parsed[0] === 'string') {
                            const formatted = parsed.map((t: string, i: number) => ({ number: i + 1, text: t }));
                            return { verses: formatted, source: 'offline' };
                        } else if (typeof parsed[0] === 'object' && parsed[0].text) {
                            return { verses: parsed, source: 'offline' };
                        }
                    }
                }
            } catch(e) {
                console.warn("LocalStorage error:", e);
            }

            // 3. TENTA NUVEM (SUPABASE - UNIVERSAL)
            try {
                const cloudData = await db.entities.BibleChapter.getCloud(cacheKey);
                if (cloudData && Array.isArray(cloudData) && cloudData.length > 0) {
                    const formatted = cloudData.map((t: string, i: number) => ({ number: i + 1, text: t }));
                    // Salva offline para o futuro
                    await db.entities.BibleChapter.saveOffline(cacheKey, cloudData);
                    return { verses: formatted, source: 'cloud' };
                }
            } catch (e) {
                console.warn("Cloud fetch error:", e);
            }
        } else {
            // Se forçar bypass, limpa cache local de imediato
            try {
                localStorage.removeItem(cacheKey);
            } catch (e) {}
        }

        // 4. FALLBACK FINAL: API EXTERNA
        try {
            const res = await fetch(`https://www.abibliadigital.com.br/api/verses/acf/${bookMeta.abbrev}/${chapter}`);
            if (!res.ok) throw new Error("Falha ao baixar da internet.");
            
            const data = await res.json();
            
            if (data.verses && data.verses.length > 0) {
                const cleanVerses = data.verses.map((v: any) => ({
                    number: v.number,
                    text: v.text.trim()
                }));
                const simpleVerses = cleanVerses.map((v:any) => v.text);
                // Salva na nuvem e offline para o futuro (primeiro clique alimenta para todos)
                await db.entities.BibleChapter.saveUniversal(cacheKey, simpleVerses);
                return { verses: cleanVerses, source: 'online' };
            } else {
                throw new Error("Capítulo vazio.");
            }
        } catch (e) {
            console.error("External API error, attempting Gemini recovery...", e);
            try {
                const schema = {
                    type: 'object',
                    properties: {
                        verses: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    number: { type: 'number' },
                                    text: { type: 'string' }
                                },
                                required: ['number', 'text']
                            }
                        }
                    },
                    required: ['verses']
                };

                const prompt = `Traga todos os versículos de ${bookMeta.name} capítulo ${chapter} na versão ACF (Almeida Corrigida Fiel).`;
                const geminiResult = await generateContent(prompt, schema, false, 'get_bible_verses');

                if (geminiResult && Array.isArray(geminiResult.verses) && geminiResult.verses.length > 0) {
                    const cleanVerses = geminiResult.verses.map((v: any) => ({
                        number: Number(v.number),
                        text: String(v.text).trim()
                    }));
                    const simpleVerses = cleanVerses.map((v: any) => v.text);
                    // Salva na nuvem e offline para o futuro (primeiro clique alimenta para todos)
                    await db.entities.BibleChapter.saveUniversal(cacheKey, simpleVerses);
                    return { verses: cleanVerses, source: 'online' };
                } else {
                    throw new Error("Resposta do Gemini vazia ou inválida.");
                }
            } catch (geminiError) {
                console.error("Gemini Bible Recovery failed:", geminiError);
                throw new Error("Erro ao carregar o texto bíblico.");
            }
        }
    },

    /**
     * Limpa o cache de um capítulo específico
     */
    async clearCache(bookName: string, chapter: number) {
        const bookMeta = BIBLE_BOOKS.find(b => b.name === bookName);
        if(bookMeta) {
            const key = `bible_acf_${bookMeta.abbrev}_${chapter}`;
            localStorage.removeItem(key);
            // Também poderíamos limpar do IndexedDB se necessário
        }
    }
};
