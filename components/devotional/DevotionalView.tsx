import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ChevronLeft, Calendar, Loader2, Volume2, VolumeX, Edit3, Settings, 
  RefreshCw, Command, ChevronRight, Lock, AlertCircle, FastForward, 
  Type as TypeIcon, Trash2, Flame, Share2, Bookmark, BookOpen, 
  Sparkles, BookMarked, Info, Download, Instagram, Image as ImageIcon
} from 'lucide-react';
import { toPng } from 'html-to-image';
import html2canvas from 'html2canvas';
import { generateContent } from '../../services/geminiService';
import { db } from '../../services/database';
import { Devotional } from '../../types';
import { BIBLE_BOOKS, CHURCH_NAME, CHURCH_INSTAGRAM } from '../../constants';
import { Type as GenType } from "@google/genai";
import { format, addDays, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { fixBiblePronunciation } from '../../utils/ttsHelper';
import { motion, AnimatePresence } from 'framer-motion';

export default function DevotionalView({ onBack, onShowToast, isAdmin, onNavigate }: any) {
  const [devotional, setDevotional] = useState<Devotional | null>(null);
  const cardRef = useRef<HTMLElement>(null);
  const devotionalContentRef = useRef<HTMLDivElement>(null);
  const [sharingImage, setSharingImage] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Carregando...');
  
  // Audio State
  const [isPlaying, setIsPlaying] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [playbackRate, setPlaybackRate] = useState(1);
  
  // NOVA LÓGICA DE ÁUDIO: Controle Indexado
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const wakeLock = useRef<any>(null);

  // Função para manter a tela acesa
  const requestWakeLock = async () => {
      if ('wakeLock' in navigator) {
          try {
              wakeLock.current = await (navigator as any).wakeLock.request('screen');
          } catch (err) {
              console.error('Wake Lock Error:', err);
          }
      }
  };

  // Função para liberar a tela
  const releaseWakeLock = () => {
      if (wakeLock.current) {
          wakeLock.current.release();
          wakeLock.current = null;
      }
  };
  
  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [fontSize, setFontSize] = useState(18);
  
  // Admin State
  const [customCommand, setCustomCommand] = useState('');
  const [showAdminControls, setShowAdminControls] = useState(false);
  
  const today = new Date();
  today.setHours(0,0,0,0); 
  
  const displayDateStr = format(currentDate, 'yyyy-MM-dd');
  const daysDiff = differenceInDays(currentDate, today);
  
  // Regras de Data
  const isFuture = daysDiff > 0;
  const isExpired = daysDiff < -365;

  const audioChunks = useMemo(() => {
      if (!devotional) return [];
      
      let chunks: { text: string, blockId: string }[] = [];

      const addChunks = (text: string, blockId: string) => {
          if (!text) return;
          const cleanText = text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/#/g, '').replace(/\n/g, '. ').trim();
          const sentences = cleanText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleanText];
          sentences.forEach(s => {
              if (s.trim().length > 0) {
                  chunks.push({ text: s.trim(), blockId });
              }
          });
      };

      addChunks(devotional.title, 'dev-title');
      addChunks(`Leitura de ${devotional.reference}`, 'dev-ref');
      addChunks(devotional.verse_text, 'dev-verse');
      
      const bodyParagraphs = devotional.body.split('\n').filter(p => p.trim().length > 0);
      bodyParagraphs.forEach((p, idx) => {
          addChunks(p, `dev-body-${idx}`);
      });

      addChunks(`Vamos orar: ${devotional.prayer}`, 'dev-prayer');

      return chunks;
  }, [devotional]);

  useEffect(() => {
      if (isPlaying && audioChunks.length > 0) {
          window.speechSynthesis.cancel();
          
          if (currentChunkIndex >= audioChunks.length) {
              setIsPlaying(false);
              setCurrentChunkIndex(0);
              return;
          }

          const chunkObj = audioChunks[currentChunkIndex];
          if (!chunkObj || !chunkObj.text.trim()) {
              setCurrentChunkIndex(prev => prev + 1);
              return;
          }

          const activeBlock = document.getElementById(chunkObj.blockId);
          if (activeBlock) {
              const rect = activeBlock.getBoundingClientRect();
              const isVisible = rect.top >= 100 && rect.bottom <= window.innerHeight;
              if (!isVisible) {
                  const y = activeBlock.getBoundingClientRect().top + window.scrollY - 150;
                  window.scrollTo({ top: y, behavior: 'smooth' });
              }
          }

          const utter = new SpeechSynthesisUtterance(fixBiblePronunciation(chunkObj.text));
          utter.lang = 'pt-BR';
          utter.rate = playbackRate;
          const v = voices.find(vo => vo.name === selectedVoice);
          if (v) utter.voice = v;

          utter.onend = () => {
              if (currentChunkIndex + 1 >= audioChunks.length) {
                  releaseWakeLock();
              }
              setCurrentChunkIndex(prev => prev + 1);
          };
          
          utter.onerror = (e) => {
              console.error("Erro no áudio", e);
              setIsPlaying(false);
          };

          window.speechSynthesis.speak(utter);
      }
  }, [isPlaying, currentChunkIndex, audioChunks, playbackRate, selectedVoice, voices]);

  useEffect(() => {
      setCurrentChunkIndex(0);
      setIsPlaying(false);
      window.speechSynthesis.cancel();
      releaseWakeLock();
  }, [devotional]);

  useEffect(() => {
      return () => {
          window.speechSynthesis.cancel();
          releaseWakeLock();
      };
  }, []);

  useEffect(() => {
    loadDevotional();
    
    const loadVoices = () => {
        let available = window.speechSynthesis.getVoices().filter(v => v.lang.includes('pt'));
        available.sort((a, b) => {
            const getScore = (v: SpeechSynthesisVoice) => {
                let score = 0;
                if (v.name.includes('Google')) score += 5;
                if (v.name.includes('Microsoft')) score += 4;
                if (v.name.includes('Luciana')) score += 3; 
                if (v.name.includes('Joana')) score += 3;
                return score;
            };
            return getScore(b) - getScore(a);
        });

        setVoices(available);
        if(available.length > 0 && !selectedVoice) setSelectedVoice(available[0].name);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    
    return () => {
        window.speechSynthesis.cancel();
        setIsPlaying(false);
    };
  }, [displayDateStr]);

  const loadDevotional = async () => {
    setDevotional(null);
    setIsPlaying(false);
    setCurrentChunkIndex(0);
    window.speechSynthesis.cancel();

    if (isFuture) {
        setLoading(false);
        return;
    }

    setLoading(true);
    setStatusMessage('Buscando palavra...');

    try {
        const res = await db.entities.Devotional.filter({ date: displayDateStr });
        
        if (res.length > 0) {
            const foundDevotional = res[0];
            if (isExpired) {
                setStatusMessage('Limpando registros antigos...');
                await db.entities.Devotional.delete(foundDevotional.id!);
                setDevotional(null);
            } else {
                setDevotional(foundDevotional);
            }
        } else {
            if (!isFuture && !isExpired) {
                await generateDevotional(); 
            } else {
                setDevotional(null);
            }
        }
    } catch (e) {
        console.error("Error loading devotional", e);
    } finally {
        setLoading(false);
    }
  };

  const generateDevotional = async (customInstruction?: string) => {
    if (customInstruction && !isAdmin) return;

    setStatusMessage('Explorando as Escrituras...');
    setLoading(true);
    
    let instruction = customInstruction;
    if (!instruction) {
        const randomBook = BIBLE_BOOKS[Math.floor(Math.random() * BIBLE_BOOKS.length)];
        const randomChapter = Math.floor(Math.random() * randomBook.chapters) + 1;
        
        instruction = `
            BASE BÍBLICA OBRIGATÓRIA (ROLETA BÍBLICA): ${randomBook.name} Capítulo ${randomChapter}.
            TAREFA: Encontre uma pérola espiritual, uma lição de vida ou um princípio poderoso ESCONDIDO neste capítulo específico.
            OBJETIVO: Fugir dos versículos "clichês" e repetidos. Surpreenda o leitor com uma extração profunda de um texto que talvez ele não lesse hoje.
            OBSERVAÇÃO TÉCNICA: Se o capítulo for de genealogias, medidas do templo ou leis cerimoniais, extraia o PRINCÍPIO ESPIRITUAL por trás.
        `;
    }
    
    const prompt = `
        ATUE COMO: Michel Felix, teólogo Pentecostal Clássico.
        TAREFA: Criar um devocional para ${format(currentDate, 'dd/MM/yyyy')}.
        ${instruction}
        REGRAS DE FORMATAÇÃO VISUAL (CRÍTICO):
        1. O campo 'body' DEVE conter quebras de linha duplas (\\n\\n) para separar os parágrafos.
        2. SEM MARKDOWN: Não use asteriscos (**), negrito ou caracteres especiais.
        3. TAMANHO: Aprox. 300 palavras no total para o 'body'.
        ESTRUTURA OBRIGATÓRIA:
        - summary: Um resumo do devocional entre 10 a 30 palavras para ser exibido no card principal.
        - body (3 PARÁGRAFOS):
          - Parágrafo 1 (O Texto): Contexto e intenção do autor.
          - Parágrafo 2 (A Aplicação): Aplicação cotidana.
          - Parágrafo 3 (A Prática): Conclusão reflexiva.
        - prayer: Contextualizada.
        Retorne JSON válido.
    `;

    const schema = {
        type: GenType.OBJECT,
        properties: {
            title: { type: GenType.STRING },
            reference: { type: GenType.STRING },
            verse_text: { type: GenType.STRING },
            summary: { type: GenType.STRING },
            body: { type: GenType.STRING },
            prayer: { type: GenType.STRING }
        },
        required: ["title", "reference", "verse_text", "summary", "body", "prayer"]
    };

    try {
        const res = await generateContent(prompt, schema);
        if (!res || !res.title) throw new Error("Falha na geração");

        const data: Devotional = { ...res, date: displayDateStr, is_published: true };
        const existingItems = await db.entities.Devotional.filter({ date: displayDateStr });
        if (existingItems.length > 0) {
            for (const item of existingItems) {
                if (item.id) await db.entities.Devotional.delete(item.id);
            }
        }

        await db.entities.Devotional.create(data);
        setDevotional(data);
        
        if (customInstruction) {
            onShowToast('Devocional regenerado com nova formatação!', 'success');
            setShowAdminControls(false);
            setCustomCommand('');
        }
    } catch (e) {
        console.error(e);
        if (customInstruction) onShowToast('Erro ao gerar devocional', 'error');
    } finally {
        setLoading(false);
    }
  };

  const togglePlay = () => {
    if(!devotional) return;
    if (isPlaying) {
        window.speechSynthesis.cancel();
        setIsPlaying(false);
        releaseWakeLock();
    } else {
        if (audioChunks.length === 0) return;
        setIsPlaying(true);
        requestWakeLock();
    }
  };

  const handleShare = async (platform: 'whatsapp' | 'instagram') => {
    if (!devotional || !cardRef.current) return;
    setSharingImage(true);
    onShowToast(`Preparando para o ${platform === 'whatsapp' ? 'WhatsApp' : 'Instagram'}...`, 'info');

    const isWindows = navigator.platform.indexOf('Win') > -1 || navigator.userAgent.indexOf('Windows') > -1;

    try {
      let dataUrl = '';
      
      if (isWindows) {
        // Capture the HERO CARD (cardRef) for Windows
        const canvas = await html2canvas(cardRef.current, {
          scale: 3, 
          useCORS: true,
          backgroundColor: '#1a0f0f',
          logging: false
        });
        dataUrl = canvas.toDataURL('image/png', 0.95);
      } else {
        // Mobile flow for HERO CARD
        dataUrl = await toPng(cardRef.current, { 
          cacheBust: true,
          pixelRatio: 2.5,
          backgroundColor: '#1a0f0f'
        });
      }

      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const filename = `Versiculo_ADMA_${format(currentDate, 'yyyy-MM-dd')}.png`;
      const file = new File([blob], filename, { type: 'image/png' });

      // Prepare FULL text (Title + Meditation + Prayer)
      const fullDevotionalText = `*${CHURCH_NAME}*\n\n*${devotional.title.toUpperCase()}*\n${devotional.reference}\n\n"${devotional.verse_text.trim()}"\n\n*Reflexão:*\n${devotional.body}\n\n*Oração:*\n${devotional.prayer}\n\nSiga-nos: ${CHURCH_INSTAGRAM}\nLeia mais no App Bíblia ADMA.`;

      // Copy text to clipboard immediately regardless of platform
      try {
          await navigator.clipboard.writeText(fullDevotionalText);
          if (platform === 'instagram') {
            onShowToast('Texto do devocional copiado! Basta colar na legenda.', 'success');
          }
      } catch (e) {
          console.warn('Clipboard fallback');
      }

      const canShareFiles = navigator.share && navigator.canShare && navigator.canShare({ files: [file] });

      if (canShareFiles && !isWindows) {
        await navigator.share({
          files: [file],
          title: devotional.title,
          text: platform === 'whatsapp' ? fullDevotionalText : '',
        });
      } else {
        // Desktop / Windows Fallback
        try {
          const item = new ClipboardItem({ [file.type]: blob });
          await navigator.clipboard.write([item]);
          onShowToast('Imagem e texto copiados! Use Ctrl+V no seu app.', 'success');
        } catch (clipboardErr) {
          const link = document.createElement('a');
          link.download = filename;
          link.href = dataUrl;
          link.click();
          onShowToast('Texto copiado e imagem baixada!', 'success');
        }
      }
    } catch (err) {
      console.error('Error sharing:', err);
      onShowToast('Erro ao processar imagem. Tentando compartilhar apenas o texto...', 'warning');
      const shareText = `*${CHURCH_NAME}*\n\n*${devotional.title.toUpperCase()}*\n${devotional.reference}\n\n"${devotional.verse_text.trim()}"\n\nSiga-nos no Instagram: ${CHURCH_INSTAGRAM}`;
      navigator.clipboard.writeText(shareText);
    } finally {
      setSharingImage(false);
    }
  };

  const handlePrevDay = () => setCurrentDate(addDays(currentDate, -1));
  const handleNextDay = () => setCurrentDate(addDays(currentDate, 1));

  const cleanTextDisplay = (text: string) => {
    return text ? text.replace(/\*\*/g, '').replace(/##/g, '').trim() : '';
  };

  return (
    <div className="min-h-screen bg-surface dark:bg-dark-bg selection:bg-secondary/30 transition-colors duration-300">
      {/* TopAppBar */}
      <header className="fixed top-0 left-0 right-0 z-[60] bg-surface dark:bg-dark-bg/95 backdrop-blur-md border-b border-outline-variant/30">
        <div className="flex justify-between items-center w-full px-margin-mobile max-w-2xl mx-auto h-16">
          <button onClick={onBack} className="p-2 -ml-2 text-primary dark:text-primary-fixed hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-all">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="font-cinzel text-lg font-black text-primary dark:text-primary-fixed tracking-tight uppercase">Bíblia ADMA</h1>
          <div className="flex items-center gap-1">
            {isAdmin && (
              <button 
                onClick={() => setShowAdminControls(!showAdminControls)} 
                className={`p-2 rounded-full transition-all ${showAdminControls ? 'bg-primary text-white' : 'text-primary dark:text-primary-fixed hover:bg-gray-100 dark:hover:bg-white/5'}`}
              >
                <Edit3 className="w-5 h-5" />
              </button>
            )}
            <button 
              onClick={() => setShowSettings(!showSettings)} 
              className={`p-2 rounded-full transition-all ${showSettings ? 'bg-primary text-white' : 'text-primary dark:text-primary-fixed hover:bg-gray-100 dark:hover:bg-white/5'}`}
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Date Selector */}
      <div className="pt-16">
        <div className="bg-[#1a0f0f] dark:bg-black text-[#C5A059] p-3 flex items-center justify-between shadow-md relative z-50">
           <button onClick={handlePrevDay} className="p-2 hover:text-white transition active:scale-90"><ChevronLeft className="w-6 h-6" /></button>
           <div className="flex items-center gap-2 font-montserrat font-bold uppercase tracking-wider text-[10px] md:text-xs">
              <Calendar className="w-4 h-4" />
              {currentDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
           </div>
           <button onClick={handleNextDay} className="p-2 hover:text-white transition active:scale-90"><ChevronRight className="w-6 h-6" /></button>
        </div>
      </div>

      <AnimatePresence>
        {showSettings && (
           <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white dark:bg-dark-card p-6 border-b border-[#C5A059] shadow-xl z-[40] relative"
           >
              <div className="max-w-2xl mx-auto flex flex-col gap-6">
                  {devotional && audioChunks.length > 0 && (
                      <div className="bg-gray-50 dark:bg-black/40 p-4 rounded-2xl border border-gray-100 dark:border-white/5">
                          <div className="flex justify-between items-center mb-3">
                              <span className="text-[10px] font-black text-primary-deep dark:text-[#ff6b6b] uppercase tracking-widest flex items-center gap-2"><Volume2 className="w-4 h-4"/> PROGRESSO DA NARRAÇÃO</span>
                              <span className="text-[10px] font-mono text-gray-400 bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded-full">{currentChunkIndex + 1} / {audioChunks.length}</span>
                          </div>
                          <input 
                              type="range" 
                              min="0" 
                              max={Math.max(0, audioChunks.length - 1)} 
                              value={currentChunkIndex} 
                              onChange={(e) => {
                                  const newIndex = Number(e.target.value);
                                  setCurrentChunkIndex(newIndex);
                                  if(isPlaying) window.speechSynthesis.cancel();
                              }}
                              className="w-full accent-primary h-1.5 bg-gray-200 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer"
                          />
                          <p className="text-center text-[10px] text-gray-400 mt-2 italic truncate opacity-70">
                              {audioChunks[currentChunkIndex] ? `"${audioChunks[currentChunkIndex].text.substring(0, 40)}..."` : 'Fim da leitura'}
                          </p>
                      </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                          <span className="font-montserrat text-xs font-black uppercase text-gray-500 tracking-widest flex items-center gap-2">
                              <TypeIcon className="w-4 h-4" /> Fonte:
                          </span>
                          <div className="flex items-center gap-4 text-black dark:text-white">
                              <button onClick={() => setFontSize(Math.max(14, fontSize - 2))} className="w-10 h-10 flex items-center justify-center border border-gray-200 dark:border-white/10 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 font-bold">-</button>
                              <span className="font-bold w-6 text-center text-sm">{fontSize}</span>
                              <button onClick={() => setFontSize(Math.min(32, fontSize + 2))} className="w-10 h-10 flex items-center justify-center border border-gray-200 dark:border-white/10 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 font-bold">+</button>
                          </div>
                      </div>

                      <div className="space-y-2">
                        <span className="font-montserrat text-xs font-black uppercase text-gray-500 tracking-widest flex items-center gap-2">
                            <FastForward className="w-4 h-4" /> Velocidade:
                        </span>
                        <div className="flex gap-2">
                            {[0.75, 1, 1.25, 1.5].map(rate => (
                                <button 
                                    key={rate}
                                    onClick={() => setPlaybackRate(rate)}
                                    className={`flex-1 py-3 text-[10px] font-black rounded-xl border transition-all ${playbackRate === rate ? 'bg-primary text-white border-primary shadow-lg scale-105' : 'bg-gray-50 dark:bg-gray-800 dark:text-gray-300 border-gray-100 dark:border-white/5 hover:bg-gray-100'}`}
                                >
                                    {rate}x
                                </button>
                            ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                        <label className="font-montserrat text-xs font-black uppercase text-gray-500 tracking-widest flex items-center gap-2">Voz do Narrador:</label>
                        <select 
                          className="w-full p-4 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-white/5 rounded-2xl mt-1 dark:text-white outline-none focus:ring-2 focus:ring-primary text-sm font-medium" 
                          value={selectedVoice} 
                          onChange={e => setSelectedVoice(e.target.value)}
                        >
                            {voices.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                        </select>
                        <p className="text-[9px] text-gray-400 mt-2 uppercase tracking-tighter">Vozes do sistema (depende do seu dispositivo)</p>
                    </div>
                  </div>
              </div>
           </motion.div>
        )}
      </AnimatePresence>

      {isAdmin && showAdminControls && !isFuture && !isExpired && (
        <div className="bg-primary/5 dark:bg-gray-900/50 p-6 border-b border-primary/20 backdrop-blur-sm">
            <div className="max-w-2xl mx-auto">
              <h3 className="font-cinzel font-black text-xs mb-4 flex items-center gap-2 text-primary-deep dark:text-[#ff6b6b] tracking-widest"><Command className="w-4 h-4"/> PAINEL DE COMANDO TEOLÓGICO</h3>
              <textarea 
                  value={customCommand} 
                  onChange={e => setCustomCommand(e.target.value)} 
                  placeholder="Ex: Refaça este devocional focando na esperança para aqueles que sofrem de ansiedade..." 
                  className="w-full p-4 bg-white dark:bg-black/40 text-sm rounded-2xl mb-4 border border-primary/10 focus:ring-2 focus:ring-primary outline-none min-h-[100px] shadow-inner"
              />
              <button 
                  onClick={() => generateDevotional(customCommand)} 
                  disabled={loading}
                  className="w-full bg-primary text-white font-cinzel font-bold py-4 rounded-2xl text-xs tracking-[0.2em] shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
              >
                  {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <RefreshCw className="w-5 h-5"/>} 
                  {customCommand ? 'EXECUTAR COMANDO PERSONALIZADO' : 'REGERAR DEVOCIONAL'}
              </button>
            </div>
        </div>
      )}

      <main className="max-w-2xl mx-auto px-6 pb-32">
        {loading ? (
            <div className="text-center py-20 animate-in fade-in duration-700">
                <div className="relative inline-block mb-6">
                    <Loader2 className="w-16 h-16 animate-spin text-primary dark:text-white" />
                    <Sparkles className="w-6 h-6 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[#C5A059]" />
                </div>
                <h2 className="font-cinzel text-xl font-black text-primary-deep dark:text-white tracking-widest">{statusMessage}</h2>
                <p className="text-[10px] font-montserrat uppercase tracking-[0.3em] text-gray-400 mt-3 animate-pulse">Preparando o alimento diário...</p>
            </div>
        ) : isFuture ? (
            <div className="text-center py-20 pt-32">
                <div className="w-24 h-24 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-8 border border-gray-200 dark:border-white/10">
                    <Lock className="w-10 h-10 text-gray-300" />
                </div>
                <h2 className="font-cinzel text-3xl font-black text-primary-deep dark:text-[#ff6b6b] mb-4">Aguarde</h2>
                <p className="font-montserrat text-sm text-gray-500 dark:text-gray-400 max-w-xs mx-auto leading-relaxed mb-8">Esta mensagem especial de edificação está sendo preparada e será desbloqueada em:</p>
                <div className="bg-[#1a0f0f] text-[#C5A059] inline-block px-10 py-5 rounded-3xl font-black font-mono text-2xl shadow-2xl border border-[#C5A059]/30">
                    {format(currentDate, "dd/MM/yyyy")}
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mt-10 opacity-60">Liberado automaticamente à meia-noite.</p>
            </div>
        ) : isExpired ? (
            <div className="text-center py-24">
                <div className="relative inline-block mb-8">
                  <div className="w-24 h-24 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center">
                      <Trash2 className="w-10 h-10 text-gray-300" />
                  </div>
                  <AlertCircle className="w-8 h-8 absolute -top-1 -right-1 text-red-500 bg-white dark:bg-black rounded-full" />
                </div>
                <h2 className="font-cinzel text-2xl font-black text-gray-800 dark:text-white mb-4">Arquivo Expirado</h2>
                <p className="max-w-xs mx-auto text-sm text-gray-500 leading-relaxed mb-8">Devocionais com mais de 365 dias são removidos automaticamente para otimizar a experiência do aplicativo.</p>
                <button onClick={onBack} className="font-cinzel font-bold text-primary dark:text-[#C5A059] flex items-center gap-2 mx-auto hover:underline uppercase tracking-widest text-xs">
                    <ChevronLeft className="w-4 h-4" /> Voltar ao Início
                </button>
            </div>
        ) : devotional ? (
            <div className="pt-8 animate-in slide-in-from-bottom-6 duration-700">
                {/* Verse of the Day Hero Section - REDESIGNED */}
                <section 
                  ref={cardRef}
                  className="relative w-full rounded-[40px] overflow-hidden bg-primary-deep shadow-2xl border border-outline-variant/30 mb-8 aspect-[4/5] md:aspect-[3/4]"
                >
                    <img 
                      className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-30" 
                      alt="Antique Bible Background"
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuDyqYVyFsyxwcn6fwQCjpFTs1SK1G9fL3aL4AqY0OgUnG6GwLp7oXSwuFSc6Yqedb7DtWlVWs9qK0YbH3jpZb0bBZc-KrM-m1JpBA-HXwG2ukf5_ZJns9mrlqG4FYGhbwHRsl-smKVJGHG9jK8PI6I4KUFl-QSQlfbPxTIwE2uJlQVUwjd701WwsnJUtezj8a0PH1XRaX_ToVzPjZEIv7wsgZWw0b5GRtcGylM9GEAOdYkZte2hQKBGZgfcx3s-yfIkn7Njye9XKQ" 
                    />
                    
                    <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-primary-deep flex flex-col p-8 md:p-10">
                        {/* Church Info Top */}
                        <div className="flex flex-col items-center mb-8 text-center">
                            <span className="text-[9px] text-white/40 font-montserrat font-black uppercase tracking-[0.3em] mb-2 px-4 py-1 border border-white/5 rounded-full bg-black/20">
                                Devocional diário: {format(currentDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                            </span>
                            <span className="font-cinzel text-[10px] md:text-xs font-black text-[#C5A059] tracking-[0.3em] uppercase mb-1">
                                {CHURCH_NAME}
                            </span>
                            <div className="flex items-center gap-2 text-white/50 font-montserrat text-[8px] font-black tracking-widest uppercase">
                                <Instagram className="w-3 h-3 text-[#C5A059]" />
                                {CHURCH_INSTAGRAM}
                            </div>
                        </div>

                        {/* Verse at the Top Center */}
                        <div className="flex-1 flex flex-col items-center justify-start pt-4">
                            <motion.div 
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="inline-flex items-center px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 mb-6"
                            >
                                <BookMarked className="w-3 h-3 text-[#C5A059] mr-2" />
                                <span className="font-montserrat text-[8px] font-black tracking-widest text-[#C5A059] uppercase">VERSÍCULO CHAVE</span>
                            </motion.div>
                            
                            <h2 id="dev-verse" className={`font-cinzel text-xl md:text-3xl text-white text-center italic mb-4 leading-tight transition-all duration-300 drop-shadow-xl ${isPlaying && audioChunks[currentChunkIndex]?.blockId === 'dev-verse' ? 'text-secondary scale-105' : ''}`}>
                                "{cleanTextDisplay(devotional.verse_text)}"
                            </h2>
                            
                            <p id="dev-ref" className={`font-montserrat text-[10px] text-primary-fixed tracking-[0.3em] font-black uppercase transition-colors duration-300 ${isPlaying && audioChunks[currentChunkIndex]?.blockId === 'dev-ref' ? 'text-secondary' : ''}`}>
                              {devotional.reference}
                            </p>
                        </div>

                        {/* Summary at the Bottom */}
                        <div className="mt-auto border-t border-white/10 pt-6">
                            <p className="font-cormorant text-sm md:text-base text-gray-300 italic text-center leading-relaxed">
                                {devotional.summary || "Reflexão diária para fortalecer sua fé no Senhor."}
                            </p>
                        </div>
                    </div>
                </section>

                {/* Actions Cluster - Unified */}
                <div className="flex flex-col gap-4 mb-12">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <button 
                          onClick={() => handleShare('whatsapp')}
                          disabled={sharingImage}
                          className="flex items-center justify-center gap-4 bg-primary-deep py-5 rounded-[32px] text-white font-montserrat text-[11px] font-black tracking-[0.2em] shadow-2xl hover:bg-black transition-all active:scale-95 disabled:opacity-50"
                        >
                            {sharingImage ? <Loader2 className="w-5 h-5 animate-spin text-secondary" /> : <Share2 className="w-5 h-5 text-secondary" />}
                            WHATSAPP
                        </button>
                        <button 
                          onClick={() => handleShare('instagram')}
                          disabled={sharingImage}
                          className="flex items-center justify-center gap-4 bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] py-5 rounded-[32px] text-white font-montserrat text-[11px] font-black tracking-[0.2em] shadow-2xl hover:opacity-90 transition-all active:scale-95 disabled:opacity-50"
                        >
                            {sharingImage ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : <Instagram className="w-5 h-5 text-white" />}
                            INSTAGRAM
                        </button>
                    </div>
                    <p className="text-[9px] text-gray-400 text-center font-black uppercase tracking-widest opacity-60">Envia imagem e texto formatado</p>
                </div>

                {/* Devotional Content - NEW CAPTURE TARGET */}
                <article 
                    ref={devotionalContentRef}
                    className="space-y-10 bg-white dark:bg-[#1a0f0f] rounded-[40px] p-8 md:p-12 mb-12 shadow-2xl border border-outline-variant/20 relative overflow-hidden"
                >
                    {/* Visual elements for when this is shared as an image */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -mr-32 -mt-32 blur-3xl pointer-events-none"></div>
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-secondary/5 rounded-full -ml-32 -mb-32 blur-3xl pointer-events-none"></div>

                    <div className="flex items-center gap-6 relative z-10">
                        <div className="h-[1px] flex-1 bg-outline-variant/30"></div>
                        <div className="flex flex-col items-center">
                            <span className="font-cinzel font-black text-[10px] text-primary-deep dark:text-[#C5A059] tracking-[0.4em] uppercase">Meditação Diária</span>
                            <span className="text-[8px] font-montserrat font-bold text-gray-400 mt-1 uppercase tracking-widest">{CHURCH_NAME}</span>
                        </div>
                        <div className="h-[1px] flex-1 bg-outline-variant/30"></div>
                    </div>

                    <div className="space-y-8 relative z-10">
                        <h2 id="dev-title" className={`font-cinzel text-3xl font-black text-primary-deep dark:text-white leading-tight transition-all duration-300 ${isPlaying && audioChunks[currentChunkIndex]?.blockId === 'dev-title' ? 'text-[#C5A059] scale-[1.02] origin-left' : ''}`}>
                          {cleanTextDisplay(devotional.title)}
                        </h2>

                        <div className="flex items-center gap-2 mb-4">
                            <BookMarked className="w-4 h-4 text-secondary" />
                            <span className="font-montserrat text-xs font-black text-secondary tracking-widest uppercase">{devotional.reference}</span>
                        </div>

                        <div 
                          className="font-cormorant leading-relaxed text-gray-800 dark:text-gray-100 text-justify space-y-6"
                          style={{ fontSize: `${fontSize}px` }}
                        >
                            {devotional.body.split('\n').filter(p => p.trim().length > 0).map((p, idx) => (
                                <p 
                                  key={idx} 
                                  id={`dev-body-${idx}`} 
                                  className={`transition-all duration-500 px-2 -mx-2 rounded-2xl ${idx === 0 ? 'first-letter:text-6xl first-letter:font-cinzel first-letter:text-primary-deep first-letter:mr-4 first-letter:float-left first-letter:leading-none' : ''} ${isPlaying && audioChunks[currentChunkIndex]?.blockId === `dev-body-${idx}` ? 'bg-primary/5 dark:bg-[#C5A059]/10 text-primary-deep font-bold border-l-4 border-secondary' : ''}`}
                                >
                                    {cleanTextDisplay(p)}
                                </p>
                            ))}
                        </div>
                    </div>

                    <div id="dev-prayer" className={`pt-10 space-y-4 border-t border-outline-variant/20 relative z-10 transition-all duration-500 ${isPlaying && audioChunks[currentChunkIndex]?.blockId === 'dev-prayer' ? 'scale-[1.02]' : ''}`}>
                        <div className="flex items-center gap-3">
                          <Flame className="w-4 h-4 text-secondary" />
                          <h3 className="font-cinzel font-black text-sm text-primary-deep dark:text-white tracking-widest uppercase">Oração</h3>
                        </div>
                        <p className={`font-cormorant italic leading-relaxed text-gray-700 dark:text-gray-300 transition-all duration-500 ${isPlaying && audioChunks[currentChunkIndex]?.blockId === 'dev-prayer' ? 'text-primary-deep dark:text-secondary font-bold' : 'opacity-80'}`}>
                            "{cleanTextDisplay(devotional.prayer)}"
                        </p>
                    </div>

                    {/* Branding for Image Share */}
                    <div className="pt-8 mt-8 border-t border-outline-variant/10 flex justify-between items-center opacity-40">
                        <span className="font-cinzel text-[8px] font-black tracking-widest uppercase">Bíblia ADMA</span>
                        <span className="font-montserrat text-[8px] font-bold tracking-tighter">{CHURCH_INSTAGRAM}</span>
                    </div>
                </article>

                    {/* Suggested Reading Footer Card */}
                    <section className="mt-16 p-10 bg-tertiary-container dark:bg-black/40 rounded-[40px] border border-on-tertiary-container/10 flex flex-col items-center text-center shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-3xl group-hover:scale-150 transition-transform duration-700"></div>
                        <BookOpen className="w-12 h-12 text-on-tertiary-container mb-6 opacity-60" />
                        <h4 className="font-cinzel font-black text-lg text-on-tertiary-container mb-3 tracking-widest uppercase">Leitura Sugerida</h4>
                        <p className="font-cormorant text-lg text-on-tertiary-container opacity-80 mb-8 leading-relaxed max-w-xs">Aprofunde sua reflexão lendo o capítulo completo de <span className="font-bold underline decoration-dotted">{devotional.reference}</span>.</p>
                        <button 
                          onClick={() => {
                            if (!devotional) return;
                            const ref = devotional.reference;
                            const regex = /(.+)\s(\d+)(?::(\d+))?/;
                            const match = ref.match(regex);
                            
                            if (match) {
                                const book = match[1].trim();
                                const chapter = parseInt(match[2]);
                                const verse = match[3] ? parseInt(match[3]) : 1;
                                onNavigate('reader', { book, chapter, verse });
                            } else {
                                onShowToast('Não foi possível identificar o capítulo bíblico.', 'error');
                            }
                          }}
                          className="w-full bg-on-tertiary-container text-tertiary-container font-montserrat text-[10px] font-black py-5 rounded-3xl tracking-[0.3em] uppercase hover:shadow-lg active:scale-95 transition-all shadow-md"
                        >
                            ABRIR CAPÍTULO COMPLETO
                        </button>
                    </section>
                </div>
            ) : (
            <div className="text-center py-20 text-gray-500 dark:text-gray-400">
                <div className="w-16 h-16 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Info className="w-8 h-8 text-gray-300" />
                </div>
                <h2 className="font-cinzel font-black text-lg opacity-60 uppercase tracking-widest">Alimento Não Encontrado</h2>
                <p className="text-sm mt-2 max-w-xs mx-auto opacity-50 font-cormorant">Ocorreu uma falha na conexão espiritual. Tente buscar novamente os manuscritos.</p>
                <button 
                    onClick={() => loadDevotional()}
                    className="mt-8 px-8 py-3 bg-primary text-white rounded-full font-cinzel font-bold text-[10px] tracking-widest shadow-xl active:scale-95 transition-all"
                >
                    BUSCAR NOVAMENTE
                </button>
            </div>
        )}
      </main>

      {/* Floating Action Buttons */}
      {!isFuture && !isExpired && devotional && (
          <div className="fixed bottom-24 right-6 flex flex-col gap-4 z-50">
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={togglePlay}
              className={`w-14 h-14 rounded-2xl shadow-2xl flex items-center justify-center transition-all border-2 border-white dark:border-white/10 ${isPlaying ? 'bg-[#1a0f0f] text-[#C5A059]' : 'bg-[#C5A059] text-[#1a0f0f]'}`}
            >
              {isPlaying ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6 animate-pulse" />}
            </motion.button>
          </div>
      )}
    </div>
  );
}
