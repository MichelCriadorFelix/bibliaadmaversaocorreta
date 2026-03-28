import React, { useState } from 'react';
import { Sparkles, Loader2, Check, X, RefreshCw, Save } from 'lucide-react';
import { QuizQuestion } from '../../types';
import { generateContent } from '../../services/geminiService';

interface QuizGeneratorProps {
    lessonContent: string;
    onQuizSaved: (questions: QuizQuestion[]) => void;
    onCancel: () => void;
}

export const QuizGenerator: React.FC<QuizGeneratorProps> = ({ lessonContent, onQuizSaved, onCancel }) => {
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedQuestions, setGeneratedQuestions] = useState<QuizQuestion[]>([]);
    const [selectedIndices, setSelectedIndices] = useState<number[]>([]);

    const generateQuestions = async () => {
        setIsGenerating(true);
        try {
            const prompt = `
                Gere 10 perguntas de múltipla escolha baseadas EXCLUSIVAMENTE no texto da aula delimitado abaixo.
                
                REGRAS:
                1. A resposta deve estar no texto.
                2. A pergunta deve ser clara.
                3. 4 opções (A, B, C, D).
                4. Apenas uma correta.
                5. Inclua o trecho do texto que comprova a resposta (proofText).
                
                Retorne APENAS um JSON no seguinte formato:
                [
                    {
                        "text": "Pergunta",
                        "options": ["Opção A", "Opção B", "Opção C", "Opção D"],
                        "correctIndex": 0,
                        "proofText": "Trecho que comprova"
                    },
                    ...
                ]

                --- INÍCIO DO TEXTO DA AULA ---
                ${lessonContent}
                --- FIM DO TEXTO DA AULA ---
            `;
            
            const schema = {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        text: { type: "string" },
                        options: { type: "array", items: { type: "string" } },
                        correctIndex: { type: "number" },
                        proofText: { type: "string" }
                    },
                    required: ["text", "options", "correctIndex", "proofText"]
                }
            };

            const questions = await generateContent(prompt, schema, true, 'quiz_gen');
            
            // Add IDs to questions
            const questionsWithIds = questions.map((q: any, i: number) => ({
                ...q,
                id: `q_${Date.now()}_${i}`
            }));
            
            setGeneratedQuestions(questionsWithIds);
            setSelectedIndices([]);
        } catch (e: any) {
            console.error("Erro na geração:", e);
        } finally {
            setIsGenerating(false);
        }
    };

    const toggleSelection = (index: number) => {
        if (selectedIndices.includes(index)) {
            setSelectedIndices(selectedIndices.filter(i => i !== index));
        } else if (selectedIndices.length < 5) {
            setSelectedIndices([...selectedIndices, index]);
        }
    };

    const regenerateQuestion = async (index: number) => {
        // Implement regeneration logic here
    };

    return (
        <div className="p-6 bg-white dark:bg-dark-card rounded-3xl border border-[#C5A059]/30 shadow-xl">
            <h3 className="font-cinzel text-xl font-bold mb-4">Gerador de Quiz ADMA</h3>
            
            {!isGenerating && generatedQuestions.length === 0 && (
                <button 
                    onClick={generateQuestions}
                    className="w-full py-4 bg-[#C5A059] text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[#b08d45]"
                >
                    <Sparkles className="w-5 h-5" /> Gerar 10 Perguntas
                </button>
            )}

            {isGenerating && (
                <div className="text-center py-10">
                    <Loader2 className="w-10 h-10 animate-spin mx-auto text-[#C5A059]" />
                    <p className="mt-4 text-gray-500">Gerando perguntas...</p>
                </div>
            )}

            {generatedQuestions.length > 0 && (
                <div className="space-y-4 mt-6">
                    {generatedQuestions.map((q, i) => (
                        <div key={q.id} className={`p-4 rounded-xl border ${selectedIndices.includes(i) ? 'border-[#C5A059] bg-[#C5A059]/10' : 'border-gray-200'}`}>
                            <div className="flex items-start gap-3">
                                <input 
                                    type="checkbox" 
                                    checked={selectedIndices.includes(i)}
                                    onChange={() => toggleSelection(i)}
                                    className="mt-1"
                                />
                                <div className="flex-1">
                                    <p className="font-bold">{q.text}</p>
                                    <p className="text-xs text-gray-500 mt-1 italic">Prova: {q.proofText}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                    
                    <div className="flex gap-4 mt-6">
                        <button 
                            onClick={onCancel}
                            className="flex-1 py-3 bg-gray-200 rounded-xl font-bold"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={() => onQuizSaved(selectedIndices.map(i => generatedQuestions[i]))}
                            disabled={selectedIndices.length !== 5}
                            className="flex-1 py-3 bg-[#8B0000] text-white rounded-xl font-bold disabled:opacity-50"
                        >
                            Salvar Quiz ({selectedIndices.length}/5)
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
