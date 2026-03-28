// --- INDEXED DB FOR BIBLE AND CONTENT (ADMA Supreme DB v3 - Offline First) ---
const DB_NAME = 'adma_supreme_db';
const BIBLE_STORE = 'bible_verses';
const CONTENT_STORE = 'adma_content_store'; 
const SYNC_QUEUE_STORE = 'sync_queue';
const DB_VERSION = 4;

const openDB = (): Promise<IDBDatabase> => {
    if (typeof window === 'undefined') return Promise.reject("No window context");
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event: any) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(BIBLE_STORE)) {
                db.createObjectStore(BIBLE_STORE);
            }
            if (!db.objectStoreNames.contains(CONTENT_STORE)) {
                db.createObjectStore(CONTENT_STORE);
            }
            if (!db.objectStoreNames.contains(SYNC_QUEUE_STORE)) {
                db.createObjectStore(SYNC_QUEUE_STORE, { keyPath: 'id' });
            }
        };
        request.onsuccess = (event: any) => resolve(event.target.result);
        request.onerror = (event: any) => reject(event.target.error);
    });
};

const idbManager = {
    get: async (store: string, key: string) => {
        try {
            const db = await openDB();
            return new Promise<any>((resolve, reject) => {
                const transaction = db.transaction([store], 'readonly');
                const request = transaction.objectStore(store).get(key);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        } catch (e) { return null; }
    },
    save: async (store: string, key: string, data: any) => {
        try {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([store], 'readwrite');
                const request = transaction.objectStore(store).put(data, key);
                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error);
            });
        } catch (e) { return false; }
    },
    list: async (store: string, collection: string) => {
        try {
            const db = await openDB();
            return new Promise<any[]>((resolve, reject) => {
                const transaction = db.transaction([store], 'readonly');
                const objectStore = transaction.objectStore(store);
                const request = objectStore.getAll();
                request.onsuccess = () => {
                    const all = request.result || [];
                    resolve(all.filter((item: any) => item && item.__adma_col === collection));
                };
                request.onerror = () => reject(request.error);
            });
        } catch (e) { return []; }
    },
    delete: async (store: string, key: string) => {
        try {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([store], 'readwrite');
                const request = transaction.objectStore(store).delete(key);
                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error);
            });
        } catch (e) { return false; }
    },
    getAll: async (store: string) => {
        try {
            const db = await openDB();
            return new Promise<any[]>((resolve, reject) => {
                const transaction = db.transaction([store], 'readonly');
                const request = transaction.objectStore(store).getAll();
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            });
        } catch (e) { return []; }
    }
};

export const bibleStorage = {
    get: async (key: string) => await idbManager.get(BIBLE_STORE, key),
    save: async (key: string, data: any) => await idbManager.save(BIBLE_STORE, key, data),
    count: async () => {
        try {
            const db = await openDB();
            return new Promise<number>((resolve) => {
                const req = db.transaction([BIBLE_STORE], 'readonly').objectStore(BIBLE_STORE).count();
                req.onsuccess = () => resolve(req.result);
            });
        } catch (e) { return 0; }
    },
    clear: async () => {
        try {
            const db = await openDB();
            db.transaction([BIBLE_STORE], 'readwrite').objectStore(BIBLE_STORE).clear();
        } catch (e) {}
    }
};

