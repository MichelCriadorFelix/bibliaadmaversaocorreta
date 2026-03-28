import { useState, useCallback, useRef } from 'react';
import { db } from '../services/database';
import { EBDContent } from '../types';
import { generateChapterKey } from '../constants';
import { generateContent } from '../services/geminiService';

export function useEbdData(onShowToast: (msg: string, type: 'success' | 'error' | 'info') => void) {
    const [content, setContent] = useState<EBDContent | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [theologicalDensity, setTheologicalDensity] = useState(0);
    const [validationPhase, setValidationPhase] = useState<'none' | 'structural' | 'theological' | 'final' | 'retention' | 'releasing'>('none');
    const [validationLog, setValidationLog] = useState<string[]>([]);
    
    const pendingContentBuffer = useRef<EBDContent | null>(null);
    const commitLockRef = useRef<boolean>(false);

    const loadContent = useCallback(async (book: string, chapter: number) => {
        const key = generateChapterKey(book, chapter);
        try {
            const res = await db.entities.PanoramaBiblico.filter({ study_key: key });
            if (res.length) {
                setContent(res[0]);
                return res[0];
            } else {
                setContent(null);
                return null;
            }
        } catch (err) {
            onShowToast("Erro ao conectar com o acervo teológico.", "error");
            return null;
        }
    }, [onShowToast]);

    const handleGenerate = useCallback(async (book: string, chapter: number, customInstructions: string, theologicalDensity: number, activeTab: 'student' | 'teacher') => {
        setIsGenerating(true);
        setValidationPhase('structural');
        setValidationLog(["🚀 Iniciando motor Magnum Opus v116...", `📐 Target: 3.000 words (${activeTab === 'student' ? 'Manuscrito Aluno' : 'Guia do Mestre'})`]);
        commitLockRef.current = false;

        try {
            const taskType = activeTab === 'teacher' ? 'teacher_ebd' : 'ebd';
            const prompt = customInstructions ? `${book} ${chapter}\n\nInstruções Adicionais: ${customInstructions}` : `${book} ${chapter}`;
            const res = await generateContent(prompt, null, true, taskType, { book, chapter });
            if (!res || res.length < 1000) throw new Error("Conteúdo insuficiente retornado (Falha de Volume).");

            setValidationPhase('theological');
            let clean = res.trim();
            if (clean.startsWith('{"text":')) { try { clean = JSON.parse(clean).text; } catch(e){} }
            if (clean.startsWith('```')) clean = clean.replace(/```[a-z]*\n|```/g, '');

            const key = generateChapterKey(book, chapter);
            const existing = (await db.entities.PanoramaBiblico.filter({ study_key: key }))[0];
            
            const newContent: EBDContent = existing ? { ...existing } : {
                study_key: key,
                book,
                chapter,
                title: `Panorama de ${book} ${chapter}`,
                outline: [],
                student_content: '',
                teacher_content: '',
            };

            if (activeTab === 'student') {
                newContent.student_content = clean;
            } else {
                newContent.teacher_content = clean;
            }

            pendingContentBuffer.current = newContent;
            setTheologicalDensity(100);
            return newContent;
        } catch (e: any) {
            onShowToast(`Erro na Geração: ${e.message}`, 'error');
            setIsGenerating(false);
            return null;
        }
    }, [onShowToast]);

    const finalizeGeneration = useCallback(async (book: string, chapter: number) => {
        if (pendingContentBuffer.current && !commitLockRef.current) {
            commitLockRef.current = true;
            const key = generateChapterKey(book, chapter);
            const existing = (await db.entities.PanoramaBiblico.filter({ study_key: key }))[0] || {};
            
            try {
                if (existing.id) await db.entities.PanoramaBiblico.update(existing.id, pendingContentBuffer.current);
                else await db.entities.PanoramaBiblico.create(pendingContentBuffer.current);
                
                await loadContent(book, chapter);
                setValidationPhase('releasing');
                onShowToast('Manuscrito Pérola de Ouro v116.0 Liberado!', 'success');
                setIsGenerating(false);
            } catch (e) {
                console.error("Erro no commit final:", e);
                commitLockRef.current = false;
            }
        }
    }, [loadContent, onShowToast]);

    return {
        content,
        setContent,
        isGenerating,
        setIsGenerating,
        theologicalDensity,
        setTheologicalDensity,
        validationPhase,
        setValidationPhase,
        validationLog,
        setValidationLog,
        loadContent,
        handleGenerate,
        finalizeGeneration
    };
}
