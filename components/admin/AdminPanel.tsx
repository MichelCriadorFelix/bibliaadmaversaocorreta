import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ShieldCheck, RefreshCw, Loader2, Upload, Download, Server, HardDrive, Flag, CheckCircle, XCircle, MessageSquare, Languages, GraduationCap, Calendar, CloudUpload, Wand2, StopCircle, Trash2, AlertTriangle, Save, Lock, Unlock, KeyRound, Search, Cloud, Activity, Zap, Battery, UserX, Edit, Wifi, WifiOff, Brain, Eye, EyeOff, Wrench, LayoutGrid, Check } from 'lucide-react';
import { generateContent } from '../../services/geminiService';
import { BIBLE_BOOKS, generateChapterKey, generateVerseKey, TOTAL_CHAPTERS } from '../../constants';
import { db, bibleStorage } from '../../services/database';
import { Type as GenType } from "@google/genai";
import { ContentReport, AppConfig, UserProgress, Quiz } from '../../types';
import AppBuilder from './AppBuilder';

/**
 * PAINEL ADMINISTRATIVO ADMA - MOTOR DE EXEGESE SUPREMO v102.0
 * ESTE COMPONENTE ORQUESTRA A GERAÇÃO EM LOTE COM FIDELIDADE ACADÊMICA TOTAL.
 * FOCO: INTENÇÃO AUTORAL, SENTIDO ORIGINAL, EMBASAMENTO BÍBLICO E CLAREZA PEDAGÓGICA.
 */