const apiCall = async (action: string, collection: string, payload: any = {}) => {
    // LÓGICA STRICT ONLINE: Bloqueia ações de escrita se estiver offline
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (action === 'save' || action === 'delete' || action === 'update') {
            throw new Error("Você precisa estar online para salvar seu progresso na nuvem.");
        }
        return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); 
    
    try {
        const res = await fetch(`/api/storage?t=${Date.now()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                action, 
                table: 'adma_content',
                collection,
                ...payload 
            }),
            signal: controller.signal
        });
        clearTimeout(timeout);
        
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            console.error(`API Call failed: ${res.status}`, data);
            // Lança o erro exato vindo do servidor, se existir
            throw new Error(data.error || `Erro do servidor: ${res.status}`);
        }
        return data;
    } catch (e: any) {
        clearTimeout(timeout);
        console.error("Network/API Error:", e);
        // Só propaga erro se for ação crítica de escrita
        if (action === 'save' || action === 'delete' || action === 'update') {
            throw e; 
        }
        return null; 
    }
};

const createHelpers = (col: string) => ({
    list: async () => {
        const cloudData = await apiCall('list', col);
        if (cloudData && Array.isArray(cloudData)) {
            for(const item of cloudData) {
                await idbManager.save(CONTENT_STORE, `${col}_${item.id}`, { ...item, __adma_col: col });
            }
            return cloudData;
        }
        return await idbManager.list(CONTENT_STORE, col);
    },
    filter: async (criteria: any) => {
        const cloudData = await apiCall('filter', col, { criteria });
        
        if (cloudData && Array.isArray(cloudData)) {
            for(const item of cloudData) {
                await idbManager.save(CONTENT_STORE, `${col}_${item.id}`, { ...item, __adma_col: col });
            }
            return cloudData;
        }
        
        const localItems = await idbManager.list(CONTENT_STORE, col);
        const filteredLocal = localItems.filter((item: any) => 
            Object.keys(criteria).every(k => item[k] === criteria[k])
        );
        return filteredLocal.length > 0 ? filteredLocal : [];
    },
    getCloud: async (id: string) => {
        return await apiCall('get', col, { id });
    },
    get: async (id?: string) => {
        if (!id) return null;
        const local = await idbManager.get(CONTENT_STORE, `${col}_${id}`);
        
        if (navigator.onLine) {
             const cloudItem = await apiCall('get', col, { id });
             if (cloudItem) {
                 await idbManager.save(CONTENT_STORE, `${col}_${id}`, { ...cloudItem, __adma_col: col });
                 return cloudItem;
             }
        }
        return local || null;
    },
    create: async (data: any) => {
        if (!navigator.onLine) throw new Error("Conexão necessária para criar registros.");
        
        const response = await apiCall('save', col, { item: data });
        
        if (!response || !response.success || !response.item) {
            throw new Error("Erro desconhecido ao criar registro.");
        }

        await idbManager.save(CONTENT_STORE, `${col}_${response.item.id}`, { ...response.item, __adma_col: col });
        return response.item;
    },
    update: async (id: string, updates: any) => {
        // 1. Tenta recuperar versão atual da nuvem ou local
        let existing = null;
        if (navigator.onLine) {
            try {
                existing = await apiCall('get', col, { id });
            } catch(e) {}
        }
        if (!existing) existing = await idbManager.get(CONTENT_STORE, `${col}_${id}`);
        
        const merged = { ...(existing || {}), ...updates };
        // Força ID correto
        merged.id = id; 
        
        // Atualiza local imediatamente para o usuário ver a mudança
        await idbManager.save(CONTENT_STORE, `${col}_${id}`, { ...merged, __adma_col: col });

        if (!navigator.onLine) {
            // Adiciona na fila de sincronização
            await idbManager.save(SYNC_QUEUE_STORE, `update_${col}_${id}_${Date.now()}`, {
                id: `update_${col}_${id}_${Date.now()}`,
                action: 'update',
                collection: col,
                itemId: id,
                payload: merged,
                timestamp: Date.now()
            });
            // Tenta processar a fila em background se possível
            setTimeout(() => syncManager.processQueue(), 5000);
            return { ...merged, _queued: true };
        }

        try {
            // 2. Envia para a nuvem
            const response = await apiCall('save', col, { item: merged });
            
            if (!response || !response.success || !response.item) {
                 throw new Error("Falha ao salvar.");
            }

            // 3. Atualiza local com a resposta confirmada do servidor
            const newItem = response.item;
            await idbManager.save(CONTENT_STORE, `${col}_${newItem.id}`, { ...newItem, __adma_col: col });
            
            // Se o ID mudou (correção de identidade), limpa o antigo
            if (id !== newItem.id) {
                await idbManager.delete(CONTENT_STORE, `${col}_${id}`);
            }

            return newItem;
        } catch (e) {
            // Se falhar na rede, adiciona na fila
            await idbManager.save(SYNC_QUEUE_STORE, `update_${col}_${id}_${Date.now()}`, {
                id: `update_${col}_${id}_${Date.now()}`,
                action: 'update',
                collection: col,
                itemId: id,
                payload: merged,
                timestamp: Date.now()
            });
            setTimeout(() => syncManager.processQueue(), 5000);
            return { ...merged, _queued: true };
        }
    },
    delete: async (id: string) => {
        if (!navigator.onLine) throw new Error("Você precisa estar online para apagar registros.");
        await apiCall('delete', col, { id });
        await idbManager.delete(CONTENT_STORE, `${col}_${id}`);
    },
    save: async (data: any) => {
        const id = data.id || data.chapter_key || Date.now().toString();
        const item = { ...data, id };
        
        // Salva localmente primeiro
        await idbManager.save(CONTENT_STORE, `${col}_${id}`, { ...item, __adma_col: col });

        if (!navigator.onLine) {
            await idbManager.save(SYNC_QUEUE_STORE, `save_${col}_${id}_${Date.now()}`, {
                id: `save_${col}_${id}_${Date.now()}`,
                action: 'save',
                collection: col,
                itemId: id,
                payload: item,
                timestamp: Date.now()
            });
            setTimeout(() => syncManager.processQueue(), 5000);
            return { ...item, _queued: true };
        }

        try {
            const response = await apiCall('save', col, { item });
            if (response && response.success) {
                const newItem = response.item;
                await idbManager.save(CONTENT_STORE, `${col}_${newItem.id}`, { ...newItem, __adma_col: col });
                if (id !== newItem.id) {
                    await idbManager.delete(CONTENT_STORE, `${col}_${id}`);
                }
                return newItem;
            }
            return item;
        } catch (e) {
            await idbManager.save(SYNC_QUEUE_STORE, `save_${col}_${id}_${Date.now()}`, {
                id: `save_${col}_${id}_${Date.now()}`,
                action: 'save',
                collection: col,
                itemId: id,
                payload: item,
                timestamp: Date.now()
            });
            setTimeout(() => syncManager.processQueue(), 5000);
            return { ...item, _queued: true };
        }
    }
});

const createBibleHelpers = () => ({
    getOffline: async (key: string) => await idbManager.get(BIBLE_STORE, key),
    saveOffline: async (key: string, data: any) => await idbManager.save(BIBLE_STORE, key, data),
    getCloud: async (key: string) => {
        const item = await apiCall('get', 'bible_chapters', { id: key });
        return item ? item.verses : null;
    },
    saveUniversal: async (key: string, verses: string[]) => {
        await idbManager.save(BIBLE_STORE, key, verses);
        if (navigator.onLine) {
            await apiCall('save', 'bible_chapters', { item: { id: key, verses } });
        }
    },
    list: async () => {
        const cloudList = await apiCall('list', 'bible_chapters');
        return cloudList || [];
    }
});

let isProcessingQueue = false;

export const syncManager = {
    processQueue: async () => {
        if (typeof window === 'undefined' || !navigator.onLine || isProcessingQueue) return;
        
        isProcessingQueue = true;
        try {
            const queue = await idbManager.getAll(SYNC_QUEUE_STORE);
            if (!queue || queue.length === 0) {
                isProcessingQueue = false;
                return;
            }

            // Ordena por timestamp para processar na ordem correta
            queue.sort((a, b) => a.timestamp - b.timestamp);

            for (const item of queue) {
                try {
                    if (item.action === 'update' || item.action === 'save') {
                        const response = await apiCall('save', item.collection, { item: item.payload });
                        if (response && response.success) {
                            await idbManager.delete(SYNC_QUEUE_STORE, item.id);
                            
                            // Atualiza o local com a resposta confirmada do servidor
                            const newItem = response.item;
                            await idbManager.save(CONTENT_STORE, `${item.collection}_${newItem.id}`, { ...newItem, __adma_col: item.collection });
                        }
                    } else if (item.action === 'delete') {
                        await apiCall('delete', item.collection, { id: item.itemId });
                        await idbManager.delete(SYNC_QUEUE_STORE, item.id);
                    }
                } catch (err) {
                    console.error("Erro ao processar item da fila de sync:", err);
                    // Se falhar, para o processamento da fila para não perder a ordem
                    break; 
                }
            }
        } catch (e) {
            console.error("Erro ao ler fila de sync:", e);
        } finally {
            isProcessingQueue = false;
        }
    },
    fullSync: async () => {
        if (typeof window === 'undefined' || !navigator.onLine) return;
        
        // Primeiro processa a fila pendente
        await syncManager.processQueue();

        // Adicionado thematic_themes e thematic_lessons na lista de sync
        const collections = ['panorama_biblico', 'announcements', 'chapter_metadata', 'devotionals', 'dynamic_modules', 'app_config', 'quizzes', 'thematic_themes', 'thematic_lessons', 'thematic_folders'];
        for (const col of collections) {
            try {
                const cloudData = await apiCall('list', col);
                if (cloudData && Array.isArray(cloudData)) {
                    for(const item of cloudData) {
                        await idbManager.save(CONTENT_STORE, `${col}_${item.id}`, { ...item, __adma_col: col });
                    }
                }
            } catch (e) {}
        }
    }
};

export const db = {
    entities: {
        ReadingProgress: createHelpers('reading_progress'),
        AppConfig: createHelpers('app_config'),
        DynamicModules: createHelpers('dynamic_modules'),
        BibleChapter: createBibleHelpers(),
        ChapterMetadata: {
            ...createHelpers('chapter_metadata'),
            save: async (data: any) => {
                const id = data.chapter_key;
                const item = { ...data, id };
                await idbManager.save(CONTENT_STORE, `chapter_metadata_${id}`, { ...item, __adma_col: 'chapter_metadata' });
                await apiCall('save', 'chapter_metadata', { item });
                return item;
            }
        },
        Commentary: createHelpers('commentaries'),
        Dictionary: createHelpers('dictionaries'),
        PanoramaBiblico: createHelpers('panorama_biblico'),
        Devotional: createHelpers('devotionals'),
        Announcements: createHelpers('announcements'),
        PrayerRequests: createHelpers('prayer_requests'),
        ContentReports: createHelpers('content_reports'),
        Highlights: createHelpers('highlights'),
        Quizzes: createHelpers('quizzes'),
        PrimarySources: createHelpers('primary_sources'),
        // Novas Entidades EBD Temática
        ThematicThemes: createHelpers('thematic_themes'),
        ThematicFolders: createHelpers('thematic_folders'),
        ThematicLessons: createHelpers('thematic_lessons'),
    }
};
