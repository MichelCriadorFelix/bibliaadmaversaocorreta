import React, { useState } from 'react';
import { ChevronLeft, CheckCircle, XCircle, FileText, ExternalLink, Brain } from 'lucide-react';
import { DynamicModule } from '../../types';

interface Props {
    module: DynamicModule;
    onBack: () => void;
}

export default function DynamicModuleViewer({ module, onBack }: Props) {
    
    // --- RENDERIZADOR DE QUIZ ---
    if (module.type === 'quiz') {
        const [currentQ, setCurrentQ] = useState(0);
        const [score, setScore] = useState(0);
        const [showResult, setShowResult] = useState(false);
        const [selectedOption, setSelectedOption] = useState<number | null>(null);
        const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

        const questions = module.data?.questions || [];
        const question = questions[currentQ];

        const handleAnswer = (idx: number) => {
            if (selectedOption !== null) return;
            setSelectedOption(idx);
            const correct = idx === question.correctIndex;
            setIsCorrect(correct);
            if (correct) setScore(s => s + 1);
            
            setTimeout(() => {
                if (currentQ < questions.length - 1) {
                    setCurrentQ(c => c + 1);
                    setSelectedOption(null);
                    setIsCorrect(null);
                } else {
                    setShowResult(true);
                }
            }, 1500);
        };

        return (
            <div className="min-h-screen bg-[#FDFBF7] dark:bg-[#121212] flex flex-col">
                <div className="bg-[#8B0000] text-white p-4 flex items-center gap-4 shadow-lg sticky top-0 z-10" style={{ backgroundColor: 'var(--primary-color)' }}>
                    <button onClick={onBack}><ChevronLeft /></button>
                    <h1 className="font-cinzel font-bold truncate">{module.title}</h1>
                </div>

                <div className="flex-1 p-6 max-w-2xl mx-auto w-full">
                    {showResult ? (
                        <div className="text-center bg-white dark:bg-[#1E1E1E] p-8 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 animate-in zoom-in">
                            <Brain className="w-20 h-20 mx-auto text-[#C5A059] mb-4" />
                            <h2 className="font-cinzel text-3xl font-bold mb-2 dark:text-white">Resultado</h2>
                            <p className="text-lg mb-6 dark:text-gray-300">Você acertou <span className="font-bold text-[#8B0000]" style={{ color: 'var(--primary-color)' }}>{score}</span> de {questions.length}!</p>
                            <button onClick={onBack} className="bg-[#8B0000] text-white px-6 py-3 rounded-lg font-bold w-full" style={{ backgroundColor: 'var(--primary-color)' }}>Voltar</button>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="flex justify-between text-sm font-bold text-gray-500">
                                <span>Questão {currentQ + 1}/{questions.length}</span>
                                <span>Placar: {score}</span>
                            </div>
                            
                            <h3 className="font-cormorant text-2xl font-bold text-gray-800 dark:text-white leading-tight">
                                {question.text}
                            </h3>

                            <div className="space-y-3">
                                {question.options.map((opt: string, idx: number) => {
                                    let bgClass = "bg-white dark:bg-[#1E1E1E] border-gray-200 dark:border-gray-700";
                                    if (selectedOption === idx) {
                                        bgClass = isCorrect ? "bg-green-100 border-green-500 text-green-800" : "bg-red-100 border-red-500 text-red-800";
                                    } else if (selectedOption !== null && idx === question.correctIndex) {
                                        bgClass = "bg-green-100 border-green-500 text-green-800 animate-pulse";
                                    }

                                    return (
                                        <button
                                            key={idx}
                                            onClick={() => handleAnswer(idx)}
                                            disabled={selectedOption !== null}
                                            className={`w-full p-4 rounded-xl border text-left transition-all ${bgClass} ${selectedOption === null ? 'hover:bg-gray-50 dark:hover:bg-white/5 active:scale-98' : ''}`}
                                        >
                                            {opt}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // --- RENDERIZADOR DE PÁGINA SIMPLES ---
    if (module.type === 'page') {
        return (
            <div className="min-h-screen bg-[#FDFBF7] dark:bg-[#121212]">
                <div className="bg-[#8B0000] text-white p-4 flex items-center gap-4 shadow-lg sticky top-0 z-10" style={{ backgroundColor: 'var(--primary-color)' }}>
                    <button onClick={onBack}><ChevronLeft /></button>
                    <h1 className="font-cinzel font-bold truncate">{module.title}</h1>
                </div>
                <div className="p-6 max-w-3xl mx-auto prose prose-lg dark:prose-invert">
                    <div dangerouslySetInnerHTML={{ __html: module.data?.html || "<p>Sem conteúdo.</p>" }} />
                </div>
            </div>
        );
    }

    return <div>Tipo de módulo desconhecido.</div>;
}