import { useState, useEffect, useCallback } from 'react';
import { db } from '../services/database';
import { UserProgress } from '../types';

interface UseUserProgressProps {
    userProgress: UserProgress | null;
    onProgressUpdate?: (updated: UserProgress) => void;
    onShowToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export function useUserProgress({ userProgress, onProgressUpdate, onShowToast }: UseUserProgressProps) {
    const [isSaving, setIsSaving] = useState(false);
    const [readingTimer, setReadingTimer] = useState(0);
    const READING_TIME_SEC = 40;

    // Timer de leitura para ranking justo
    const startTimer = useCallback((isAlreadyRead: boolean) => {
        if (isAlreadyRead) {
            setReadingTimer(0);
            return;
        }
        setReadingTimer(READING_TIME_SEC);
        const interval = setInterval(() => {
            setReadingTimer(prev => {
                if (prev <= 1) {
                    clearInterval(interval);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const toggleChapterRead = useCallback(async (book: string, chapter: number, chapterKey: string, isRead: boolean) => {
        if (!userProgress || !userProgress.id || isSaving) return;

        if (!isRead && readingTimer > 0) {
            onShowToast(`Leia o capítulo por mais ${readingTimer} segundos para confirmar.`, "info");
            return;
        }

        setIsSaving(true);
        try {
            const uniqueReadSet = new Set(userProgress.chapters_read || []);
            
            if (isRead) {
                uniqueReadSet.delete(chapterKey);
            } else {
                uniqueReadSet.add(chapterKey);
            }
            
            const newRead = Array.from(uniqueReadSet);
            
            const safePayload: UserProgress = {
                ...userProgress,
                chapters_read: newRead,
                total_chapters: newRead.length,
                last_book: book,
                last_chapter: chapter,
                user_email: userProgress.user_email,
                user_name: userProgress.user_name
            };

            const updated = await db.entities.ReadingProgress.update(userProgress.id, safePayload);
            if (onProgressUpdate) onProgressUpdate(updated);

            if (updated._queued) {
                onShowToast("Salvo no dispositivo! (Sincronização pendente)", "info");
            } else {
                onShowToast(isRead ? "Marcado como não lido." : "Progresso salvo na Nuvem!", "success");
            }
        } catch (e) {
            console.error("Erro ao salvar progresso da Bíblia:", e);
            onShowToast("Erro ao salvar progresso.", "error");
        } finally {
            setIsSaving(false);
        }
    }, [userProgress, isSaving, readingTimer, onShowToast, onProgressUpdate]);

    const markEbdAsRead = useCallback(async (studyKey: string, isRead: boolean) => {
        if (!userProgress || !userProgress.id || isSaving || isRead) return;

        setIsSaving(true);
        try {
            const currentList = userProgress.ebd_read || [];
            const uniqueList = Array.from(new Set([...currentList, studyKey]));
            
            const updatePayload: UserProgress = {
                ...userProgress,
                ebd_read: uniqueList,
                total_ebd_read: uniqueList.length,
                user_email: userProgress.user_email
            };

            const updated = await db.entities.ReadingProgress.update(userProgress.id, updatePayload);
            if (onProgressUpdate) onProgressUpdate(updated);
            
            if (updated._queued) {
                onShowToast('Concluído! (Salvo offline, sincronizando em breve)', 'info');
            } else {
                onShowToast('Concluído! Pontuação salva permanentemente.', 'success');
            }
        } catch (e) {
            console.error("Erro ao salvar EBD:", e);
            onShowToast('Erro de conexão. Tente novamente.', 'error');
        } finally {
            setIsSaving(false);
        }
    }, [userProgress, isSaving, onProgressUpdate, onShowToast]);

    const markThematicAsRead = useCallback(async (lessonId: string, isRead: boolean) => {
        if (!userProgress || !userProgress.id || isSaving || isRead) return;

        setIsSaving(true);
        try {
            const currentList = userProgress.thematic_read || [];
            const newList = Array.from(new Set([...currentList, lessonId]));
            
            const updatePayload: UserProgress = {
                ...userProgress,
                thematic_read: newList,
                total_thematic_read: newList.length,
                user_email: userProgress.user_email
            };

            const updated = await db.entities.ReadingProgress.update(userProgress.id, updatePayload);
            if (onProgressUpdate) onProgressUpdate(updated);
            
            if (updated._queued) {
                onShowToast('Aula registrada! (Salvo offline, sincronizando em breve)', 'info');
            } else {
                onShowToast('Aula registrada no seu progresso!', 'success');
            }
        } catch (e) {
            console.error("Erro ao salvar aula temática:", e);
            onShowToast('Erro ao salvar progresso.', 'error');
        } finally {
            setIsSaving(false);
        }
    }, [userProgress, isSaving, onProgressUpdate, onShowToast]);

    const unlockTheme = useCallback(async (themeId: string, password: string) => {
        if (!userProgress || !userProgress.id || isSaving) return;

        setIsSaving(true);
        try {
            const updatedProgress: UserProgress = {
                ...userProgress,
                unlocked_themes: {
                    ...(userProgress.unlocked_themes || {}),
                    [themeId]: password
                }
            };
            const updated = await db.entities.ReadingProgress.update(userProgress.id, updatedProgress);
            if (onProgressUpdate) onProgressUpdate(updated);
        } catch (e) {
            console.error("Erro ao desbloquear tema:", e);
        } finally {
            setIsSaving(false);
        }
    }, [userProgress, isSaving, onProgressUpdate]);

    return {
        isSaving,
        readingTimer,
        startTimer,
        toggleChapterRead,
        markEbdAsRead,
        markThematicAsRead,
        unlockTheme
    };
}