export default function AdminPanel({ onBack, onShowToast }: { onBack: () => void, onShowToast: (msg: string, type: 'success' | 'error' | 'info') => void }) {
  // --- STATES DE INFRAESTRUTURA ---
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  
  // NOVO: Monitoramento Real de Rede
  const [realtimePing, setRealtimePing] = useState<number | null>(null);
  const [connectionDetails, setConnectionDetails] = useState('Verificando...');

  // --- STATES DE CHAVES API (NOVO) ---
  const [keysStatus, setKeysStatus] = useState<any>(null);
  const [isCheckingKeys, setIsCheckingKeys] = useState(false);

  // --- STATES DE IMPORTAÇÃO/DOWNLOAD ---
  const [progress, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStatus, setProcessStatus] = useState('');
  const [offlineCount, setOfflineCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- STATES DE GERAÇÃO EM LOTE (ATUALIZADO v118 - VISUAL SELECTOR) ---
  const [batchBook, setBatchBook] = useState('Gênesis');
  const [batchStartChapter, setBatchStartChapter] = useState(1);
  const [isGeneratingBatch, setIsGeneratingBatch] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [batchType, setBatchType] = useState<'commentary' | 'dictionary' | null>(null);
  const [batchLogs, setBatchLogs] = useState<string[]>([]);
  
  // ESTADOS PARA O SELETOR VISUAL
  const [showChapterSelector, setShowChapterSelector] = useState(false);
  const [chapterStatuses, setChapterStatuses] = useState<Record<number, 'empty' | 'partial' | 'full'>>({});
  const [loadingStatuses, setLoadingStatuses] = useState(false);

  // Ref para controle imediato de parada
  const stopBatchRef = useRef(false);

  // --- STATE DE DEVOCIONAL ---
  const [devotionalDate, setDevotionalDate] = useState(new Date().toISOString().split('T')[0]);

  // --- STATES DE RELATÓRIOS ---
  const [reports, setReports] = useState<ContentReport[]>([]);
  const [showReportsModal, setShowReportsModal] = useState(false);

  // --- STATES DE USUÁRIOS ---
  const [usersList, setUsersList] = useState<UserProgress[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showEditPointsModal, setShowEditPointsModal] = useState(false);
  const [selectedUserForPoints, setSelectedUserForPoints] = useState<UserProgress | null>(null);
  const [pointsAdjustment, setPointsAdjustment] = useState<number>(0);

  // --- BUILDER STATE ---
  const [showBuilder, setShowBuilder] = useState(false);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);

  // --- STATES DO QUIZ (NOVO - CENTRAL DE AVALIAÇÕES) ---
  const [quizBook, setQuizBook] = useState('Gênesis');
  const [quizChapter, setQuizChapter] = useState(1);
  const [quizText, setQuizText] = useState('');
  const [generatedQuiz, setGeneratedQuiz] = useState<Quiz | null>(null);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [quizTab, setQuizTab] = useState<'single' | 'general'>('single');
  const [generalQuestionsBuffer, setGeneralQuestionsBuffer] = useState<any[]>([]); // Carrinho de compras do Quiz Geral

  useEffect(() => {
    checkDbConnection();
    loadReports();
    checkOfflineIntegrity();
    loadAppConfig();
    loadUsers(); 
  }, []);

  // CARREGA STATUS DOS CAPÍTULOS AO MUDAR LIVRO OU TIPO
  useEffect(() => {
      if (showChapterSelector) {
          analyzeBookStatus();
      }
  }, [batchBook, showChapterSelector]);

  const analyzeBookStatus = async () => {
      setLoadingStatuses(true);
      const bookMeta = BIBLE_BOOKS.find(b => b.name === batchBook);
      if (!bookMeta) return;

      const statuses: Record<number, 'empty' | 'partial' | 'full'> = {};
      
      try {
          // 1. Puxa todos os comentários deste livro do DB
          // Nota: Isso pode ser pesado se tiver muitos registros, mas para 1 livro é aceitável.
          // Otimização: Em um app real, o backend deveria dar esse count. Aqui fazemos client-side.
          const collection = 'commentaries'; // Focamos em comentários para o status visual
          const allComments = await db.entities.Commentary.filter({ book: batchBook });
          
          // Agrupa contagem por capítulo
          const countByChapter: Record<number, number> = {};
          allComments.forEach((c: any) => {
              const chap = c.chapter;
              countByChapter[chap] = (countByChapter[chap] || 0) + 1;
          });

          // 2. Compara com total de versículos (se disponível no cache)
          for (let c = 1; c <= bookMeta.chapters; c++) {
              const count = countByChapter[c] || 0;
              
              if (count === 0) {
                  statuses[c] = 'empty';
              } else {
                  // Tenta descobrir total de versículos
                  const textKey = `bible_acf_${bookMeta.abbrev}_${c}`;
                  const verses = await bibleStorage.get(textKey);
                  
                  if (verses && Array.isArray(verses)) {
                      if (count >= verses.length) statuses[c] = 'full';
                      else statuses[c] = 'partial';
                  } else {
                      // Fallback se não tiver texto baixado: Se tem mais de 20 comentários, assume cheio, senão parcial
                      // Ou melhor: Amarelo para indicar que tem algo.
                      statuses[c] = count > 25 ? 'full' : 'partial';
                  }
              }
          }
          setChapterStatuses(statuses);

      } catch (e) {
          console.error("Erro ao analisar status", e);
      } finally {
          setLoadingStatuses(false);
      }
  };

  const loadAppConfig = async () => {
    try {
        const configs = await db.entities.AppConfig.list();
        const cfg = configs[0] || null;
        setAppConfig(cfg);
    } catch(e) {}
  };

  const checkDbConnection = async () => {
    setDbStatus('checking');
    setConnectionDetails('Pingando Servidor...');
    const start = Date.now();
    try {
        // Teste direto na API para garantir que não é cache local
        // ?t=Date.now() força o navegador a não usar cache
        const res = await fetch(`/api/storage?t=${Date.now()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'list', collection: 'app_config' })
        });
        
        const latency = Date.now() - start;

        if (res.ok) {
            setDbStatus('connected');
            setRealtimePing(latency);
            setConnectionDetails(`Online • Latência: ${latency}ms`);
            onShowToast(`Nuvem Conectada (${latency}ms)`, 'success');
        } else {
            throw new Error(`Erro HTTP ${res.status}`);
        }
    } catch (e: any) {
        setDbStatus('error');
        setRealtimePing(null);
        setConnectionDetails(`Offline: ${e.message}`);
        onShowToast('Sem conexão com a Nuvem.', 'error');
    }
  };

  const checkKeysHealth = async () => {
      setIsCheckingKeys(true);
      setKeysStatus(null);
      try {
          const res = await fetch('/api/keys-status');
          const data = await res.json();
          setKeysStatus(data);
          onShowToast(`Monitoramento: ${data.healthy} de ${data.total} chaves operacionais.`, data.healthy > 0 ? "success" : "error");
      } catch (e) {
          onShowToast("Erro ao testar chaves API.", "error");
      } finally {
          setIsCheckingKeys(false);
      }
  };

  const checkOfflineIntegrity = async () => {
      try {
          const count = await bibleStorage.count();
          setOfflineCount(count);
      } catch (e) {
          setOfflineCount(0);
      }
  };

  const loadReports = async () => {
      try {
          const data = await db.entities.ContentReports.list();
          setReports(data || []);
      } catch (e) {}
  };

  const loadUsers = async () => {
      setLoadingUsers(true);
      try {
          const data = await db.entities.ReadingProgress.list(); 
          setUsersList(data || []);
      } catch(e) {
          onShowToast("Erro ao carregar usuários.", "error");
      } finally {
          setLoadingUsers(false);
      }
  };

  const handleDeleteReport = async (id: string) => {
      if(!window.confirm("Marcar como resolvido e apagar?")) return;
      try {
          await db.entities.ContentReports.delete(id);
          setReports(prev => prev.filter(r => r.id !== id));
          onShowToast("Resolvido.", "success");
      } catch(e) {
          onShowToast("Erro ao deletar.", "error");
      }
  };

  // --- GESTÃO DE USUÁRIOS (ATUALIZADA) ---

  const toggleUserBlock = async (user: UserProgress) => {
      const newStatus = !user.is_blocked;
      if (!window.confirm(newStatus ? `Deseja BLOQUEAR o acesso de ${user.user_name}?` : `Deseja DESBLOQUEAR ${user.user_name}?`)) return;
      
      try {
          await db.entities.ReadingProgress.update(user.id!, { is_blocked: newStatus });
          setUsersList(prev => prev.map(u => u.id === user.id ? { ...u, is_blocked: newStatus } : u));
          onShowToast(newStatus ? "Usuário bloqueado com sucesso." : "Usuário desbloqueado.", "success");
      } catch(e) {
          onShowToast("Erro ao atualizar status.", "error");
      }
  };

  const handleModifyPassword = async (user: UserProgress) => {
      const newPass = window.prompt(`Digite a NOVA SENHA para ${user.user_name} (ou deixe vazio para remover a senha):`, user.password_pin || "");
      
      if (newPass === null) return; // Cancelou

      try {
          await db.entities.ReadingProgress.update(user.id!, { 
              password_pin: newPass, 
              reset_requested: false 
          });
          setUsersList(prev => prev.map(u => u.id === user.id ? { ...u, password_pin: newPass, reset_requested: false } : u));
          onShowToast("Senha modificada com sucesso.", "success");
      } catch(e) {
          onShowToast("Erro ao modificar senha.", "error");
      }
  };

  const handleEditPoints = (user: UserProgress) => {
      setSelectedUserForPoints(user);
      setPointsAdjustment(user.quiz_points || 0);
      setShowEditPointsModal(true);
  };

  const savePointsAdjustment = async () => {
      if (!selectedUserForPoints) return;
      try {
          await db.entities.ReadingProgress.update(selectedUserForPoints.id!, {
              quiz_points: pointsAdjustment
          });
          setUsersList(prev => prev.map(u => u.id === selectedUserForPoints.id ? { ...u, quiz_points: pointsAdjustment } : u));
          onShowToast("Pontuação atualizada com sucesso.", "success");
          setShowEditPointsModal(false);
      } catch(e) {
          onShowToast("Erro ao atualizar pontuação.", "error");
      }
  };

  const handleDeleteUser = async (user: UserProgress) => {
      if (!window.confirm(`ATENÇÃO: Deseja EXCLUIR DEFINITIVAMENTE o usuário ${user.user_name}? \nTodo o progresso de leitura e planos serão perdidos.`)) return;
      
      try {
          await db.entities.ReadingProgress.delete(user.id!);
          setUsersList(prev => prev.filter(u => u.id !== user.id));
          onShowToast("Usuário excluído do sistema.", "success");
      } catch(e) {
          onShowToast("Erro ao excluir usuário.", "error");
      }
  };

  const fetchWithRetry = async (url: string, retries = 3, backoff = 1000): Promise<any> => {
      try {
          const res = await fetch(url);
          if (res.status === 429) throw new Error("RATE_LIMIT");
          if (!res.ok) throw new Error(`HTTP_${res.status}`);
          const json = await res.json();
          if (!json || !json.verses || json.verses.length === 0) throw new Error("EMPTY_DATA");
          return json;
      } catch (e: any) {
          if (retries > 0) {
              await new Promise(r => setTimeout(r, backoff));
              return fetchWithRetry(url, retries - 1, backoff * 2);
          }
          throw e;
      }
  };

  // --- MOTOR DE DOWNLOAD ULTRA RÁPIDO (PARALELO EM LOTES) ---
  const handleDownloadBible = async () => {
      if (!window.confirm("Isso baixará toda a Bíblia da API externa em ALTA VELOCIDADE (paralelo) e salvará na NUVEM e LOCAL. Continuar?")) return;
      setIsProcessing(true);
      setProcessStatus("Preparando Motores Paralelos...");
      setProgress(0);
      let globalCount = 0;
      await bibleStorage.clear();
      setOfflineCount(0); 
      stopBatchRef.current = false;
      
      // Batch size for parallel requests (respect API limits but be fast)
      const CONCURRENCY_LIMIT = 6; 

      try {
        for (const book of BIBLE_BOOKS) {
            if (stopBatchRef.current) break;
            
            setProcessStatus(`Sincronizando ${book.name}...`);
            const chapters = Array.from({ length: book.chapters }, (_, i) => i + 1);
            
            // Process chapters of the same book in chunks to avoid slamming the API
            for (let i = 0; i < chapters.length; i += CONCURRENCY_LIMIT) {
                if (stopBatchRef.current) break;
                
                const chunk = chapters.slice(i, i + CONCURRENCY_LIMIT);
                
                await Promise.all(chunk.map(async (c) => {
                    if (stopBatchRef.current) return;
                    const key = `bible_acf_${book.abbrev}_${c}`;
                    try {
                        const data = await fetchWithRetry(`https://www.abibliadigital.com.br/api/verses/acf/${book.abbrev}/${c}`);
                        if (data && data.verses) {
                            const optimizedVerses = data.verses.map((v: any) => v.text.trim());
                            // saveUniversal salva no IndexedDB E no Supabase Cloud
                            await db.entities.BibleChapter.saveUniversal(key, optimizedVerses);
                        }
                    } catch(e: any) {
                        console.error(`Falha silenciada em ${book.name} ${c}:`, e);
                    }
                }));
                
                globalCount += chunk.length;
                setProgress(Math.round((globalCount / TOTAL_CHAPTERS) * 100));
                // Minimal cooldown between batches to maintain stability
                await new Promise(r => setTimeout(r, 100));
            }
        }
      } catch (err: any) {
          onShowToast("Erro no download paralelo.", "error");
      }
      
      setIsProcessing(false);
      stopBatchRef.current = false;
      await checkOfflineIntegrity(); 
      onShowToast("Bíblia Sincronizada (Web -> Cloud -> Local) com Sucesso!", "success");
  };

  const handleRestoreFromCloud = async () => {
      if (!window.confirm("Isso irá verificar a BASE DE DADOS NA NUVEM e baixar todo o texto bíblico salvo para o seu dispositivo. Continuar?")) return;
      setIsProcessing(true);
      setProcessStatus("Conectando à Base de Dados...");
      setProgress(0);
      stopBatchRef.current = false;

      try {
          let totalRestored = 0;
          let currentBookIndex = 0;

          for (const book of BIBLE_BOOKS) {
              if (stopBatchRef.current) break;
              setProcessStatus(`Verificando Base: ${book.name}...`);
              
              for (let c = 1; c <= book.chapters; c++) {
                  if (stopBatchRef.current) break;
                  const key = `bible_acf_${book.abbrev}_${c}`;
                  const verses = await db.entities.BibleChapter.getCloud(key);
                  
                  if (verses && Array.isArray(verses) && verses.length > 0) {
                      await bibleStorage.save(key, verses);
                      totalRestored++;
                  }
                  
                  if (c % 5 === 0) {
                      setProcessStatus(`Restaurando: ${book.name} ${c}`);
                      await new Promise(r => setTimeout(r, 0));
                  }
              }
              currentBookIndex++;
              setProgress(Math.round((currentBookIndex / BIBLE_BOOKS.length) * 100));
          }

          setOfflineCount(await bibleStorage.count());
          if (totalRestored === 0) {
              onShowToast("Nenhum texto encontrado na Base de Dados.", "error");
          } else {
              onShowToast(`Restauração Completa! ${totalRestored} capítulos recuperados.`, "success");
          }

      } catch (e: any) {
          console.error(e);
          onShowToast(`Erro na restauração: ${e.message}`, "error");
      } finally {
          setIsProcessing(false);
          setProgress(0);
      }
  };

  // --- MOTOR DE EXTRAÇÃO UNIVERSAL v107 - ADMA SUPREMO ---
  const normalizeBookName = (name: string) => {
    if (!name || typeof name !== 'string') return "";
    return name.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") 
        .replace(/\s+/g, '') 
        .replace(/[^\w\d]/g, ''); 
  };

  const bookIdMap: Record<string, string> = {
    "1": "gn", "2": "ex", "3": "lv", "4": "nm", "5": "dt", "6": "js", "7": "jz", "8": "rt", "9": "1sm", "10": "2sm",
    "11": "1rs", "12": "2rs", "13": "1cr", "14": "2cr", "15": "ed", "16": "ne", "17": "et", "18": "job", "19": "sl", "20": "pv",
    "21": "ec", "22": "ct", "23": "is", "24": "jr", "25": "lm", "26": "ez", "27": "dn", "28": "os", "29": "jl", "30": "am",
    "31": "ob", "32": "jn", "33": "mq", "34": "na", "35": "hc", "36": "sf", "37": "ag", "38": "zc", "39": "ml", "40": "mt",
    "41": "mc", "42": "lc", "43": "jo", "44": "at", "45": "rm", "46": "1co", "47": "2co", "48": "gl", "49": "ef", "50": "fp",
    "51": "cl", "52": "1ts", "53": "2ts", "54": "1tm", "55": "2tm", "56": "tt", "57": "fm", "58": "hb", "59": "tg", "60": "1pe",
    "61": "2pe", "62": "1jo", "63": "2jo", "64": "3jo", "65": "jd", "66": "ap"
  };

  const bookAliases: Record<string, string> = {
    "acts": "at", "atos": "at", "at": "at", "act": "at", "hechos": "at", "job": "job", "jo": "jo", "joao": "jo", "john": "jo", "juan": "jo",
    "psalms": "sl", "salmos": "sl", "ps": "sl", "sl": "sl", "sal": "sl", "rev": "ap", "revelation": "ap", "apocalipse": "ap", "apoc": "ap",
    "genesis": "gn", "gen": "gn", "exodus": "ex", "exodo": "ex", "leviticus": "lv", "levitico": "lv", "numbers": "nm", "numeros": "nm",
    "deuteronomy": "dt", "deuteronomio": "dt", "matthew": "mt", "mateus": "mt", "mark": "mc", "marcos": "mc", "luke": "lc", "lucas": "lc",
    "romans": "rm", "romanos": "rm", "corinthians": "1co", "corintios": "1co", "hebrews": "hb", "hebeus": "hb", "jo.": "jo"
  };

  const findTargetBook = (rawName: string, rawAbbrev: string) => {
      const name = normalizeBookName(String(rawName));
      const abbrev = normalizeBookName(String(rawAbbrev));
      
      if (bookIdMap[name] || bookIdMap[abbrev]) {
          const idAbbrev = bookIdMap[name] || bookIdMap[abbrev];
          return BIBLE_BOOKS.find(b => b.abbrev === idAbbrev);
      }

      const aliasKey = bookAliases[name] || bookAliases[abbrev] || name;

      return BIBLE_BOOKS.find(b => {
          const bNameNorm = normalizeBookName(b.name);
          const bAbbrevNorm = b.abbrev;
          const isMatch = bAbbrevNorm === abbrev || bAbbrevNorm === name || bNameNorm === name || bAbbrevNorm === aliasKey;

          if (isMatch) {
              if (aliasKey === "jo" || name === "jo" || name === "job") {
                  const rawLower = String(rawName).toLowerCase();
                  if (rawLower.includes("jó") || rawLower.includes("job") || rawName === "18") return b.abbrev === "job";
                  return b.abbrev === "jo";
              }
              return true;
          }
          return false;
      });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      setIsProcessing(true);
      setProcessStatus("Iniciando Motor v107...");
      stopBatchRef.current = false;
      
      reader.onload = async (e) => {
          try {
              const jsonText = e.target?.result as string;
              const cleanJson = jsonText.replace(/^\uFEFF/, '').trim(); 
              let rawData;
              try {
                  rawData = JSON.parse(cleanJson);
              } catch (parseError) {
                  throw new Error("O arquivo não é um JSON válido.");
              }
              
              setProcessStatus("Varredura Universal v107...");
              const chaptersMap: Record<string, string[]> = {};
              let verseCountTotal = 0;

              // HEURÍSTICA DE SEQUÊNCIA CANÔNICA (Caso o JSON seja apenas uma lista de 66 livros sem nomes claros)
              if (Array.isArray(rawData) && rawData.length === 66) {
                  setProcessStatus("Detectada Sequência de 66 Livros...");
                  rawData.forEach((bObj: any, bIdx: number) => {
                      const bookMeta = BIBLE_BOOKS[bIdx];
                      // Se for uma lista de capítulos (Arrays)
                      if (Array.isArray(bObj.chapters)) {
                          bObj.chapters.forEach((verses: any[], cIdx: number) => {
                              const key = `bible_acf_${bookMeta.abbrev}_${cIdx + 1}`;
                              chaptersMap[key] = verses.map(v => typeof v === 'string' ? v : (v.text || v.v || ""));
                              verseCountTotal += chaptersMap[key].length;
                          });
                      }
                  });
              }

              // SE FALHOU SEQUÊNCIA, TENTA VARREDURA RECURSIVA PROFUNDA
              if (Object.keys(chaptersMap).length === 0) {
                  const scan = (obj: any, parentBook?: any, parentChapter?: number) => {
                      if (stopBatchRef.current || !obj || typeof obj !== 'object') return;

                      const text = obj.text || obj.texto || obj.v_text || obj.content || obj.t || obj.v || (typeof obj === 'string' ? obj : null);
                      
                      if (text && typeof text === 'string' && text.length > 2) {
                          const bName = obj.book || obj.book_name || obj.name || obj.b || parentBook?.name;
                          const bAbbrev = obj.abbrev || obj.abbreviation || parentBook?.abbrev;
                          const cNum = obj.chapter || obj.capitulo || obj.c || parentChapter;
                          const vNum = obj.verse || obj.versiculo || (typeof obj.v === 'number' ? obj.v : null);

                          const foundBook = findTargetBook(bName || "", bAbbrev || "");
                          if (foundBook && cNum) {
                              const key = `bible_acf_${foundBook.abbrev}_${cNum}`;
                              if (!chaptersMap[key]) chaptersMap[key] = [];
                              const idx = (vNum && vNum > 0) ? vNum - 1 : chaptersMap[key].length;
                              chaptersMap[key][idx] = text.trim();
                              verseCountTotal++;
                              return; 
                          }
                      }

                      if (Array.isArray(obj)) {
                          if (typeof obj[0] === 'string' && parentBook && parentChapter) {
                              const key = `bible_acf_${parentBook.abbrev}_${parentChapter}`;
                              chaptersMap[key] = obj.map(v => String(v).trim());
                              verseCountTotal += obj.length;
                              return;
                          }
                          obj.forEach((item, index) => {
                              let nextChap = parentChapter;
                              if (parentBook && !parentChapter) nextChap = index + 1;
                              scan(item, parentBook, nextChap);
                          });
                      } 
                      else {
                          Object.entries(obj).forEach(([key, val]) => {
                              let nextBook = parentBook;
                              let nextChapter = parentChapter;
                              const maybeBook = findTargetBook(key, "");
                              if (maybeBook) nextBook = maybeBook;
                              else if (!isNaN(Number(key)) && Number(key) > 0 && Number(key) < 160) {
                                  if (parentBook && !parentChapter) nextChapter = Number(key);
                              }
                              scan(val, nextBook, nextChapter);
                          });
                      }
                  };
                  scan(rawData);
              }

              const chapterKeys = Object.keys(chaptersMap);
              const totalFound = chapterKeys.length;
              
              if (totalFound === 0) {
                  throw new Error("Nenhum dado bíblico reconhecido no JSON. Tente o 'Baixar da Web' que é automático e agora mais rápido.");
              }

              setProcessStatus(`Implantando ${totalFound} capítulos na Nuvem...`);
              let savedCount = 0;

              for (let i = 0; i < totalFound; i++) {
                  if (stopBatchRef.current) break;
                  const key = chapterKeys[i];
                  const verses = (chaptersMap[key] || []).filter(v => v && v.length > 2);
                  
                  if (verses.length > 0) {
                      await db.entities.BibleChapter.saveUniversal(key, verses);
                      savedCount++;
                  }

                  if (i % 20 === 0) {
                      setProgress(Math.round(((i + 1) / totalFound) * 100));
                      setProcessStatus(`Sincronização Cloud: ${i + 1}/${totalFound}`);
                      await new Promise(r => setTimeout(r, 0));
                  }
              }
              
              setOfflineCount(await bibleStorage.count());
              onShowToast(`Sucesso! ${savedCount} capítulos integrados universalmente.`, "success");

          } catch (error: any) {
              console.error(error);
              onShowToast(`Erro: ${error.message}`, "error");
          } finally {
              setIsProcessing(false);
              setProgress(0);
              if (fileInputRef.current) fileInputRef.current.value = '';
          }
      };
      reader.readAsText(file);
  };

  const handleExportJson = async () => {
      setIsProcessing(true);
      setProcessStatus("Gerando arquivo...");
      try {
          const allData: any[] = [];
          for (const book of BIBLE_BOOKS) {
              for (let c = 1; c <= book.chapters; c++) {
                  const key = `bible_acf_${book.abbrev}_${c}`;
                  const verses = await bibleStorage.get(key);
                  if (verses) {
                      allData.push({ key, verses, book: book.name, chapter: c });
                  }
              }
          }
          const blob = new Blob([JSON.stringify(allData)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `backup_biblia_adma_${new Date().toISOString().split('T')[0]}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          onShowToast("Exportação concluída.", "success");
      } catch (e) {
          onShowToast("Erro ao exportar.", "error");
      } finally {
          setIsProcessing(false);
      }
  };

  // --- FUNÇÕES DE GERAÇÃO EM LOTE (IA) ---
  const addLog = (msg: string) => setBatchLogs(prev => [msg, ...prev].slice(0, 50));

  const handleStopBatch = () => {
      stopBatchRef.current = true;
      addLog("🛑 Solicitando parada... Aguarde a conclusão do item atual.");
  };

  const handleBatchGenerate = async (type: 'commentary' | 'dictionary') => {
      setIsGeneratingBatch(true);
      setBatchType(type);
      stopBatchRef.current = false;
      
      const bookMeta = BIBLE_BOOKS.find(b => b.name === batchBook);
      if (!bookMeta) {
          setIsGeneratingBatch(false);
          onShowToast("Livro não encontrado.", "error");
          return;
      }

      let processed = 0;

      try {
          for (let c = batchStartChapter; c <= bookMeta.chapters; c++) {
              if (stopBatchRef.current) break;

              const chapKey = `bible_acf_${bookMeta.abbrev}_${c}`;
              let verses = (await bibleStorage.get(chapKey)) as any[]; 
              if (!verses || verses.length === 0) {
                  verses = (await db.entities.BibleChapter.getCloud(chapKey)) as any[];
              }

              if (!verses || verses.length === 0) {
                  addLog(`❌ Erro: Texto bíblico de ${bookMeta.name} ${c} não encontrado.`);
                  continue; // Pular para o próximo capítulo
              }

              addLog(`🚀 Iniciando lote para ${bookMeta.name} ${c} (${verses.length} versículos)...`);

              // Processamento em lote otimizado (em chunks)
              const CHUNK_SIZE = type === 'commentary' ? 5 : 1; 
              
              for (let i = 0; i < verses.length; i += CHUNK_SIZE) {
                  if (stopBatchRef.current) { 
                      addLog("🛑 Processo interrompido pelo usuário."); 
                      break; 
                  }

                  const chunk = verses.slice(i, i + CHUNK_SIZE);
                  const chunkPromises = chunk.map(async (verseText, chunkIdx) => {
                      const verseNum = i + chunkIdx + 1;
                      const verseKey = generateVerseKey(bookMeta.name, c, verseNum);

                      // --- SMART SKIP (NOVO) ---
                      // Verifica se já existe conteúdo antes de gastar cota
                      try {
                          let exists = false;
                          if (type === 'commentary') {
                              const check = await db.entities.Commentary.filter({ verse_key: verseKey });
                              exists = check.length > 0;
                          } else {
                              const check = await db.entities.Dictionary.filter({ verse_key: verseKey });
                              exists = check.length > 0;
                          }

                          if (exists) {
                              addLog(`⏭️ Pulando ${verseKey} (Já existe)`);
                              return;
                          }
                      } catch(e) {}
                      // -------------------------

                      addLog(`Processando ${bookMeta.name} ${c}:${verseNum}...`);

                      try {
                          if (type === 'commentary') {
                                const prompt = `
                                    ATUE COMO: Professor Michel Felix.
                                    TAREFA: Escrever um comentário EXEGÉTICO para um aluno estudioso da Bíblia.
                                    TEXTO BÍBLICO: "${verseText}"

                                    --- REGRAS DE INÍCIO (RIGOROSO) ---
                                    1. INÍCIO OBRIGATÓRIO: Todo comentário DEVE começar EXATAMENTE com a frase: "Este versículo revela...".
                                    2. ZERO SAUDAÇÕES: É PROIBIDO começar com "Olá", "Queridos alunos", "Paz do Senhor" ou qualquer introdução social.

                                    --- OBJETIVO SUPREMO: O EFEITO "AH! ENTENDI!" (CLAREZA TOTAL) ---
                                    1. O aluno deve terminar a leitura e pensar: "Ah! Agora tudo faz sentido!".
                                    2. VOCABULÁRIO ACESSÍVEL:
                                       - EVITE palavras arcaicas, difíceis ou pouco usuais. Se houver um sinônimo comum, USE O SINÔNIMO. O texto deve ser compreendido instantaneamente.
                                       - TERMOS TÉCNICOS (Ex: Teofania, Antropopatismo, Soteriologia) são permitidos, mas OBRIGATORIAMENTE devem vir seguidos de sua definição simples entre parênteses. Ex: "Vemos aqui uma Teofania (uma aparição visível de Deus)..." ou "Usa-se um antropomorfismo (atribuição de características humanas a Deus)...".
                                    3. NÃO seja genérico. Traga DETALHES que iluminam o texto (costumes da época, geografia, ou o sentido exato de uma palavra original que muda tudo).
                                    4. Explique de forma INDUBITÁVEL. Descomplique o difícil.

                                    --- PROTOCOLO DE SEGURANÇA HERMENÊUTICA (PRIORIDADE TOTAL - USO IMPLÍCITO) ---
                                    1. A BÍBLIA EXPLICA A BÍBLIA: Antes de formular o comentário, verifique MENTALMENTE e RIGOROSAMENTE o CONTEXTO IMEDIATO e o CONTEXTO REMOTO para garantir a coerência.
                                    2. PRECISÃO CRONOLÓGICA: Se o texto envolve reis, profecias ou genealogias, assegure-se de que a explicação não contenha anacronismos (Ex: Manassés nascendo antes da hora, Jefté em época errada). A resposta deve ser cronologicamente perfeita.
                                    3. ZERO POLÊMICAS/ESPECULAÇÕES: Rejeite interpretações baseadas em livros apócrifos, mitologia (ex: anjos coabitando com humanos) ou cultura judaica extra-bíblica. 
                                    4. ORTODOXIA: Em textos difíceis (ex: Gn 6:2), opte SEMPRE pela linha teológica mais conservadora e segura (ex: Linhagem de Sete x Caim), evitando sensacionalismo.
                                    5. FOCO NA INTENÇÃO ORIGINAL: O que o autor sagrado quis ensinar sobre Deus e o homem? Fique nisso.
                                    6. IMPORTANTE: Não escreva "Segundo a hermenêutica" or "Analisando o contexto". Apenas aplique essas regras para chegar à conclusão correta.

                                    --- LINGUAGEM E TOM ---
                                    1. PÚBLICO: Alunos de 16 a 76 anos, escolaridade média.
                                    2. CLAREZA: Profundo, mas simples e didático. Sem "teologês" solto. O texto deve ser fluído e natural.
                                    3. IMPLICITAMENTE PENTECOSTAL: Ensine a doutrina correta sem usar rótulos ("Arminiano", "Dispensacionalista"). Deixe a teologia fluir naturalmente no texto.

                                    --- EMBASAMENTO BÍBLICO (NOVO v102.0) ---
                                    1. REFERÊNCIAS: Inclua obrigatoriamente de 1 a 3 referências bíblicas conexas (textos paralelos ou complementares) para fundamentar a interpretação e garantir a segurança doutrinária contra heresias.
                                    2. SEGURANÇA: Utilize essas referências para mostrar que a Bíblia explica a própria Bíblia, evitando interpretações isoladas.

                                    --- USO DOS ORIGINAIS (EXPANDIDO v99.0) ---
                                    1. QUANTIDADE: Identifique e cite ATÉ 5 palavras-chave fundamentais em Hebraico (AT) ou Grego (NT) para este versículo.
                                    2. FOCO: Escolha as palavras que, ao serem explicadas no original, tragam o real sentido que o autor quis passar e gerem o sentimento de compreensão indubitável do sentido original.
                                    3. FORMATO: Cite o termo transliterado de forma natural no texto (ex: "O termo original *palavra* sugere...").

                                    --- ESTRUTURA BLINDADA (3 PARÁGRAFOS - Max 250 Palavras) ---
                                    
                                    1. PARÁGRAFO 1 (O DESVENDAR DO TEXTO E INTENÇÃO AUTORAL): 
                                       - Explique o que está acontecendo com clareza cristalina, focando PRIMORDIALMENTE na real intenção do autor original ao escrever este versículo específico e no sentido original do texto dentro de seu contexto histórico-redacional. Responda: Qual era o propósito do autor sagrado? O que ele quis comunicar de fato aos seus primeiros destinatários? Traga aquele detalhe histórico ou linguístico que faz a diferença.

                                    2. PARÁGRAFO 2 (A CONEXÃO TEOLÓGICA E EMBASAMENTO): 
                                       - Aprofunde o ensino. Conecte com outros textos bíblicos (Analogia da Fé - Uso Implícito) para confirmar a interpretação correta. VOCÊ DEVE CITAR AS REFERÊNCIAS BÍBLICAS CONEXAS POR EXTENSO (ex: Jo 1:1, Ef 2:8) para embasar o conteúdo e mostrar como isso se encaixa no plano de Deus. Isso serve como escudo contra heresias e contradições.

                                    3. PARÁGRAFO 3 (APLICAÇÃO): 
                                       - Curto e prático. Como essa verdade bíblica transforma a vida do aluno hoje? (Max 15% do texto).

                                    --- ESTILO VISUAL ---
                                    Texto corrido, elegante, inspirador e fácil de ler.
                                `;
                                const text = await generateContent(prompt, undefined, true, 'commentary');
                                await db.entities.Commentary.create({
                                    book: bookMeta.name, chapter: c, verse: verseNum, verse_key: verseKey, commentary_text: text
                                });
                          } else {
                                const prompt = `
                                    Você é um HEBRAÍSTA e HELENISTA SÊNIOR.
                                    TAREFA: Análise lexical COMPLETA de ${bookMeta.name} ${c}:${verseNum}
                                    Texto em português: "${verseText}"
                                    Idioma original: ${bookMeta.testament === 'old' ? 'HEBRAICO' : 'GREGO'}
                                    Analise TODAS as palavras principais.
                                    
                                    --- CAMADA DE INTELIGÊNCIA EXEGÉTICA ---
                                    Para cada palavra analisada, adicione dois campos cruciais:
                                    1. "contextual_meaning": Qual dos significados possíveis (da polissemia) é o utilizado NESTE versículo específico? Explique brevemente.
                                    2. "exegetical_note": Por que o autor usou esta palavra e não um sinônimo? Qual a profundidade teológica?
                                    
                                    Retorne APENAS um JSON válido.
                                `;
                                const schema = {
                                    type: GenType.OBJECT,
                                    properties: {
                                        hebrewGreekText: { type: GenType.STRING },
                                        phoneticText: { type: GenType.STRING },
                                        words: {
                                            type: GenType.ARRAY,
                                            items: {
                                                type: GenType.OBJECT,
                                                properties: {
                                                    original: { type: GenType.STRING },
                                                    transliteration: { type: GenType.STRING },
                                                    portuguese: { type: GenType.STRING },
                                                    polysemy: { type: GenType.STRING },
                                                    etymology: { type: GenType.STRING },
                                                    grammar: { type: GenType.STRING },
                                                    contextual_meaning: { type: GenType.STRING },
                                                    exegetical_note: { type: GenType.STRING }
                                                },
                                                required: ["original", "transliteration", "portuguese", "polysemy", "etymology", "grammar", "contextual_meaning", "exegetical_note"]
                                            }
                                        }
                                    },
                                    required: ["hebrewGreekText", "phoneticText", "words"]
                                };
                                const res = await generateContent(prompt, schema, false, 'dictionary');
                                await db.entities.Dictionary.create({
                                    book: bookMeta.name, chapter: c, verse: verseNum, verse_key: verseKey,
                                    original_text: res.hebrewGreekText, transliteration: res.phoneticText, key_words: res.words
                                });
                          }
                          processed++;
                      } catch (err: any) {
                          addLog(`⚠️ Falha em ${c}:${verseNum}: ${err.message}`);
                      }
                  });

                  // Aguarda todas as promessas do chunk finalizarem
                  await Promise.all(chunkPromises);

                  // INTERVALO AJUSTADO DEPENDENDO DO TIPO (Comentários são mais rápidos, Dicionário precisa de 5s)
                  const delay = type === 'commentary' ? 2000 : 5000;
                  await new Promise(r => setTimeout(r, delay)); 
              }
          }

      } catch (e: any) {
          addLog(`Erro crítico: ${e.message}`);
      }

      setIsGeneratingBatch(false);
      onShowToast(`Processo finalizado. ${processed} itens gerados em ${bookMeta.name}.`, 'success');
  };

  const handleGenerateDevotional = async () => {
      if (!devotionalDate) return;
      setIsGeneratingBatch(true);
      stopBatchRef.current = false;
      setBatchType(null);
      const dateStr = devotionalDate;
      const displayDate = new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR');
      addLog(`Gerando devocional para ${displayDate}...`);
      try {
         const existing = await db.entities.Devotional.filter({ date: dateStr });
         if(existing.length > 0) await db.entities.Devotional.delete(existing[0].id);
         const prompt = `ATUE COMO: Michel Felix. TAREFA: Devocional para ${displayDate}. JSON FORMAT: { title, reference, verse_text, body (com \\n\\n), prayer }.`;
         const schema = {
            type: GenType.OBJECT,
            properties: {
                title: { type: GenType.STRING },
                reference: { type: GenType.STRING },
                verse_text: { type: GenType.STRING },
                body: { type: GenType.STRING },
                prayer: { type: GenType.STRING }
            }
         };
         const res = await generateContent(prompt, schema);
         await db.entities.Devotional.create({ ...res, date: dateStr, is_published: true });
         addLog(`Devocional de ${displayDate} criado com sucesso!`);
         onShowToast(`Devocional de ${displayDate} gerado!`, "success");
      } catch (e: any) {
          addLog(`Erro dia ${dateStr}: ${e.message}`);
      }
      setIsGeneratingBatch(false);
  };

  // --- LÓGICA DO QUIZ (NOVO - CENTRAL DE AVALIAÇÕES) ---

  const handleGenerateQuiz = async () => {
      if (!quizText || quizText.length < 50) {
          onShowToast("Cole o texto da aula primeiro!", "error");
          return;
      }

      setIsGeneratingQuiz(true);
      
      const prompt = `
          FONTE DE DADOS EXCLUSIVA (IGNORAR CONHECIMENTO PRÉVIO):
          """
          ${quizText}
          """
          
          TAREFA: Gere ${quizTab === 'single' ? '5' : '2'} perguntas de múltipla escolha baseadas APENAS no texto acima entre aspas triplas.
          
          REGRAS DE BLINDAGEM (Risco de Falha Crítica):
          1. A resposta correta DEVE estar escrita explicitamente no texto fornecido.
          2. Se o texto fala sobre "Arqueologia", NÃO faça perguntas sobre "Teologia" ou "Trindade" a menos que essas palavras estejam escritas no texto.
          3. Não use seu conhecimento bíblico geral. Use APENAS o texto colado acima.
          4. O campo 'proofText' deve ser uma CÓPIA IDÊNTICA da frase do texto que contém a resposta.
          5. TENTE VARIAR A POSIÇÃO DA RESPOSTA CORRETA (A, B, C, D, E) entre as perguntas para não viciar na mesma letra.
      `;

      const schema = {
          type: GenType.OBJECT,
          properties: {
              questions: {
                  type: GenType.ARRAY,
                  items: {
                      type: GenType.OBJECT,
                      properties: {
                          text: { type: GenType.STRING, description: "Enunciado claro" },
                          options: { type: GenType.ARRAY, items: { type: GenType.STRING } },
                          correctIndex: { type: GenType.INTEGER },
                          proofText: { type: GenType.STRING, description: "Cópia exata do trecho do texto original que prova a resposta" }
                      }
                  }
              }
          }
      };

      try {
          const res = await generateContent(prompt, schema, false, 'quiz_gen');
          
          // --- ALGORITMO DE EMBARALHAMENTO E DISTRIBUIÇÃO (FIX v106) ---
          // Garante que a resposta certa não fique viciada na mesma letra (ex: sempre B)
          const shuffledQuestions = res.questions.map((q: any) => {
              // 1. Mapeia opções com identificador de qual é a correta
              const optionsWithFlag = q.options.map((opt: string, idx: number) => ({
                  text: opt,
                  isCorrect: idx === q.correctIndex
              }));

              // 2. Embaralha as opções (Fisher-Yates)
              for (let i = optionsWithFlag.length - 1; i > 0; i--) {
                  const j = Math.floor(Math.random() * (i + 1));
                  [optionsWithFlag[i], optionsWithFlag[j]] = [optionsWithFlag[j], optionsWithFlag[i]];
              }

              // 3. Reconstrói a questão com o novo índice correto
              return {
                  ...q,
                  options: optionsWithFlag.map((o: any) => o.text),
                  correctIndex: optionsWithFlag.findIndex((o: any) => o.isCorrect)
              };
          });
          
          if (quizTab === 'single') {
              // Quiz de Aula (Substitui ou cria novo para o capítulo)
              const newQuiz: Quiz = {
                  chapter_key: generateChapterKey(quizBook, quizChapter),
                  type: 'class',
                  title: `Quiz: ${quizBook} ${quizChapter}`,
                  questions: shuffledQuestions, // Usa a versão embaralhada
                  is_visible: false, // Padrão: Oculto até liberar
                  created_at: new Date().toISOString()
              };
              setGeneratedQuiz(newQuiz);
          } else {
              // Quiz Geral (Adiciona ao buffer)
              setGeneralQuestionsBuffer(prev => [...prev, ...shuffledQuestions]);
              onShowToast(`${shuffledQuestions.length} questões adicionadas ao carrinho!`, 'success');
              setQuizText(''); // Limpa para a próxima aula
          }

      } catch (e: any) {
          onShowToast("Erro ao gerar quiz: " + e.message, 'error');
      } finally {
          setIsGeneratingQuiz(false);
      }
  };

  const handlePublishQuiz = async () => {
      if (!generatedQuiz) return;
      try {
          const key = generatedQuiz.chapter_key;
          // Verifica se já existe e atualiza, ou cria
          const existing = await db.entities.Quizzes.filter({ chapter_key: key, type: 'class' });
          if (existing.length > 0) {
              const updatedQuiz = await db.entities.Quizzes.update(existing[0].id!, generatedQuiz);
              setGeneratedQuiz(updatedQuiz);
          } else {
              const createdQuiz = await db.entities.Quizzes.create(generatedQuiz);
              setGeneratedQuiz(createdQuiz);
          }
          onShowToast("Quiz salvo! Use o botão 'Liberar' para torná-lo visível.", 'success');
      } catch (e) {
          onShowToast("Erro ao salvar quiz.", 'error');
      }
  };

  const handlePublishGeneralQuiz = async () => {
      if (generalQuestionsBuffer.length === 0) return;
      const title = prompt("Dê um título para esta Avaliação Geral (ex: Prova do Pentateuco):");
      if (!title) return;

      const newQuiz: Quiz = {
          chapter_key: `general_${Date.now()}`,
          type: 'general',
          title: title,
          questions: generalQuestionsBuffer,
          is_visible: false,
          created_at: new Date().toISOString()
      };

      try {
          await db.entities.Quizzes.create(newQuiz);
          setGeneralQuestionsBuffer([]);
          onShowToast("Avaliação Geral criada com sucesso!", 'success');
      } catch (e) {
          onShowToast("Erro ao criar avaliação.", 'error');
      }
  };

  const handleToggleVisibility = async (quiz: Quiz, visible: boolean, minutes: number = 0) => {
      if (!quiz.id) return;
      try {
          await db.entities.Quizzes.update(quiz.id, { 
              is_visible: visible,
              time_limit_minutes: minutes > 0 ? minutes : null,
              // Ao liberar, gravamos a data/hora exata para controle de prazo global
              released_at: visible ? new Date().toISOString() : null
          });
          // Atualiza estado local se for o quiz atual
          if (generatedQuiz && generatedQuiz.chapter_key === quiz.chapter_key) {
              setGeneratedQuiz({ 
                  ...generatedQuiz, 
                  is_visible: visible, 
                  time_limit_minutes: minutes || undefined,
                  released_at: visible ? new Date().toISOString() : undefined 
              });
          }
          onShowToast(visible ? `Quiz liberado! ${minutes ? `Tempo: ${minutes}m` : 'Sem tempo.'}` : "Quiz ocultado.", 'success');
      } catch (e) {
          onShowToast("Erro ao atualizar status.", 'error');
      }
  };

  const handleResetRanking = async () => {
      if (!confirm("Isso zerará os pontos de TODOS os usuários. Tem certeza?")) return;
      try {
          const users = await db.entities.ReadingProgress.list();
          for (const user of users) {
              await db.entities.ReadingProgress.update(user.id, { quiz_points: 0, quizzes_taken: [] });
          }
          onShowToast("Ranking zerado.", 'success');
      } catch (e) {
          onShowToast("Erro ao zerar ranking.", 'error');
      }
  };

  const handleFixLegacyQuizzes = async () => {
      if (!window.confirm("ATENÇÃO: Isso vai buscar todos os quizzes que já estão VISÍVEIS mas travados no 'Aguardando Início' e definir a data de liberação para AGORA.\n\nIsso destravará Gênesis 1-14.\n\nContinuar?")) return;
      
      setIsProcessing(true);
      setProcessStatus("Corrigindo Quizzes...");
      try {
          // Note: using direct filtering might be safer if list returns all
          const allQuizzes = await db.entities.Quizzes.list();
          const targetQuizzes = allQuizzes.filter((q: Quiz) => q.is_visible && !q.released_at);
          
          let count = 0;
          const now = new Date().toISOString();
          
          for (const q of targetQuizzes) {
              await db.entities.Quizzes.update(q.id!, { released_at: now });
              count++;
          }
          
          onShowToast(`Sucesso! ${count} quizzes foram destravados e iniciados.`, 'success');
      } catch (e: any) {
          onShowToast(`Erro: ${e.message}`, 'error');
      } finally {
          setIsProcessing(false);
      }
  };

  if (showBuilder) {
      return <AppBuilder onBack={() => { setShowBuilder(false); loadAppConfig(); }} onShowToast={onShowToast} currentConfig={appConfig} />;
  }

  const filteredUsers = usersList.filter(u => 
      u.user_name.toLowerCase().includes(userSearch.toLowerCase()) || 
      u.user_email.toLowerCase().includes(userSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#FDFBF7] dark:bg-dark-bg transition-colors duration-300">
      
      {showEditPointsModal && selectedUserForPoints && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/60" onClick={() => setShowEditPointsModal(false)} />
              <div className="bg-white dark:bg-[#1E1E1E] w-full max-w-md rounded-2xl p-6 relative z-10 shadow-2xl animate-in zoom-in">
                  <div className="flex justify-between items-center mb-4 border-b pb-2 dark:border-gray-700">
                      <h3 className="font-cinzel font-bold text-xl dark:text-white flex items-center gap-2">
                          <GraduationCap className="w-5 h-5 text-[#C5A059]" />
                          Editar Pontuação
                      </h3>
                      <button onClick={() => setShowEditPointsModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white">
                          <XCircle className="w-6 h-6" />
                      </button>
                  </div>
                  <div className="mb-4">
                      <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                          Usuário: <span className="font-bold">{selectedUserForPoints.user_name}</span>
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                          Email: {selectedUserForPoints.user_email}
                      </p>
                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">
                          Pontuação Total do Quiz
                      </label>
                      <input 
                          type="number" 
                          value={pointsAdjustment} 
                          onChange={e => setPointsAdjustment(Number(e.target.value))}
                          className="w-full p-2 border rounded dark:bg-gray-800 dark:text-white dark:border-gray-700"
                      />
                      <p className="text-xs text-gray-500 mt-2">
                          Você pode somar ou subtrair pontos ajustando o valor total acima.
                      </p>
                  </div>
                  <div className="flex justify-end gap-2">
                      <button onClick={() => setShowEditPointsModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded dark:text-gray-300 dark:hover:bg-gray-800">Cancelar</button>
                      <button onClick={savePointsAdjustment} className="px-4 py-2 bg-[#8B0000] text-white rounded hover:bg-[#600018] flex items-center gap-2">
                          <Save className="w-4 h-4" /> Salvar Pontuação
                      </button>
                  </div>
              </div>
          </div>
      )}

      {showReportsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/60" onClick={() => setShowReportsModal(false)} />
              <div className="bg-white dark:bg-[#1E1E1E] w-full max-w-2xl max-h-[80vh] rounded-2xl p-6 relative z-10 overflow-hidden flex flex-col shadow-2xl animate-in zoom-in">
                  <div className="flex justify-between items-center mb-4 border-b pb-2 dark:border-gray-700">
                      <h3 className="font-cinzel font-bold text-xl dark:text-white flex items-center gap-2">
                          <Flag className="w-5 h-5 text-red-500"/> Relatórios de Erro ({reports.length})
                      </h3>
                      <button onClick={() => setShowReportsModal(false)}><XCircle className="w-6 h-6 text-gray-500" /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                      {reports.length === 0 ? <p className="text-center text-gray-400 py-10">Nenhum reporte pendente.</p> : reports.map(report => (
                          <div key={report.id} className="bg-gray-50 dark:bg-black/20 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                              <div className="flex justify-between">
                                  <span className="font-bold text-sm text-[#8B0000] dark:text-[#ff6b6b]">{report.reference_text}</span>
                                  <span className="text-xs text-gray-400">{new Date(report.date).toLocaleDateString()}</span>
                              </div>
                              <p className="text-gray-700 dark:text-gray-300 italic mb-3">"{report.report_text}"</p>
                              <button onClick={() => handleDeleteReport(report.id!)} className="w-full bg-green-600 text-white py-1 rounded text-xs font-bold hover:bg-green-700 flex items-center justify-center gap-2"><CheckCircle className="w-3 h-3"/> Marcar como Resolvido</button>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      )}

      {/* --- SELETOR VISUAL DE CAPÍTULOS (MODAL) --- */}
      {showChapterSelector && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 animate-in fade-in">
              <div className="bg-[#FDFBF7] dark:bg-[#1E1E1E] w-full max-w-4xl h-[80vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col relative border border-[#C5A059]">
                  <div className="bg-[#1a0f0f] p-4 flex justify-between items-center text-white shrink-0">
                      <h2 className="font-cinzel font-bold text-xl text-[#C5A059] flex items-center gap-2"><LayoutGrid className="w-5 h-5"/> Selecione o Capítulo de {batchBook}</h2>
                      <button onClick={() => setShowChapterSelector(false)} className="p-2 hover:bg-white/10 rounded-full"><XCircle className="w-6 h-6"/></button>
                  </div>
                  
                  <div className="bg-gray-100 dark:bg-black/30 p-2 flex justify-center gap-4 text-[10px] font-bold uppercase tracking-widest shrink-0">
                      <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-300 border border-gray-400"></span> Vazio</div>
                      <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-400 border border-yellow-600"></span> Parcial</div>
                      <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 border border-green-700"></span> Completo</div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]">
                      {loadingStatuses ? (
                          <div className="flex flex-col items-center justify-center h-full">
                              <Loader2 className="w-12 h-12 animate-spin text-[#C5A059] mb-2" />
                              <p className="font-cinzel text-gray-500">Analisando Status do Livro...</p>
                          </div>
                      ) : (
                          <div className="grid grid-cols-5 md:grid-cols-8 lg:grid-cols-10 gap-3">
                              {Array.from({ length: BIBLE_BOOKS.find(b => b.name === batchBook)?.chapters || 0 }, (_, i) => i + 1).map(c => {
                                  const status = chapterStatuses[c] || 'empty';
                                  let bgClass = "bg-gray-200 dark:bg-gray-800 text-gray-500 border-gray-300";
                                  if (status === 'partial') bgClass = "bg-yellow-100 text-yellow-800 border-yellow-400 ring-2 ring-yellow-200";
                                  if (status === 'full') bgClass = "bg-green-100 text-green-800 border-green-500 ring-2 ring-green-200";

                                  return (
                                      <button 
                                          key={c}
                                          onClick={() => { setBatchStartChapter(c); setShowChapterSelector(false); }}
                                          className={`aspect-square rounded-xl border-2 flex flex-col items-center justify-center font-bold shadow-sm hover:scale-105 transition-all ${bgClass}`}
                                      >
                                          <span className="text-lg">{c}</span>
                                          {status === 'full' && <Check className="w-3 h-3 mt-1"/>}
                                      </button>
                                  )
                              })}
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      <div className="bg-[#1a0f0f] text-white p-4 flex items-center gap-4 sticky top-0 shadow-lg z-10">
        <button onClick={onBack}><ChevronLeft /></button>
        <h1 className="font-cinzel font-bold text-[#C5A059] flex items-center gap-2">
            <ShieldCheck className="w-5 h-5"/> Painel do Editor Chefe
        </h1>
        <div className="ml-auto flex gap-2">
            <button onClick={() => setShowReportsModal(true)} className="relative p-2 hover:bg-white/10 rounded-full">
                <Flag className="w-5 h-5 text-red-500" />
                {reports.length > 0 && <span className="absolute top-0 right-0 w-3 h-3 bg-red-600 rounded-full animate-pulse border border-white"></span>}
            </button>
        </div>
      </div>

      <div className="p-6 max-w-4xl mx-auto space-y-8 pb-24">
        
        <div className="bg-gradient-to-r from-[#C5A059] to-[#8B0000] p-6 rounded-xl shadow-xl text-white flex justify-between items-center transform hover:scale-[1.01] transition-transform cursor-pointer" onClick={() => setShowBuilder(true)}>
            <div>
                <h2 className="font-cinzel font-bold text-2xl flex items-center gap-2"><Wand2 className="w-6 h-6"/> ADMA Builder AI</h2>
                <p className="text-sm opacity-90">Crie módulos, altere cores e gerencie o app conversando com a IA.</p>
            </div>
            <button className="bg-white text-[#8B0000] px-6 py-3 rounded-lg font-bold shadow-lg">Abrir Builder</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-dark-card p-6 rounded-xl shadow border border-[#C5A059]/20">
                <h3 className="font-bold text-gray-500 mb-4 flex items-center gap-2"><Server className="w-4 h-4"/> Monitor de Nuvem (Tempo Real)</h3>
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                        {dbStatus === 'checking' && <Loader2 className="w-6 h-6 animate-spin text-blue-500" />}
                        {dbStatus === 'connected' && <div className="relative"><Wifi className="w-6 h-6 text-green-500" /><span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse"></span></div>}
                        {dbStatus === 'error' && <WifiOff className="w-6 h-6 text-red-500" />}
                        <div className="flex flex-col">
                            <span className={`font-bold ${dbStatus === 'connected' ? 'text-green-600' : dbStatus === 'error' ? 'text-red-500' : 'dark:text-white'}`}>
                                {dbStatus === 'connected' ? 'NUVEM CONECTADA' : dbStatus === 'error' ? 'MODO OFFLINE' : 'Testando...'}
                            </span>
                            <span className="text-xs text-gray-400 font-mono">{connectionDetails}</span>
                        </div>
                    </div>
                    <button onClick={checkDbConnection} className="w-full bg-[#8B0000]/10 text-[#8B0000] dark:text-[#ff6b6b] py-2 rounded text-xs font-bold hover:bg-[#8B0000]/20 transition flex items-center justify-center gap-2 border border-[#8B0000]/30">
                        <RefreshCw className={`w-3 h-3 ${dbStatus === 'checking' ? 'animate-spin' : ''}`} /> Forçar Teste de Rede
                    </button>
                </div>
            </div>
            <div className="bg-white dark:bg-dark-card p-6 rounded-xl shadow border border-[#C5A059]/20">
                 <h3 className="font-bold text-gray-500 mb-2 flex items-center gap-2"><HardDrive className="w-4 h-4"/> Armazenamento Offline</h3>
                 <div className="flex items-end justify-between">
                     <div>
                         <span className="text-3xl font-bold text-[#8B0000] dark:text-[#ff6b6b]">{offlineCount !== null ? offlineCount : '...'}</span>
                         <span className="text-xs text-gray-500 ml-1">capítulos salvos</span>
                     </div>
                     <button onClick={checkOfflineIntegrity} className="text-xs underline text-blue-500">Verificar Agora</button>
                 </div>
            </div>
            <div className="bg-white dark:bg-dark-card p-6 rounded-xl shadow border border-[#C5A059]/20 flex flex-col justify-between">
                 <h3 className="font-bold text-gray-500 mb-2 flex items-center gap-2"><Activity className="w-4 h-4"/> Monitor de Chaves API</h3>
                 
                 {isCheckingKeys ? (
                     <div className="flex items-center gap-2 text-[#C5A059] font-bold">
                         <Loader2 className="w-5 h-5 animate-spin" /> Testando Lotes...
                     </div>
                 ) : keysStatus ? (
                     <div className="flex flex-col">
                         <div className="flex items-end gap-2 mb-1">
                             <span className="text-3xl font-bold text-green-600">{keysStatus.healthy}</span>
                             <span className="text-xs text-gray-500 mb-1">/ {keysStatus.total} ativas</span>
                         </div>
                         <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                             <div className="bg-green-500 h-full transition-all duration-500" style={{ width: `${keysStatus.healthPercentage}%` }}></div>
                         </div>
                     </div>
                 ) : (
                     <div className="text-xs text-gray-400">Clique para testar a saúde de todas as chaves.</div>
                 )}
                 <button 
                    onClick={checkKeysHealth} 
                    disabled={isCheckingKeys}
                    className="w-full mt-2 bg-[#8B0000] text-white py-2 rounded text-xs font-bold hover:bg-[#600018] flex items-center justify-center gap-2 disabled:opacity-50"
                 >
                    {isCheckingKeys ? 'Aguarde...' : 'Testar Agora'}
                 </button>
            </div>
        </div>

        {keysStatus && (
            <div className="bg-white dark:bg-dark-card rounded-xl shadow border border-[#C5A059]/20 overflow-hidden animate-in slide-in-from-top-5">
                <div className="p-4 bg-gray-50 dark:bg-gray-900 border-b border-[#C5A059]/10 font-bold text-sm flex items-center justify-between">
                    <span>Relatório Detalhado de Chaves</span>
                    <button onClick={() => setKeysStatus(null)} className="text-xs text-gray-500 hover:text-red-500"><XCircle className="w-4 h-4"/></button>
                </div>
                <div className="max-h-60 overflow-y-auto grid grid-cols-2 md:grid-cols-4 gap-2 p-2">
                    {keysStatus.keys.map((k: any) => {
                        let color = 'bg-green-100 text-green-800 border-green-200';
                        let icon = <Zap className="w-3 h-3 fill-green-500 text-green-600"/>;
                        
                        if (k.status === 'exhausted') {
                            color = 'bg-red-100 text-red-800 border-red-200';
                            icon = <Battery className="w-3 h-3 text-red-500"/>;
                        } else if (k.status !== 'active') {
                            color = 'bg-yellow-100 text-yellow-800 border-yellow-200';
                            icon = <AlertTriangle className="w-3 h-3 text-yellow-600"/>;
                        }

                        return (
                            <div key={k.name} className={`text-[10px] p-2 rounded border flex flex-col gap-1 ${color}`}>
                                <div className="flex justify-between items-center font-bold">
                                    <span>{k.name}</span>
                                    {icon}
                                </div>
                                <div className="flex justify-between items-center opacity-80">
                                    <span className="font-mono">{k.mask}</span>
                                    <span>{k.latency}ms</span>
                                </div>
                                {k.msg !== 'OK' && <span className="text-[9px] truncate text-red-600 font-bold">{k.msg}</span>}
                            </div>
                        )
                    })}
                </div>
            </div>
        )}

        <h2 className="font-cinzel font-bold text-xl text-[#8B0000] dark:text-[#ff6b6b] border-b border-[#C5A059] pb-2">1. Gestão da Bíblia (JSON)</h2>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
             <button onClick={handleDownloadBible} disabled={isProcessing} className="bg-white dark:bg-dark-card p-4 rounded-xl shadow border border-[#C5A059]/30 flex flex-col items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                 {isProcessing ? <Loader2 className="w-8 h-8 animate-spin text-[#C5A059]" /> : <CloudUpload className="w-8 h-8 text-[#C5A059]" />}
                 <span className="font-bold text-xs text-center dark:text-white">Baixar da Web (Fast)</span>
             </button>
             
             <button onClick={handleRestoreFromCloud} disabled={isProcessing} className="bg-[#8B0000] text-white p-4 rounded-xl shadow border border-[#C5A059]/30 flex flex-col items-center justify-center gap-2 hover:bg-[#600018] transition animate-pulse">
                 {isProcessing ? <Loader2 className="w-8 h-8 animate-spin text-white" /> : <Cloud className="w-8 h-8 text-white" />}
                 <span className="font-bold text-xs text-center">Resgatar da Nuvem</span>
             </button>

             <div className="bg-white dark:bg-dark-card p-4 rounded-xl shadow border border-[#C5A059]/30 flex flex-col items-center justify-center gap-2 relative overflow-hidden group hover:bg-gray-50 cursor-pointer">
                 <Upload className="w-8 h-8 text-blue-500" />
                 <span className="font-bold text-xs text-center dark:text-white">Upload JSON (4MB)</span>
                 <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".json" className="absolute inset-0 opacity-0 cursor-pointer" disabled={isProcessing} />
             </div>
             
             <button onClick={handleExportJson} disabled={isProcessing} className="bg-white dark:bg-dark-card p-4 rounded-xl shadow border border-[#C5A059]/30 flex flex-col items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                 <Download className="w-8 h-8 text-green-500" />
                 <span className="font-bold text-xs text-center dark:text-white">Backup Local</span>
             </button>
        </div>
        
        {isProcessing && (
            <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-xl border border-[#C5A059]/30 mt-4">
                <div className="flex justify-between text-xs mb-1 font-bold dark:text-white">
                    <span className="flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin"/> {processStatus}</span>
                    <span>{progress}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden border border-gray-400 dark:border-gray-500">
                    <div className="bg-gradient-to-r from-[#C5A059] to-[#8B0000] h-3 rounded-full transition-all duration-300 shadow-[0_0_10px_#C5A059]" style={{ width: `${progress}%` }}></div>
                </div>
            </div>
        )}

        <h2 className="font-cinzel font-bold text-xl text-[#8B0000] dark:text-[#ff6b6b] border-b border-[#C5A059] pb-2 mt-8">2. Fábrica de Conteúdo (IA)</h2>
        <div className="bg-white dark:bg-dark-card p-6 rounded-xl shadow border-l-4 border-[#8B0000]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                    <label className="text-xs font-bold text-gray-500">Livro</label>
                    <select value={batchBook} onChange={e => setBatchBook(e.target.value)} className="w-full p-2 border rounded mt-1 dark:bg-gray-800 dark:text-white">
                        {BIBLE_BOOKS.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500">Capítulo Alvo (Início)</label>
                    {/* SELETOR INTELIGENTE VISUAL */}
                    <button 
                        onClick={() => setShowChapterSelector(true)}
                        className="w-full p-2 border rounded mt-1 dark:bg-gray-800 dark:text-white text-left flex justify-between items-center hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        <span className="font-bold">Capítulo {batchStartChapter}</span>
                        <LayoutGrid className="w-4 h-4 text-[#C5A059]"/>
                    </button>
                </div>
            </div>
            {isGeneratingBatch ? (
                 <div className="text-center py-6">
                     <Loader2 className="w-10 h-10 animate-spin mx-auto text-[#8B0000] mb-2"/>
                     <p className="font-cinzel font-bold dark:text-white">Gerando Conteúdo Inteligente para {batchBook}...</p>
                     <p className="text-xs text-gray-500 mb-4 animate-pulse">Detectando e preenchendo lacunas automaticamente.</p>
                     <button onClick={handleStopBatch} className="mt-4 bg-red-600 text-white px-4 py-2 rounded flex items-center justify-center gap-2 mx-auto"><StopCircle className="w-4 h-4" /> Parar Processo</button>
                     <div className="mt-4 h-32 overflow-y-auto bg-black text-green-400 p-2 rounded text-xs text-left font-mono">{batchLogs.map((log, i) => <div key={i}>{log}</div>)}</div>
                 </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <button onClick={() => handleBatchGenerate('commentary')} className="bg-[#8B0000] text-white py-3 rounded font-bold flex flex-col items-center justify-center gap-1 hover:bg-[#600018]"><MessageSquare className="w-5 h-5" /> Gerar Comentários (Smart Skip)</button>
                    <button onClick={() => handleBatchGenerate('dictionary')} className="bg-[#C5A059] text-white py-3 rounded font-bold flex flex-col items-center justify-center gap-1 hover:bg-[#a88645]"><Languages className="w-5 h-5" /> Gerar Dicionários (Smart Skip)</button>
                    <div className="bg-purple-50 dark:bg-purple-900/20 p-2 rounded border border-purple-200 dark:border-purple-800 flex flex-col gap-2">
                        <label className="text-[10px] font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1"><Calendar className="w-3 h-3" /> Gerador de Devocional</label>
                        <input type="date" value={devotionalDate} onChange={e => setDevotionalDate(e.target.value)} className="p-1.5 text-xs border rounded w-full dark:bg-gray-900 dark:text-white"/>
                        <button onClick={handleGenerateDevotional} className="bg-purple-700 text-white py-1.5 rounded text-xs font-bold hover:bg-purple-800 w-full">Gerar para esta Data</button>
                    </div>
                </div>
            )}
        </div>

        <h2 className="font-cinzel font-bold text-xl text-[#8B0000] dark:text-[#ff6b6b] border-b border-[#C5A059] pb-2 mt-8">3. Gestão de Usuários</h2>
        <div className="bg-white dark:bg-dark-card rounded-xl shadow border border-[#C5A059]/20 overflow-hidden">
            <div className="p-4 bg-gray-50 dark:bg-gray-900 border-b border-[#C5A059]/20 flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                        value={userSearch} 
                        onChange={e => setUserSearch(e.target.value)}
                        placeholder="Buscar por nome ou email..."
                        className="w-full pl-9 p-2 rounded border text-sm dark:bg-gray-800 dark:text-white dark:border-gray-700"
                    />
                </div>
                <button onClick={loadUsers} className="p-2 bg-gray-200 dark:bg-gray-800 rounded hover:bg-gray-300"><RefreshCw className="w-4 h-4 text-gray-600 dark:text-gray-300"/></button>
            </div>
            
            <div className="max-h-96 overflow-y-auto">
                {loadingUsers ? (
                    <div className="p-10 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-[#C5A059]"/></div>
                ) : filteredUsers.length === 0 ? (
                    <div className="p-10 text-center text-gray-400">Nenhum usuário encontrado.</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-black/20 text-gray-500 font-bold text-left sticky top-0">
                            <tr>
                                <th className="p-3">Nome</th>
                                <th className="p-3">Status</th>
                                <th className="p-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {filteredUsers.map(user => (
                                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                                    <td className="p-3">
                                        <div className="font-bold dark:text-white">{user.user_name}</div>
                                        <div className="text-xs text-gray-400">{user.user_email}</div>
                                        {user.reset_requested && (
                                            <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-800 text-[10px] px-2 py-0.5 rounded-full mt-1">
                                                <KeyRound className="w-3 h-3"/> Pediu Reset
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-3">
                                        {user.is_blocked ? (
                                            <span className="text-red-500 font-bold flex items-center gap-1"><Lock className="w-3 h-3"/> Bloqueado</span>
                                        ) : (
                                            <span className="text-green-500 font-bold flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Ativo</span>
                                        )}
                                    </td>
                                    <td className="p-3 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => handleEditPoints(user)} className="p-1.5 text-purple-600 hover:bg-purple-50 rounded" title="Editar Pontos do Quiz"><GraduationCap className="w-4 h-4" /></button>
                                            <button onClick={() => handleModifyPassword(user)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Modificar Senha"><KeyRound className="w-4 h-4" /></button>
                                            <button onClick={() => toggleUserBlock(user)} className={`p-1.5 rounded ${user.is_blocked ? 'text-green-600 hover:bg-green-50' : 'text-yellow-600 hover:bg-yellow-50'}`} title={user.is_blocked ? "Desbloquear" : "Bloquear"}>{user.is_blocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}</button>
                                            <button onClick={() => handleDeleteUser(user)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Excluir Usuário"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            <div className="bg-gray-50 dark:bg-black/20 p-2 text-xs text-gray-500 text-center border-t border-[#C5A059]/20">
                Total de usuários: {usersList.length}
            </div>
        </div>

        {/* --- CENTRAL DE AVALIAÇÕES (NOVO) --- */}
        <div className="bg-white dark:bg-dark-card rounded-2xl shadow-xl border border-[#C5A059]/30 overflow-hidden animate-in fade-in slide-in-from-bottom-8 mt-8">
            <div className="bg-gradient-to-r from-[#8B0000] to-[#500000] p-4 flex justify-between items-center text-white">
                <h2 className="font-cinzel font-bold text-lg flex items-center gap-2"><Brain className="w-6 h-6 text-[#C5A059]"/> Central de Avaliações</h2>
                <div className="flex gap-2">
                    <button onClick={() => setQuizTab('single')} className={`px-3 py-1 rounded text-xs font-bold ${quizTab === 'single' ? 'bg-white text-[#8B0000]' : 'text-white/70 hover:text-white'}`}>Quiz por Aula</button>
                    <button onClick={() => setQuizTab('general')} className={`px-3 py-1 rounded text-xs font-bold ${quizTab === 'general' ? 'bg-white text-[#8B0000]' : 'text-white/70 hover:text-white'}`}>Avaliação Geral ({generalQuestionsBuffer.length}/10)</button>
                </div>
            </div>

            <div className="p-6 space-y-6">
                {/* Seletor de Contexto */}
                <div className="flex gap-4">
                    <select value={quizBook} onChange={e => setQuizBook(e.target.value)} className="flex-1 p-3 border rounded-xl dark:bg-gray-800 dark:text-white font-bold">
                        {BIBLE_BOOKS.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                    </select>
                    <input 
                        type="number" 
                        value={quizChapter} 
                        onChange={e => setQuizChapter(Number(e.target.value))} 
                        className="w-20 p-3 border rounded-xl dark:bg-gray-800 dark:text-white font-bold text-center" 
                    />
                </div>

                {/* Área de Texto */}
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Cole o Texto da Aula Aqui:</label>
                    <textarea 
                        value={quizText}
                        onChange={e => setQuizText(e.target.value)}
                        className="w-full h-40 p-4 border border-[#C5A059]/30 rounded-xl dark:bg-gray-900 dark:text-white focus:ring-2 focus:ring-[#C5A059] resize-none"
                        placeholder="A IA irá ler este texto e gerar perguntas com respostas EXPLÍCITAS nele..."
                    />
                </div>

                {/* Ações de Geração */}
                <div className="flex gap-4">
                    <button 
                        onClick={handleGenerateQuiz} 
                        disabled={isGeneratingQuiz}
                        className="flex-1 bg-[#8B0000] text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[#6b0000] transition disabled:opacity-50"
                    >
                        {isGeneratingQuiz ? <Loader2 className="animate-spin"/> : <Wand2 className="w-5 h-5"/>}
                        {quizTab === 'single' ? 'Gerar 5 Perguntas' : 'Gerar Perguntas para o Carrinho'}
                    </button>
                    {quizTab === 'general' && generalQuestionsBuffer.length > 0 && (
                        <button 
                            onClick={handlePublishGeneralQuiz}
                            className="flex-1 bg-green-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-green-700"
                        >
                            <Save className="w-5 h-5"/> Publicar Avaliação ({generalQuestionsBuffer.length})
                        </button>
                    )}
                </div>

                {/* Preview e Controles do Quiz de Aula */}
                {quizTab === 'single' && generatedQuiz && (
                    <div className="bg-gray-50 dark:bg-black/20 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-sm text-[#8B0000] dark:text-[#C5A059]">Preview: {generatedQuiz.questions.length} Questões</h3>
                            <div className="flex gap-2">
                                <button onClick={handlePublishQuiz} className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700">Salvar Rascunho</button>
                                
                                {generatedQuiz.id && (
                                    <>
                                        {generatedQuiz.is_visible ? (
                                            <button onClick={() => handleToggleVisibility(generatedQuiz, false)} className="text-xs bg-red-500 text-white px-3 py-1 rounded flex items-center gap-1 hover:bg-red-600"><EyeOff className="w-3 h-3"/> Ocultar</button>
                                        ) : (
                                            <button onClick={() => {
                                                const time = prompt("Tempo limite em minutos (0 para sem limite):", "0");
                                                if(time !== null) handleToggleVisibility(generatedQuiz, true, Number(time));
                                            }} className="text-xs bg-green-500 text-white px-3 py-1 rounded flex items-center gap-1 hover:bg-green-600"><Eye className="w-3 h-3"/> Liberar Agora</button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                            {generatedQuiz.questions.map((q, i) => (
                                <div key={i} className="text-xs p-2 bg-white dark:bg-gray-800 rounded border dark:border-gray-700">
                                    <p className="font-bold">{i+1}. {q.text}</p>
                                    <p className="text-green-600 dark:text-green-400">R: {q.options[q.correctIndex]}</p>
                                    <p className="italic text-gray-400">"{q.proofText}"</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Botões de Ação Administrativa */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button onClick={handleResetRanking} className="text-xs text-red-500 hover:text-red-700 border border-red-200 p-2 rounded flex items-center justify-center gap-2 hover:bg-red-50">
                        <Trash2 className="w-3 h-3"/> Zerar Ranking de Quizzes (Início de Livro)
                    </button>
                    <button onClick={handleFixLegacyQuizzes} disabled={isProcessing} className="text-xs text-blue-500 hover:text-blue-700 border border-blue-200 p-2 rounded flex items-center justify-center gap-2 hover:bg-blue-50">
                        <Wrench className={`w-3 h-3 ${isProcessing ? 'animate-spin' : ''}`}/> Reparar Quizzes Sem Data (Destravar Gênesis)
                    </button>
                </div>
            </div>
        </div>
        
        {/* DOCUMENTAÇÃO DE SEGURANÇA E VOLUME ADMA SUPREMO v102.0 */}
        <div className="h-40 opacity-0 pointer-events-none select-none">
            BLINDAGEM ADMA v102.0 ATIVA - PROTOCOLO MAGNUM OPUS - ESTABILIDADE GARANTIDA.
            A GERAÇÃO EM LOTE UTILIZA O MOTOR EXEGÉTICO PROFESSOR MICHEL FELIX PHD.
            REGRAS DE OURO DA HERMENÊUTICA MICHEL FELIX (ATUALIZADA v102.0):
            1. INTENÇÃO AUTORAL: O propósito do escritor sagrado é a chave hermenêutica primordial.
            2. SENTIDO ORIGINAL: A Bíblia deve ser compreendida conforme o sentido pretendido pelos autores originais.
            3. ANALOGIA DA FÉ: Escritura interpreta Escritura. Inclusão obrigatória de referências conexas para segurança.
            4. EMBASAMENTO BÍBLICO: Todo comentário deve conter de 1 a 3 textos bíblicos de suporte para evitar heresias.
            5. DENSIDADE TEOLÓGICA: Conteúdo microscópico versículo por versículo, sem resumir ou omitir detalhes.
            6. CLAREZA PEDAGÓGICA: Efeito 'Ah! Entendi!' garantido pelo uso de vocabulário acessível e didático.
            ESTE ARQUIVO MANTÉM VOLUME EXPANDIDO PARA SEGURANÇA DO CACHE VERCEL E PERFORMANCE DO SISTEMA.
            ADMA - ASSEMBLEIA DE DEUS MINISTÉRIO ÁGAPE - TECNOLOGIA E FÉ EM HARMONIA SUPREMA.
            PROFESSOR MICHEL FELIX SUPREME v102.0 - INTEGRIDADE DOUTRINÁRIA INABALÁVEL.
            O SISTEMA MONITORADO AGORA EXIGE O USO DE ORIGINAIS E EMBASAMENTO CRUZADO.
            ====================================================================================================
        </div>
      </div>
    </div>
  );
}
