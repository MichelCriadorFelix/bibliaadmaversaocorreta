import { useState, useCallback } from 'react';
import { db } from '../services/database';
import { ThematicTheme, ThematicFolder, ThematicLesson } from '../types';

export function useThematicData(onShowToast: (msg: string, type: 'success' | 'error' | 'info') => void) {
    const [thematicThemes, setThematicThemes] = useState<ThematicTheme[]>([]);
    const [themeFolders, setThemeFolders] = useState<ThematicFolder[]>([]);
    const [themeLessons, setThemeLessons] = useState<ThematicLesson[]>([]);
    const [loading, setLoading] = useState(false);

    const loadThemes = useCallback(async () => {
        setLoading(true);
        try {
            const themes = await db.entities.ThematicThemes.list();
            const sorted = themes.sort((a: any, b: any) => {
                const starA = a.is_starred ? 1 : 0;
                const starB = b.is_starred ? 1 : 0;
                if (starA !== starB) return starB - starA;
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            });
            setThematicThemes(sorted);
        } catch (e) {
            console.error(e);
            onShowToast("Erro ao carregar temas.", "error");
        } finally {
            setLoading(false);
        }
    }, [onShowToast]);

    const loadLessonsAndFolders = useCallback(async (themeId: string) => {
        setLoading(true);
        try {
            const [lessons, folders] = await Promise.all([
                db.entities.ThematicLessons.filter({ theme_id: themeId }),
                db.entities.ThematicFolders.filter({ theme_id: themeId })
            ]);
            setThemeLessons(lessons.sort((a: any, b: any) => a.order_index - b.order_index));
            setThemeFolders(folders.sort((a: any, b: any) => a.order_index - b.order_index));
        } catch (e) {
            console.error(e);
            onShowToast("Erro ao carregar conteúdo do tema.", "error");
        } finally {
            setLoading(false);
        }
    }, [onShowToast]);

    const toggleStar = useCallback(async (theme: ThematicTheme) => {
        try {
            const newStatus = !theme.is_starred;
            await db.entities.ThematicThemes.update(theme.id!, { ...theme, is_starred: newStatus });
            await loadThemes();
            onShowToast(newStatus ? "Série fixada no topo!" : "Prioridade removida.", "success");
        } catch (e) {
            onShowToast("Erro ao atualizar prioridade.", "error");
        }
    }, [loadThemes, onShowToast]);

    const addTheme = useCallback(async (title: string) => {
        if (!title.trim()) return;
        try {
            await db.entities.ThematicThemes.create({
                title,
                description: '',
                created_at: new Date().toISOString(),
                is_starred: false
            });
            await loadThemes();
            onShowToast("Série criada!", "success");
        } catch (e) { onShowToast("Erro ao criar.", "error"); }
    }, [loadThemes, onShowToast]);

    const deleteTheme = useCallback(async (id: string) => {
        if (!window.confirm("Apagar esta série e todo seu conteúdo?")) return;
        try {
            // Delete related lessons first
            const lessons = await db.entities.ThematicLessons.filter({ theme_id: id });
            for (const lesson of lessons) {
                await db.entities.ThematicLessons.delete(lesson.id!);
            }
            
            // Delete related folders
            const folders = await db.entities.ThematicFolders.filter({ theme_id: id });
            for (const folder of folders) {
                await db.entities.ThematicFolders.delete(folder.id!);
            }

            // Finally delete the theme
            await db.entities.ThematicThemes.delete(id);
            await loadThemes();
            onShowToast("Série removida.", "info");
        } catch (e) { 
            console.error(e);
            onShowToast("Erro ao remover série. Verifique o console.", "error"); 
        }
    }, [loadThemes, onShowToast]);

    const addFolder = useCallback(async (themeId: string, title: string) => {
        if (!title.trim()) return;
        try {
            await db.entities.ThematicFolders.create({
                theme_id: themeId,
                title,
                created_at: new Date().toISOString(),
                order_index: themeFolders.length + 1
            });
            await loadLessonsAndFolders(themeId);
            onShowToast("Pasta criada!", "success");
        } catch (e) { onShowToast("Erro ao criar pasta.", "error"); }
    }, [themeFolders.length, loadLessonsAndFolders, onShowToast]);

    const deleteFolder = useCallback(async (themeId: string, id: string) => {
        if (!window.confirm("Apagar esta pasta? (As aulas ficarão órfãs)")) return;
        try {
            const lessons = await db.entities.ThematicLessons.filter({ folder_id: id });
            for (const lesson of lessons) {
                await db.entities.ThematicLessons.update(lesson.id!, { ...lesson, folder_id: undefined });
            }
            await db.entities.ThematicFolders.delete(id);
            await loadLessonsAndFolders(themeId);
            onShowToast("Pasta removida.", "info");
        } catch (e) { 
            console.error(e);
            onShowToast("Erro ao remover pasta.", "error"); 
        }
    }, [loadLessonsAndFolders, onShowToast]);

    const addLesson = useCallback(async (themeId: string, title: string, folderId?: string) => {
        if (!title.trim()) return;
        try {
            await db.entities.ThematicLessons.create({
                theme_id: themeId,
                folder_id: folderId,
                title,
                order_index: themeLessons.length + 1,
                content: '',
                is_published: false
            });
            await loadLessonsAndFolders(themeId);
            onShowToast("Aula criada!", "success");
        } catch (e) { onShowToast("Erro ao criar aula.", "error"); }
    }, [themeLessons.length, loadLessonsAndFolders, onShowToast]);

    const deleteLesson = useCallback(async (themeId: string, id: string) => {
        if (!window.confirm("Apagar esta aula?")) return;
        try {
            await db.entities.ThematicLessons.delete(id);
            await loadLessonsAndFolders(themeId);
            onShowToast('Aula removida.', 'success');
        } catch (e) { onShowToast('Erro ao remover.', 'error'); }
    }, [loadLessonsAndFolders, onShowToast]);

    const renameLesson = useCallback(async (themeId: string, lesson: ThematicLesson) => {
        const newTitle = window.prompt("Novo título da aula:", lesson.title);
        if (!newTitle || newTitle === lesson.title) return;
        try {
            await db.entities.ThematicLessons.update(lesson.id!, { ...lesson, title: newTitle });
            await loadLessonsAndFolders(themeId);
            onShowToast("Título atualizado!", "success");
        } catch (e) { onShowToast("Erro ao renomear.", "error"); }
    }, [loadLessonsAndFolders, onShowToast]);

    const moveLesson = useCallback(async (themeId: string, lesson: ThematicLesson, direction: 'up' | 'down') => {
        const index = themeLessons.findIndex(l => l.id === lesson.id);
        if (index === -1) return;
        
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= themeLessons.length) return;

        const otherLesson = themeLessons[newIndex];
        try {
            await Promise.all([
                db.entities.ThematicLessons.update(lesson.id!, { ...lesson, order_index: otherLesson.order_index }),
                db.entities.ThematicLessons.update(otherLesson.id!, { ...otherLesson, order_index: lesson.order_index })
            ]);
            await loadLessonsAndFolders(themeId);
        } catch (e) { onShowToast("Erro ao mover.", "error"); }
    }, [themeLessons, loadLessonsAndFolders, onShowToast]);

    return {
        thematicThemes,
        themeFolders,
        themeLessons,
        loading,
        loadThemes,
        loadLessonsAndFolders,
        toggleStar,
        addTheme,
        deleteTheme,
        addFolder,
        deleteFolder,
        addLesson,
        deleteLesson,
        renameLesson,
        moveLesson,
        setThemeLessons,
        setThemeFolders
    };
}
