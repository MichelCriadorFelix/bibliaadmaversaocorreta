import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Video, VideoOff, Mic, MicOff, SwitchCamera, Maximize2, Minimize2, 
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Clock, BookOpen, 
  MessageSquare, Users, Sparkles, ShieldCheck, Layers, Settings, 
  Volume2, Move, X, Send, Pointer, Eye, RefreshCw, Radio, CheckCircle, 
  Flame, GraduationCap, FolderOpen, BookmarkCheck, Loader2, Plus, BookMarked,
  Trash2
} from 'lucide-react';
import { db } from '../../services/database';
import { BIBLE_BOOKS, generateChapterKey } from '../../constants';
import { UserProgress, BibleBook, ThematicTheme, ThematicLesson } from '../../types';
import { EbdContentRenderer } from '../panorama/EbdContentRenderer';
import { BibleReference } from '../panorama/BibleReference';
import { PrimarySource } from '../panorama/PrimarySource';
import { GlossaryTerm } from '../panorama/GlossaryTerm';
import { usePanoramaView } from '../../hooks/usePanoramaView';

// ==========================================
// REGEX E HELPERS DE REFERÊNCIA BÍBLICA
// ==========================================
const getBookVariations = (b: BibleBook): string[] => {
  const vars = new Set<string>();
  vars.add(b.name);
  vars.add(b.abbrev);
  
  const addVar = (val: string) => {
    vars.add(val);
    vars.add(val.toLowerCase());
    vars.add(val.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  };

  addVar(b.name);
  addVar(b.abbrev);
  
  if (b.name === "Gênesis") { addVar("Gn"); addVar("Gen"); }
  if (b.name === "Êxodo") { addVar("Ex"); addVar("Exo"); }
  if (b.name === "Levítico") { addVar("Lv"); addVar("Lev"); }
  if (b.name === "Números") { addVar("Nm"); addVar("Num"); }
  if (b.name === "Deuteronômio") { addVar("Dt"); addVar("Deut"); }
  if (b.name === "Josué") { addVar("Js"); addVar("Jos"); }
  if (b.name === "Juízes") { addVar("Jz"); addVar("Jui"); }
  if (b.name === "Rute") addVar("Rt");
  if (b.name === "Esdras") addVar("Ed");
  if (b.name === "Neemias") addVar("Ne");
  if (b.name === "Ester") addVar("Et");
  if (b.name === "Jó") addVar("Jó");
  if (b.name === "Salmos") { addVar("Sl"); addVar("Sal"); addVar("Salmo"); }
  if (b.name === "Provérbios") { addVar("Pv"); addVar("Prov"); }
  if (b.name === "Eclesiastes") { addVar("Ec"); addVar("Ecl"); }
  if (b.name === "Cantares") { addVar("Ct"); addVar("Cant"); addVar("Cânticos"); }
  if (b.name === "Isaías") { addVar("Is"); addVar("Isa"); }
  if (b.name === "Jeremias") { addVar("Jr"); addVar("Jer"); }
  if (b.name === "Lamentações") { addVar("Lm"); addVar("Lam"); }
  if (b.name === "Ezequiel") { addVar("Ez"); addVar("Eze"); }
  if (b.name === "Daniel") { addVar("Dn"); addVar("Dan"); }
  if (b.name === "Oseias") { addVar("Os"); addVar("Ose"); }
  if (b.name === "Joel") addVar("Jl");
  if (b.name === "Amós") addVar("Am");
  if (b.name === "Obadias") addVar("Ob");
  if (b.name === "Jonas") addVar("Jn");
  if (b.name === "Miqueias") { addVar("Mq"); addVar("Miq"); }
  if (b.name === "Naum") addVar("Na");
  if (b.name === "Habacuque") { addVar("Hc"); addVar("Hab"); }
  if (b.name === "Sofonias") { addVar("Sf"); addVar("Sof"); }
  if (b.name === "Ageu") addVar("Ag");
  if (b.name === "Zacarias") { addVar("Zc"); addVar("Zac"); }
  if (b.name === "Malaquias") { addVar("Ml"); addVar("Mal"); }

  if (b.name === "Mateus") { addVar("Mt"); addVar("Mat"); }
  if (b.name === "Marcos") { addVar("Mc"); addVar("Mar"); }
  if (b.name === "Lucas") { addVar("Lc"); addVar("Luc"); }
  if (b.name === "João") { addVar("Jo"); addVar("Joa"); }
  if (b.name === "Atos") { addVar("At"); addVar("Atos"); }
  if (b.name === "Romanos") { addVar("Rm"); addVar("Rom"); }
  if (b.name === "Gálatas") { addVar("Gl"); addVar("Gal"); }
  if (b.name === "Efésios") { addVar("Ef"); addVar("Efe"); }
  if (b.name === "Filipenses") { addVar("Fp"); addVar("Fil"); }
  if (b.name === "Colossenses") { addVar("Cl"); addVar("Col"); }
  if (b.name === "Tito") addVar("Tt");
  if (b.name === "Filemom") { addVar("Fm"); addVar("Flm"); }
  if (b.name === "Hebreus") { addVar("Hb"); addVar("Heb"); }
  if (b.name === "Tiago") { addVar("Tg"); addVar("Tia"); }
  if (b.name === "Judas") { addVar("Jd"); addVar("Jud"); }
  if (b.name === "Apocalipse") { addVar("Ap"); addVar("Apoc"); }
  
  const match = b.name.match(/^(\d)\s+(.*)/);
  if (match) {
    const num = match[1];
    const name = match[2];
    const roman = num === '1' ? 'I' : num === '2' ? 'II' : 'III';
    
    addVar(`${num}${name}`);
    addVar(`${num} ${name}`);
    addVar(`${roman} ${name}`);
    addVar(`${roman}${name}`);
    
    const abbrevName = b.abbrev.replace(/^\d/, '');
    addVar(`${num} ${abbrevName}`);
    addVar(`${num}${abbrevName}`);
    addVar(`${roman} ${abbrevName}`);
    addVar(`${roman}${abbrevName}`);
  }
  return Array.from(vars);
};

const bookNamesPattern = BIBLE_BOOKS.flatMap(getBookVariations)
  .sort((a, b) => b.length - a.length)
  .map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');

const bibleRegex = new RegExp(`(^|[\\s\\(\\["',;]+)(${bookNamesPattern}\\.?)\\s+(\\d+)(?::\\s*(\\d+(?:\\s*-\\s*\\d+(?::\\d+)?)?(?:(?:[,;]|\\s+e)\\s*(?!(?:${bookNamesPattern})\\b)(?:\\d+:\\s*)?\\d+(?:\\s*-\\s*\\d+(?::\\d+)?)?)*))?`, 'gi');

interface ClassroomMessageItem {
  id?: string;
  study_key: string;
  sender_name: string;
  sender_email?: string;
  role: 'professor' | 'aluno';
  message: string;
  created_at: string;
}

interface LiveClassroomViewProps {
  onBack: () => void;
  isAdmin: boolean;
  user: any;
  userProgress: UserProgress | null;
  onShowToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  initialBook?: string;
  initialChapter?: number;
}

export default function LiveClassroomView({
  onBack,
  isAdmin,
  user,
  userProgress,
  onShowToast,
  initialBook = 'Levítico',
  initialChapter = 22,
}: LiveClassroomViewProps) {
  // Verificação de acesso restrito ao Admin (Beta fechado)
  const isAuthorized = isAdmin || userProgress?.role === 'admin';

  // Modal e tipo de estudo: 'bible' (EBD Panorama) ou 'theology' (Curso de Teologia & Temáticos)
  const [selectorTab, setSelectorTab] = useState<'bible' | 'theology'>('bible');
  const [selectedBook, setSelectedBook] = useState(initialBook);
  const [selectedChapter, setSelectedChapter] = useState(initialChapter);
  const [showBookSelector, setShowBookSelector] = useState(false);
  const [bookSearch, setBookSearch] = useState('');
  const [theologySearch, setTheologySearch] = useState('');

  // Estados de expansão e controle das matérias de Teologia
  const [expandedThemeId, setExpandedThemeId] = useState<string | null>(null);
  const [loadingLessonsThemeId, setLoadingLessonsThemeId] = useState<string | null>(null);
  const [lessonsByTheme, setLessonsByTheme] = useState<Record<string, ThematicLesson[]>>({});
  const [isCreatingLessonThemeId, setIsCreatingLessonThemeId] = useState<string | null>(null);
  const [newLessonTitleInput, setNewLessonTitleInput] = useState('');
  const [isCreatingTheme, setIsCreatingTheme] = useState(false);
  const [newThemeTitleInput, setNewThemeTitleInput] = useState('');

  // Detecção de tela mobile
  const [isMobileScreen, setIsMobileScreen] = useState(() => 
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Integração com usePanoramaView para carregar o acervo tanto de EBD quanto de Teologia
  const {
    activeTab, setActiveTab,
    currentPage, setCurrentPage,
    pages,
    fontSize, setFontSize,
    content,
    thematicThemes,
    themeLessons,
    loadThemes,
    loadLessonsAndFolders,
    activeTheme, setActiveTheme,
    activeLesson, setActiveLesson,
  } = usePanoramaView({
    initialBook: selectedBook,
    initialChapter: selectedChapter,
    userProgress,
    onProgressUpdate: () => {},
    onShowToast,
    isAdmin: true
  });

  // Carregar temas de Teologia ao abrir a sala
  useEffect(() => {
    loadThemes();
  }, [loadThemes]);

  // Chave identificadora única do conteúdo atual (para o chat real)
  const isTheologyMode = activeTab === 'thematic';
  const studyKey = isTheologyMode && activeLesson 
    ? `thematic_${activeLesson.id}` 
    : generateChapterKey(selectedBook, selectedChapter);

  // Estados da Câmera do Professor (Picture-in-Picture)
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoPaused, setIsVideoPaused] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [pipSize, setPipSize] = useState<'compact' | 'normal' | 'large'>('normal');
  const [isPipMinimized, setIsPipMinimized] = useState(false);

  // Posição flutuante inicial inteligente (não cobre o texto central)
  const [pipPosition, setPipPosition] = useState<{ x: number; y: number }>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return { x: window.innerWidth - 155, y: window.innerHeight - 240 };
    }
    return { x: 30, y: 110 };
  });

  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number }>({
    startX: 0,
    startY: 0,
    initX: 30,
    initY: 110
  });

  // Cronômetro da Aula
  const [classSeconds, setClassSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(true);

  // Modo Apontador / Destaque do Mestre
  const [pointerActive, setPointerActive] = useState(false);
  const [focusedBlockId, setFocusedBlockId] = useState<number | null>(null);

  // ==========================================
  // CHAT 100% REAL PERSISTIDO NO BANCO
  // ==========================================
  const [showSidePanel, setShowSidePanel] = useState(false);
  const [activeSideTab, setActiveSideTab] = useState<'chat' | 'attendance'>('chat');
  const [chatMessage, setChatMessage] = useState('');
  const [chatMessages, setChatMessages] = useState<ClassroomMessageItem[]>([]);

  // Carregar mensagens reais do banco de dados
  const loadClassroomMessages = useCallback(async () => {
    try {
      const messages = await db.entities.ClassroomMessages.filter({ study_key: studyKey });
      const sorted = (messages || []).sort((a: any, b: any) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      setChatMessages(sorted);
    } catch (e) {
      console.warn("Erro ao buscar mensagens da sala de aula:", e);
    }
  }, [studyKey]);

  // Carregar ao mudar de aula e fazer polling suave a cada 3 segundos
  useEffect(() => {
    loadClassroomMessages();
    const interval = setInterval(loadClassroomMessages, 3500);
    return () => clearInterval(interval);
  }, [loadClassroomMessages]);

  // Efeito do Cronômetro
  useEffect(() => {
    let timer: any;
    if (isTimerRunning) {
      timer = setInterval(() => {
        setClassSeconds(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isTimerRunning]);

  const formatTimer = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Inicialização e gerenciamento da Câmera do Professor
  const initCamera = useCallback(async (mode: 'user' | 'environment') => {
    try {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
      setCameraError(null);

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: true
      });

      setStream(mediaStream);
      setCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(e => console.warn("AutoPlay de vídeo bloqueado pelo navegador", e));
      }
    } catch (err: any) {
      console.warn("Não foi possível acessar a câmera ou microfone:", err);
      setCameraError("Câmera ou microfone não detectados. Você ainda pode ministrar o estudo normalmente!");
      setCameraActive(false);
    }
  }, [stream]);

  // Iniciar câmera na abertura da sala
  useEffect(() => {
    if (isAuthorized) {
      initCamera(facingMode);
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    };
  }, [isAuthorized]);

  // Atualiza elemento de vídeo quando stream mudar
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, isPipMinimized]);

  // Alternar Microfone
  const toggleMic = () => {
    if (!stream) return;
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMicMuted(!audioTrack.enabled);
      onShowToast(audioTrack.enabled ? "Microfone ativado" : "Microfone silenciado", "info");
    }
  };

  // Alternar Vídeo
  const toggleVideo = () => {
    if (!stream) return;
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoPaused(!videoTrack.enabled);
      onShowToast(videoTrack.enabled ? "Câmera ativada" : "Câmera pausada", "info");
    }
  };

  // Inverter Câmera (Frontal / Traseira)
  const flipCamera = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    initCamera(nextMode);
  };

  // Largura calculada do PiP
  const getPipWidth = () => {
    if (isMobileScreen) {
      return pipSize === 'large' ? 190 : pipSize === 'normal' ? 144 : 120;
    }
    return pipSize === 'large' ? 320 : pipSize === 'normal' ? 230 : 160;
  };

  // Lógica de Arrasto da Miniatura (Mouse & Touch)
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: pipPosition.x,
      initY: pipPosition.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStartRef.current.startX;
    const deltaY = e.clientY - dragStartRef.current.startY;
    
    const curWidth = getPipWidth();
    const maxX = window.innerWidth - curWidth - 8;
    const maxY = window.innerHeight - 120;

    const newX = Math.max(8, Math.min(maxX, dragStartRef.current.initX + deltaX));
    const newY = Math.max(60, Math.min(maxY, dragStartRef.current.initY + deltaY));

    setPipPosition({ x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  // Encaixe rápido nos cantos
  const snapToCorner = (corner: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left') => {
    const curWidth = getPipWidth();
    if (corner === 'bottom-right') {
      setPipPosition({ x: window.innerWidth - curWidth - 12, y: window.innerHeight - 220 });
    } else if (corner === 'bottom-left') {
      setPipPosition({ x: 12, y: window.innerHeight - 220 });
    } else if (corner === 'top-right') {
      setPipPosition({ x: window.innerWidth - curWidth - 12, y: 110 });
    } else if (corner === 'top-left') {
      setPipPosition({ x: 12, y: 110 });
    }
  };

  // Envio de mensagem REAL no chat
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;

    const senderName = isAuthorized 
      ? 'Prof. Michel Felix' 
      : (user?.displayName || userProgress?.user_email?.split('@')[0] || 'Aluno ADMA');

    const newMsg: Omit<ClassroomMessageItem, 'id'> = {
      study_key: studyKey,
      sender_name: senderName,
      sender_email: userProgress?.user_email || 'admin@adma.com',
      role: isAuthorized ? 'professor' : 'aluno',
      message: chatMessage.trim(),
      created_at: new Date().toISOString()
    };

    try {
      const saved = await db.entities.ClassroomMessages.create(newMsg as any);
      setChatMessages(prev => [...prev, saved]);
      setChatMessage('');
    } catch (err: any) {
      console.error("Erro ao enviar mensagem:", err);
      onShowToast("Erro ao enviar mensagem", "error");
    }
  };

  // Limpar mensagens da aula (Apenas Admin)
  const handleClearChat = async () => {
    if (!window.confirm("Deseja apagar todas as mensagens desta aula?")) return;
    try {
      for (const m of chatMessages) {
        if (m.id) await db.entities.ClassroomMessages.delete(m.id);
      }
      setChatMessages([]);
      onShowToast("Chat da aula limpo com sucesso!", "success");
    } catch (e) {
      onShowToast("Erro ao limpar chat", "error");
    }
  };

  // Abertura / Fechamento de Matéria de Teologia
  const handleToggleTheme = async (theme: ThematicTheme) => {
    if (expandedThemeId === theme.id) {
      setExpandedThemeId(null);
      return;
    }

    setExpandedThemeId(theme.id || null);
    setActiveTheme(theme);
    
    if (theme.id) {
      setLoadingLessonsThemeId(theme.id);
      try {
        const res = await db.entities.ThematicLessons.filter({ theme_id: theme.id });
        const sorted = (res || []).sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
        setLessonsByTheme(prev => ({ ...prev, [theme.id!]: sorted }));
        await loadLessonsAndFolders(theme.id);
      } catch (e) {
        console.error("Erro ao carregar lições do tema", e);
        onShowToast("Erro ao carregar aulas da matéria", "error");
      } finally {
        setLoadingLessonsThemeId(null);
      }
    }
  };

  // Criar aula rápida na matéria
  const handleCreateQuickLesson = async (themeId: string) => {
    if (!newLessonTitleInput.trim()) return;
    try {
      const currentLessons = lessonsByTheme[themeId] || [];
      const newLesson: Omit<ThematicLesson, 'id'> = {
        theme_id: themeId,
        title: newLessonTitleInput.trim(),
        order_index: currentLessons.length,
        content: `# ${newLessonTitleInput.trim()}\n\n## 1. INTRODUÇÃO EXEGÉTICA E DOUTRINÁRIA\n\nBem-vindos à aula da matéria ministrada pelo Professor Michel Felix.\n\n### Desenvolvimento\nEste conteúdo está pronto para ser ministrado na Sala de Aula Ao Vivo.`,
        is_published: true
      };
      const created = await db.entities.ThematicLessons.create(newLesson as any);
      const updatedList = [...currentLessons, created];
      setLessonsByTheme(prev => ({ ...prev, [themeId]: updatedList }));
      setNewLessonTitleInput('');
      setIsCreatingLessonThemeId(null);
      onShowToast("Nova aula criada com sucesso!", "success");
    } catch (e: any) {
      onShowToast("Erro ao criar aula: " + e.message, "error");
    }
  };

  // Criar nova matéria de teologia
  const handleCreateQuickTheme = async () => {
    if (!newThemeTitleInput.trim()) return;
    try {
      const newTheme = {
        title: newThemeTitleInput.trim(),
        description: 'Módulo do Curso de Formação Teológica',
        created_at: new Date().toISOString(),
        is_starred: false
      };
      const created = await db.entities.ThematicThemes.create(newTheme);
      await loadThemes();
      setNewThemeTitleInput('');
      setIsCreatingTheme(false);
      onShowToast("Nova matéria criada!", "success");
      handleToggleTheme(created);
    } catch (e: any) {
      onShowToast("Erro ao criar matéria: " + e.message, "error");
    }
  };

  // Selecionar uma lição do Curso de Teologia para ministrar
  const handleSelectTheologyLesson = (theme: ThematicTheme, lesson: ThematicLesson) => {
    setActiveTheme(theme);
    setActiveLesson(lesson);
    setActiveTab('thematic');
    setShowBookSelector(false);
    onShowToast(`Aula carregada: ${lesson.title}`, 'success');
  };

  // ==========================================
  // PARSERS COMPLETOS: PÉROLAS DE OURO, VERSÍCULOS E FONTES
  // ==========================================
  const parseVerseOnly = useCallback((textSegment: string, prefixKey: string): React.ReactNode[] => {
    const vRegex = /(?:(\()?\b(vv?\.|vers[íi]culos?)\s*(\d+(?:\s*(?:-|a|,)\s*\d+)*)(\))?)/gi;
    
    const nodes: React.ReactNode[] = [];
    let lastIdx = 0;
    let match;

    const currentBookName = selectedBook || 'Levítico';
    const currentChapterNum = selectedChapter || 22;

    while ((match = vRegex.exec(textSegment)) !== null) {
      if (match.index > lastIdx) {
        nodes.push(textSegment.substring(lastIdx, match.index));
      }

      const fullMatch = match[0];
      const rawVerses = match[3] || '';
      const normalizedVerses = rawVerses.replace(/\s*a\s*/g, '-').replace(/\s+/g, '');

      nodes.push(
        <BibleReference
          key={`${prefixKey}-vo-${match.index}`}
          book={currentBookName}
          chapter={currentChapterNum}
          verses={normalizedVerses}
          isAdmin={isAdmin || userProgress?.role === 'admin'}
        >
          {fullMatch}
        </BibleReference>
      );

      lastIdx = match.index + fullMatch.length;
    }

    if (lastIdx < textSegment.length) {
      nodes.push(textSegment.substring(lastIdx));
    }

    return nodes.length > 0 ? nodes : [textSegment];
  }, [selectedBook, selectedChapter, isAdmin, userProgress]);

  const parseBibleReferences = useCallback((text: string, keyPrefix: string) => {
    const parts = text.split(bibleRegex);
    if (parts.length === 1) return parseVerseOnly(text, keyPrefix);

    const result: React.ReactNode[] = [];
    for (let i = 0; i < parts.length; i += 5) {
      if (parts[i]) result.push(...parseVerseOnly(parts[i], `${keyPrefix}-seg-${i}`));
      if (i + 4 < parts.length) {
        const prefix = parts[i + 1];
        const bookRaw = parts[i + 2];
        const chapterOrVerse = parseInt(parts[i + 3], 10);
        let verses = parts[i + 4];
        
        const cleanRaw = (bookRaw || '').toLowerCase().replace(/[\s\.]/g, "");
        const normalizedRaw = cleanRaw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        
        const bookData = BIBLE_BOOKS.find(b => {
          const variations = getBookVariations(b);
          return variations.some(v => {
            const cleanV = (v || '').toLowerCase().replace(/[\s\.]/g, "");
            const normV = cleanV.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return cleanV === cleanRaw || normV === normalizedRaw;
          });
        });
        
        const resolvedBook = bookData ? bookData.name : bookRaw.replace(/\.$/, '');
        const isSingleChapter = ["Judas", "Filemom", "2 João", "3 João", "Obadias"].includes(resolvedBook);

        let currentChapter = chapterOrVerse;
        
        if (!verses) {
          if (isSingleChapter) {
            verses = chapterOrVerse.toString();
            currentChapter = 1;
          } else {
            result.push(`${prefix}${bookRaw} ${chapterOrVerse}`);
            continue;
          }
        }

        result.push(prefix);
        const hadExplicitVerses = !!parts[i + 4];
        const items = verses.split(/([,;]|\s+e\s+)\s*/).map(x => x.trim()).filter(Boolean);
        let activeChapter = currentChapter;

        for (let idx = 0; idx < items.length; idx++) {
          const item = items[idx];
          if (item === ',' || item === ';') {
            result.push(`${item} `);
            continue;
          }
          if (item === 'e') {
            result.push(' e ');
            continue;
          }

          let c = activeChapter;
          let ve = item;
          if (item.includes(':') && (!item.includes('-') || item.indexOf(':') < item.indexOf('-'))) {
            const [chap, versePart] = item.split(':');
            c = parseInt(chap.trim(), 10) || activeChapter;
            ve = (versePart || '').trim();
            activeChapter = c;
          } else {
            ve = item.trim();
          }

          let label = item;
          if (idx === 0) {
            if (hadExplicitVerses) {
              label = item.includes(':') ? `${bookRaw} ${item}` : `${bookRaw} ${currentChapter}:${item}`;
            } else {
              label = `${bookRaw} ${item}`;
            }
          }

          result.push(
            <BibleReference key={`${keyPrefix}-${i}-${idx}`} book={resolvedBook} chapter={c} verses={ve} isAdmin={isAdmin || userProgress?.role === 'admin'}>
              {label}
            </BibleReference>
          );
        }
      }
    }
    return result;
  }, [parseVerseOnly, isAdmin, userProgress]);

  const parseHistoricalSources = useCallback((text: string, keyPrefix: string): React.ReactNode[] => {
    const sourceRegex = /(Talmud|Mishn[áa]|Midrash(?:\s+[A-Z\u00C0-\u00FF][a-z\u00C0-\u00FF]+)?|(?:Gênesis|Êxodo|Levítico|Números|Deuteronômio|Bereshit|Shemot|Vayikra|Bamidbar|Devarim)\s+Rab[áa]|Targum(?:\s+[A-Z\u00C0-\u00FF][a-z\u00C0-\u00FF]+)?|Guemer[áa]|Gemara|Fl[áa]vio\s+Josefo|Josefo|Philo\s+de\s+Alexandria|Philo|Fil[oó]n\s+de\s+Alexandria|Eus[eé]bio\s+de\s+Cesareia|Eusebio|Pais\s+da\s+Igreja|Manuscritos\s+do\s+Mar\s+Morto|Septuaginta|Vulgata)(?:\s*([\(\[][^\]\)]+[\)\]]|,\s*[^,.\n]+(?:,\s*[^,.\n]+)*|\s+\d+:\d+))?/gi;
    
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = sourceRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(...parseBibleReferences(text.substring(lastIndex, match.index), `${keyPrefix}-pre-${match.index}`));
      }

      const fullMatch = match[0];
      const sourceName = match[1];
      const reference = match[2] ? match[2].trim() : '';

      parts.push(
        <PrimarySource key={`${keyPrefix}-ps-${match.index}`} source={sourceName} reference={reference} isAdmin={isAdmin || userProgress?.role === 'admin'}>
          {fullMatch}
        </PrimarySource>
      );

      lastIndex = match.index + fullMatch.length;
    }

    if (lastIndex < text.length) {
      parts.push(...parseBibleReferences(text.substring(lastIndex), `${keyPrefix}-post`));
    }

    return parts;
  }, [parseBibleReferences, isAdmin, userProgress]);

  // Parser Inline Mestre
  const parseInline = useCallback((t: string): React.ReactNode => {
    const parts = t.split(/(\{\{.*?\|.*?\}\}|\[\[.*?\|.*?\]\]|\*\*(?!\s).*?(?<!\s)\*\*|\*(?!\s).*?(?<!\s)\*)/g);
    return parts.map((part, i) => {
      if (!part) return null;
      
      if (part.startsWith('{{') && part.endsWith('}}') && part.includes('|')) {
        const inner = part.slice(2, -2);
        const refParts = inner.split('|');
        const source = refParts[0]?.trim() || '';
        const reference = refParts[1]?.trim() || '';
        const hiddenCommand = refParts.slice(2).join('|').trim() || '';
        
        return (
          <PrimarySource key={`ps-${i}`} source={source} reference={reference} hiddenCommand={hiddenCommand} isAdmin={isAdmin || userProgress?.role === 'admin'}>
            {source}, {reference}
          </PrimarySource>
        );
      }
      if (part.startsWith('[[') && part.endsWith(']]') && part.includes('|')) {
        const inner = part.slice(2, -2);
        const [term, ...explanationParts] = inner.split('|');
        const explanation = explanationParts.join('|');
        return (
          <GlossaryTerm key={`glossary-${i}`} term={term.trim()} explanation={explanation.trim()}>
            {term.trim()}
          </GlossaryTerm>
        );
      }
      if (part.startsWith('**') && part.endsWith('**')) {
        const inner = part.slice(2, -2);
        return <strong key={i} className="text-[#8B0000] dark:text-[#ff6b6b] font-extrabold">{parseInline(inner)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={i} className="text-[#C5A059] italic font-semibold">{parseInline(part.slice(1, -1))}</em>;
      }
      return parseHistoricalSources(part, `text-${i}`);
    });
  }, [parseHistoricalSources, isAdmin, userProgress]);

  // Filtro de livros bíblicos
  const filteredBooks = useMemo(() => {
    if (!bookSearch.trim()) return BIBLE_BOOKS;
    const q = bookSearch.toLowerCase();
    return BIBLE_BOOKS.filter(b => b.name.toLowerCase().includes(q) || b.abbrev.toLowerCase().includes(q));
  }, [bookSearch]);

  const currentBookData = useMemo(() => {
    return BIBLE_BOOKS.find(b => b.name === selectedBook) || BIBLE_BOOKS[0];
  }, [selectedBook]);

  // Filtro de temas do Curso de Teologia
  const filteredThemes = useMemo(() => {
    if (!theologySearch.trim()) return thematicThemes;
    const q = theologySearch.toLowerCase();
    return thematicThemes.filter(t => t.title.toLowerCase().includes(q) || (t.description && t.description.toLowerCase().includes(q)));
  }, [thematicThemes, theologySearch]);

  // Se não for Admin, bloquear visualização
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-[#0F0505] flex items-center justify-center p-6 text-white font-cinzel">
        <div className="max-w-md w-full bg-[#1A0A0A] border border-[#C5A059]/30 rounded-3xl p-8 text-center shadow-2xl space-y-6">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-[#8B0000]/20 border border-[#8B0000]/40 flex items-center justify-center">
            <ShieldCheck className="w-10 h-10 text-[#C5A059]" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-[#F5F5DC] tracking-wide mb-2">Acesso Restrito ao Mestre</h2>
            <p className="text-xs text-[#C5A059] uppercase tracking-widest font-mono">Modo Beta Fechado</p>
          </div>
          <p className="text-sm font-cormorant text-gray-300 leading-relaxed">
            A Sala de Aula Ao Vivo está em fase de testes exclusivos para a liderança e administração da Bíblia ADMA.
          </p>
          <button 
            onClick={onBack}
            className="w-full py-4 bg-[#8B0000] hover:bg-[#a00000] text-white font-bold rounded-2xl tracking-widest transition-all shadow-lg active:scale-95"
          >
            VOLTAR AO INÍCIO
          </button>
        </div>
      </div>
    );
  }

  // Título e identificação atual da aula
  const classroomTitle = isTheologyMode 
    ? (activeLesson ? `${activeTheme?.title || 'Teologia'} • ${activeLesson.title}` : (activeTheme?.title || 'Curso de Teologia'))
    : `${selectedBook} ${selectedChapter}`;

  return (
    <div className="min-h-screen bg-[#FDFBF7] dark:bg-[#0c0505] text-gray-900 dark:text-gray-100 flex flex-col relative w-full max-w-full overflow-x-hidden">
      
      {/* ============================================================ */}
      {/* CABEÇALHO DO PROFESSOR (100% RESPONSIVO PARA MOBILE E DESKTOP) */}
      {/* ============================================================ */}
      <header className="sticky top-0 z-40 bg-[#0F0505]/95 backdrop-blur-md border-b border-[#C5A059]/30 text-white shadow-2xl w-full max-w-full">
        
        {/* VERSÃO MOBILE: HEADER EM 2 LINHAS HARMONIOSAS */}
        <div className="block md:hidden px-3 py-2 space-y-2">
          
          {/* LINHA 1 (MOBILE): Voltar + Status + Chat */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button 
                onClick={onBack}
                className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 hover:border-[#C5A059] flex items-center justify-center text-[#C5A059] shrink-0 active:scale-95"
                title="Voltar"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-cinzel font-black text-xs tracking-wider text-[#F5F5DC] truncate">
                    AULA AO VIVO
                  </span>
                  <span className="bg-[#C5A059] text-black font-black text-[8px] px-1.5 py-0.2 rounded font-mono uppercase shrink-0">
                    BETA
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[9px] font-mono text-white/60">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    NO AR
                  </span>
                  <span>•</span>
                  <span className="text-[#C5A059] flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" /> {formatTimer(classSeconds)}
                  </span>
                </div>
              </div>
            </div>

            {/* BOTÕES DIREITA MOBILE: CHAT & MINIMIZAR CÂMERA */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setIsPipMinimized(p => !p)}
                className={`p-1.5 rounded-xl border transition-all text-xs flex items-center gap-1 ${
                  isPipMinimized 
                    ? 'bg-red-600/30 text-red-300 border-red-500/40' 
                    : 'bg-white/5 text-[#C5A059] border-white/10'
                }`}
                title={isPipMinimized ? "Restaurar Câmera" : "Minimizar Câmera"}
              >
                <Video className="w-4 h-4" />
              </button>

              <button
                onClick={() => setShowSidePanel(p => !p)}
                className={`relative p-2 rounded-xl border transition-all flex items-center justify-center ${
                  showSidePanel 
                    ? 'bg-[#C5A059] text-black border-[#C5A059] shadow-md' 
                    : 'bg-[#1A0A0A] text-[#C5A059] border-[#C5A059]/40'
                }`}
                title="Chat da Aula"
              >
                <MessageSquare className="w-4 h-4" />
                {chatMessages.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#8B0000] text-white text-[8px] font-bold flex items-center justify-center">
                    {chatMessages.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* LINHA 2 (MOBILE): Seletor de Matéria/Lição em Largura Total + Zoom */}
          <div className="flex items-center gap-1.5 w-full">
            <button
              onClick={() => setShowBookSelector(true)}
              className="flex-1 min-w-0 px-2.5 py-1.5 rounded-xl bg-[#1A0A0A] border border-[#C5A059]/40 text-white flex items-center justify-between gap-2 active:scale-95 shadow-sm"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                {isTheologyMode ? (
                  <GraduationCap className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
                ) : (
                  <BookOpen className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
                )}
                <div className="text-left min-w-0">
                  <span className="font-cinzel font-bold text-[11px] text-[#F5F5DC] block truncate leading-tight">
                    {classroomTitle}
                  </span>
                  <span className="text-[8px] text-[#C5A059] uppercase tracking-wider block opacity-80 leading-none">
                    {isTheologyMode ? 'Teologia ▾' : 'Panorama Bíblico ▾'}
                  </span>
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-[#C5A059] shrink-0 opacity-70" />
            </button>

            {/* CONTROLES COMPACTOS DE LEITURA (ZOOM & FOCO) */}
            <div className="flex items-center bg-black/50 border border-white/10 rounded-xl px-1.5 py-0.5 shrink-0">
              <button
                onClick={() => setFontSize(prev => Math.max(16, prev - 2))}
                className="w-6 h-6 text-white/80 font-cinzel font-bold text-[10px] flex items-center justify-center"
                title="Diminuir Fonte"
              >
                A-
              </button>
              <button
                onClick={() => setFontSize(prev => Math.min(32, prev + 2))}
                className="w-6 h-6 text-white/80 font-cinzel font-bold text-[10px] flex items-center justify-center"
                title="Aumentar Fonte"
              >
                A+
              </button>
              <button
                onClick={() => {
                  setPointerActive(p => !p);
                  if (pointerActive) setFocusedBlockId(null);
                  onShowToast(!pointerActive ? "Apontador ativado" : "Apontador desativado", "info");
                }}
                className={`w-6 h-6 rounded flex items-center justify-center transition-all ${
                  pointerActive ? 'bg-[#C5A059] text-black' : 'text-white/80'
                }`}
                title="Apontador"
              >
                <Pointer className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* VERSÃO DESKTOP (TELA MÉDIA E GRANDE) */}
        <div className="hidden md:flex px-6 py-3 items-center justify-between gap-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <button 
              onClick={onBack}
              className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 hover:border-[#C5A059] hover:bg-white/10 flex items-center justify-center text-[#C5A059] transition-all active:scale-95"
              title="Voltar ao Início"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-cinzel font-black text-base tracking-widest text-[#F5F5DC]">
                  SALA DE AULA AO VIVO
                </span>
                <span className="bg-[#C5A059] text-black font-black text-[9px] px-2 py-0.5 rounded font-mono uppercase tracking-widest">
                  BETA ADMIN
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-montserrat text-white/60 tracking-wider">
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  PROFESSOR CONECTADO
                </span>
                <span>•</span>
                <span className="font-mono text-[#C5A059] flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {formatTimer(classSeconds)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowBookSelector(true)}
              className="px-4 py-2 rounded-2xl bg-[#1A0A0A] border border-[#C5A059]/40 hover:border-[#C5A059] text-white flex items-center gap-3 transition-all active:scale-95 shadow-lg max-w-xs truncate"
            >
              {isTheologyMode ? (
                <GraduationCap className="w-4 h-4 text-[#C5A059] shrink-0" />
              ) : (
                <BookOpen className="w-4 h-4 text-[#C5A059] shrink-0" />
              )}
              <div className="text-left truncate">
                <span className="font-cinzel font-black text-xs text-[#F5F5DC] block leading-tight truncate">
                  {classroomTitle}
                </span>
                <span className="text-[9px] text-[#C5A059] uppercase tracking-widest block opacity-80 truncate">
                  {isTheologyMode ? 'Curso de Teologia ▾' : 'EBD Panorama Bíblico ▾'}
                </span>
              </div>
            </button>

            {!isTheologyMode && (
              <div className="flex items-center bg-black/40 border border-white/10 rounded-2xl p-1">
                <button
                  onClick={() => setActiveTab('student')}
                  className={`px-3 py-1.5 rounded-xl font-cinzel text-xs font-bold transition-all ${
                    activeTab === 'student' 
                      ? 'bg-[#8B0000] text-white shadow-md' 
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  Aluno
                </button>
                <button
                  onClick={() => setActiveTab('teacher')}
                  className={`px-3 py-1.5 rounded-xl font-cinzel text-xs font-bold transition-all ${
                    activeTab === 'teacher' 
                      ? 'bg-[#8B0000] text-white shadow-md' 
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  Mestre
                </button>
              </div>
            )}

            <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-2xl px-2 py-1">
              <button
                onClick={() => setFontSize(prev => Math.max(16, prev - 2))}
                className="w-7 h-7 rounded-lg text-white/80 hover:text-white hover:bg-white/10 font-cinzel font-bold text-xs flex items-center justify-center"
                title="Diminuir Fonte"
              >
                A-
              </button>
              <button
                onClick={() => setFontSize(prev => Math.min(32, prev + 2))}
                className="w-7 h-7 rounded-lg text-white/80 hover:text-white hover:bg-white/10 font-cinzel font-bold text-xs flex items-center justify-center"
                title="Aumentar Fonte"
              >
                A+
              </button>
              <div className="w-[1px] h-4 bg-white/20 mx-1"></div>
              <button
                onClick={() => {
                  setPointerActive(p => !p);
                  if (pointerActive) setFocusedBlockId(null);
                  onShowToast(!pointerActive ? "Apontador ativado" : "Apontador desativado", "info");
                }}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                  pointerActive ? 'bg-[#C5A059] text-black shadow-md' : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
                title="Modo Apontador"
              >
                <Pointer className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => setShowSidePanel(p => !p)}
              className={`relative p-2.5 rounded-2xl border transition-all active:scale-95 flex items-center justify-center ${
                showSidePanel 
                  ? 'bg-[#C5A059] text-black border-[#C5A059] shadow-lg' 
                  : 'bg-[#1A0A0A] text-[#C5A059] border-[#C5A059]/40 hover:border-[#C5A059]'
              }`}
              title="Chat da Turma"
            >
              <MessageSquare className="w-5 h-5" />
              {chatMessages.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#8B0000] text-white text-[9px] font-bold flex items-center justify-center">
                  {chatMessages.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ÁREA PRINCIPAL: ESTUDO NA TELA */}
      <main className="flex-1 flex overflow-hidden relative w-full max-w-full">
        
        {/* CONTEÚDO DO ESTUDO */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-6 md:px-16 py-4 md:py-8 max-w-5xl mx-auto w-full transition-all">
          
          {/* BANNER SACRO DO TOPO DA AULA (RESPONSIVO PARA NÃO CORTAR) */}
          <div className="mb-6 md:mb-8 p-4 sm:p-6 md:p-8 rounded-2xl md:rounded-3xl bg-gradient-to-br from-[#1A0A0A] via-[#0F0505] to-[#250000] text-white border border-[#C5A059]/40 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 md:w-64 h-48 md:h-64 bg-[#C5A059]/10 rounded-full blur-3xl pointer-events-none"></div>
            
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
              <div className="min-w-0">
                <span className="font-mono text-[9px] md:text-[10px] text-[#C5A059] uppercase tracking-[0.2em] font-bold block mb-1">
                  {isTheologyMode ? 'CURSO DE FORMAÇÃO TEOLÓGICA • PROF. MICHEL FELIX' : 'ESCOLA BÍBLICA DOMINICAL • PROF. MICHEL FELIX'}
                </span>
                <h1 className="font-cinzel text-xl sm:text-2xl md:text-4xl font-black text-white tracking-tight leading-snug break-words">
                  {isTheologyMode 
                    ? (activeLesson ? activeLesson.title.toUpperCase() : (activeTheme?.title?.toUpperCase() || 'TEOLOGIA'))
                    : `${selectedBook.toUpperCase()} — CAPÍTULO ${selectedChapter}`
                  }
                </h1>
                <p className="font-cormorant text-xs sm:text-sm md:text-base text-gray-300 italic mt-1">
                  {isTheologyMode 
                    ? `Matéria: ${activeTheme?.title || 'Estudos Temáticos'} • Teologia Reformada Clássica & Pentecostal` 
                    : 'Exegese Padrão Ouro • Conexão Cristológica • Assembleia de Deus Ministério Ágape'
                  }
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="px-3 py-1.5 md:px-4 md:py-2 rounded-xl bg-black/50 border border-[#C5A059]/30 text-[10px] md:text-xs font-mono text-[#C5A059] flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                  {isTheologyMode 
                    ? 'AULA DE TEOLOGIA' 
                    : (activeTab === 'teacher' ? 'GUIA DO MESTRE' : 'MANUSCRITO DO ALUNO')
                  }
                </span>
              </div>
            </div>
          </div>

          {/* RENDERIZADOR DO CONTEÚDO COM TODAS AS PÉROLAS E VERSÍCULOS CLICÁVEIS */}
          {pages && pages.length > 0 ? (
            <div 
              className="bg-white dark:bg-[#140808] p-4 sm:p-6 md:p-12 rounded-2xl md:rounded-3xl border border-gray-100 dark:border-white/5 shadow-2xl transition-all"
              onClick={(e) => {
                if (pointerActive) {
                  const target = e.target as HTMLElement;
                  if (target.closest('button') || target.closest('[data-popover]')) return;

                  const block = target.closest('[id^="read-block-"]');
                  if (block) {
                    const idStr = block.id.replace('read-block-', '');
                    const blockId = parseInt(idStr, 10);
                    setFocusedBlockId(prev => prev === blockId ? null : blockId);
                  }
                }
              }}
            >
              {focusedBlockId !== null && pointerActive && (
                <div className="mb-4 p-2.5 md:p-3 rounded-xl bg-[#C5A059]/15 border border-[#C5A059]/40 text-xs font-cinzel text-[#C5A059] flex items-center justify-between animate-fadeIn">
                  <span className="flex items-center gap-1.5 text-[11px] md:text-xs">
                    <Pointer className="w-3.5 h-3.5 text-[#C5A059]" /> Parágrafo {focusedBlockId + 1} em destaque na apresentação da turma
                  </span>
                  <button 
                    onClick={() => setFocusedBlockId(null)}
                    className="text-[9px] uppercase font-bold underline hover:text-white shrink-0 ml-2"
                  >
                    Remover Foco
                  </button>
                </div>
              )}

              <EbdContentRenderer 
                pages={pages}
                currentPage={currentPage}
                fontSize={fontSize}
                isPlaying={false}
                currentGlobalIndex={focusedBlockId !== null ? focusedBlockId : -1}
                globalSentences={[]}
                parseInline={parseInline}
                isAdmin={true}
                studyKey={studyKey}
                currentUserEmail={userProgress?.user_email}
                onShowToast={onShowToast}
              />

              {/* PAGINAÇÃO INFERIOR SE HOUVER VÁRIAS PÁGINAS */}
              {pages.length > 1 && (
                <div className="mt-8 md:mt-12 pt-6 border-t border-gray-100 dark:border-white/10 flex items-center justify-between">
                  <button
                    onClick={() => {
                      setCurrentPage(p => Math.max(0, p - 1));
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    disabled={currentPage === 0}
                    className="px-3.5 py-2 md:px-5 md:py-2.5 rounded-xl border border-[#C5A059]/40 font-cinzel font-bold text-[11px] md:text-xs text-[#C5A059] disabled:opacity-30 flex items-center gap-1.5"
                  >
                    <ChevronLeft className="w-4 h-4" /> Anterior
                  </button>
                  <span className="font-cinzel text-[11px] md:text-xs text-gray-500 font-bold">
                    Pág. {currentPage + 1} / {pages.length}
                  </span>
                  <button
                    onClick={() => {
                      setCurrentPage(p => Math.min(pages.length - 1, p + 1));
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    disabled={currentPage === pages.length - 1}
                    className="px-3.5 py-2 md:px-5 md:py-2.5 rounded-xl bg-[#8B0000] text-white font-cinzel font-bold text-[11px] md:text-xs disabled:opacity-30 flex items-center gap-1.5"
                  >
                    Próxima <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-16 md:py-24 bg-white dark:bg-[#140808] p-6 rounded-2xl md:rounded-3xl border border-[#C5A059]/20 shadow-xl space-y-4 md:space-y-6">
              <div className="w-16 h-16 md:w-20 md:h-20 mx-auto rounded-3xl bg-[#8B0000]/10 border border-[#8B0000]/30 flex items-center justify-center">
                {isTheologyMode ? <GraduationCap className="w-8 h-8 md:w-10 md:h-10 text-[#C5A059]" /> : <BookOpen className="w-8 h-8 md:w-10 md:h-10 text-[#C5A059]" />}
              </div>
              <div>
                <h3 className="font-cinzel font-black text-lg md:text-2xl text-gray-800 dark:text-gray-100">
                  {isTheologyMode 
                    ? 'Nenhuma aula de Teologia selecionada' 
                    : `Estudo de ${selectedBook} ${selectedChapter} ainda não gerado`
                  }
                </h3>
                <p className="font-cormorant text-xs md:text-base text-gray-500 max-w-md mx-auto mt-2">
                  {isTheologyMode 
                    ? 'Selecione uma matéria e lição do Curso de Teologia no botão acima para ministrar à turma.' 
                    : 'Você pode selecionar outro livro ou alternar para as aulas do Curso de Teologia.'
                  }
                </p>
              </div>
              <button
                onClick={() => setShowBookSelector(true)}
                className="px-6 py-3 bg-[#8B0000] text-white font-cinzel font-bold text-xs rounded-2xl tracking-widest hover:scale-105 transition-all shadow-lg"
              >
                ESCOLHER CONTEÚDO DA AULA
              </button>
            </div>
          )}
        </div>

        {/* GAVETA LATERAL RETRÁTIL: CHAT REAL DA TURMA & PRESENÇA */}
        {showSidePanel && (
          <aside className="fixed inset-y-0 right-0 w-full sm:w-80 md:w-96 bg-[#0F0505] border-l border-[#C5A059]/30 text-white flex flex-col shadow-2xl z-50 animate-in slide-in-from-right-10 duration-200">
            <div className="p-3 md:p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActiveSideTab('chat')}
                  className={`font-cinzel text-xs font-bold pb-1 transition-all ${
                    activeSideTab === 'chat' 
                      ? 'text-[#C5A059] border-b-2 border-[#C5A059]' 
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  Chat da Aula ({chatMessages.length})
                </button>
                <button
                  onClick={() => setActiveSideTab('attendance')}
                  className={`font-cinzel text-xs font-bold pb-1 transition-all ${
                    activeSideTab === 'attendance' 
                      ? 'text-[#C5A059] border-b-2 border-[#C5A059]' 
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  Turma
                </button>
              </div>
              
              <div className="flex items-center gap-1">
                {isAuthorized && chatMessages.length > 0 && activeSideTab === 'chat' && (
                  <button
                    onClick={handleClearChat}
                    className="p-1 rounded text-red-400 hover:text-red-300 hover:bg-white/10"
                    title="Limpar Chat da Aula"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button 
                  onClick={() => setShowSidePanel(false)}
                  className="text-white/60 hover:text-white p-1.5 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* CONTEÚDO DA GAVETA: CHAT REAL */}
            {activeSideTab === 'chat' ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3">
                  {chatMessages.length > 0 ? (
                    chatMessages.map((msg, index) => {
                      const isTeacher = msg.role === 'professor';
                      const timeStr = msg.created_at 
                        ? new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                        : '';

                      return (
                        <div 
                          key={msg.id || index} 
                          className={`p-2.5 md:p-3 rounded-2xl border ${
                            isTeacher 
                              ? 'bg-[#8B0000]/25 border-[#C5A059]/40 ml-4' 
                              : 'bg-white/5 border-white/10 mr-4'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-[10px] md:text-[11px] font-bold ${isTeacher ? 'text-[#C5A059]' : 'text-gray-300'}`}>
                              {msg.sender_name} {isTeacher && '★'}
                            </span>
                            <span className="text-[8px] text-white/40 font-mono">{timeStr}</span>
                          </div>
                          <p className="text-xs text-gray-200 leading-relaxed font-sans select-text">{msg.message}</p>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-16 text-center text-gray-400 space-y-2">
                      <MessageSquare className="w-8 h-8 mx-auto text-[#C5A059]/40" />
                      <p className="font-cinzel text-xs text-gray-300">Nenhuma mensagem nesta aula ainda.</p>
                      <p className="text-[10px] text-gray-500 font-sans">
                        Envie um recado, tire dúvidas com a turma ou responda perguntas ao vivo!
                      </p>
                    </div>
                  )}
                </div>

                {/* FORMULÁRIO DE ENVIO REAL */}
                <form onSubmit={handleSendMessage} className="p-2.5 md:p-3 border-t border-white/10 flex gap-2">
                  <input 
                    type="text" 
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    placeholder="Digite sua mensagem para a turma..."
                    className="flex-1 bg-black/40 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder-white/40 focus:outline-none focus:border-[#C5A059]"
                  />
                  <button 
                    type="submit"
                    disabled={!chatMessage.trim()}
                    className="p-2 md:p-2.5 bg-[#8B0000] hover:bg-[#a00000] text-white rounded-xl transition-all disabled:opacity-40"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3">
                <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#8B0000] flex items-center justify-center font-bold text-xs text-white">
                      PF
                    </div>
                    <div>
                      <span className="text-xs font-bold text-white block">Prof. Michel Felix</span>
                      <span className="text-[10px] text-[#C5A059] block">Professor / Exegeta Titular</span>
                    </div>
                  </div>
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-mono">
                    TRANSMITINDO
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-white/5 text-xs text-gray-300 border border-white/5">
                  <span className="text-[10px] text-[#C5A059] font-mono uppercase tracking-wider block mb-1">
                    STATUS DA TURMA
                  </span>
                  <p className="text-[11px] text-gray-400">
                    Os membros conectados visualizam o conteúdo ao vivo e podem interagir pelo chat em tempo real.
                  </p>
                </div>
              </div>
            )}
          </aside>
        )}
      </main>

      {/* ============================================================ */}
      {/* MINIATURA DA CÂMERA DO PROFESSOR (ADAPTADA AO CELULAR) */}
      {/* ============================================================ */}
      <div 
        style={{
          position: 'fixed',
          left: `${pipPosition.x}px`,
          top: `${pipPosition.y}px`,
          zIndex: 45,
          touchAction: 'none'
        }}
        className="transition-shadow select-none group"
      >
        {isPipMinimized ? (
          /* MODO MINIMIZADO: Pílula compacta magnética */
          <div 
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onClick={() => setIsPipMinimized(false)}
            className="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full bg-[#0F0505] border border-[#C5A059] shadow-2xl cursor-grab active:cursor-grabbing text-white"
          >
            <div className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse"></div>
            <span className="font-cinzel text-[10px] md:text-xs font-bold text-[#F5F5DC]">Câmera Mestre</span>
            <Maximize2 className="w-3 h-3 text-[#C5A059]" />
          </div>
        ) : (
          /* MODO EXPANDIDO: Janela Flutuante com Proporção Otimizada */
          <div 
            style={{ width: `${getPipWidth()}px` }}
            className="rounded-xl md:rounded-2xl border-2 border-[#C5A059] shadow-[0_15px_35px_rgba(0,0,0,0.85)] bg-[#0F0505] overflow-hidden backdrop-blur-xl transition-all duration-200"
          >
            {/* CABEÇALHO DO CARD DA CÂMERA (ÁREA DE ARRASTO) */}
            <div 
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className="px-2 py-1.5 bg-gradient-to-r from-[#1A0A0A] to-[#250000] border-b border-[#C5A059]/30 flex items-center justify-between cursor-grab active:cursor-grabbing"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping shrink-0"></span>
                <span className="font-cinzel font-black text-[9px] tracking-wider text-[#F5F5DC] truncate">
                  MESTRE AO VIVO
                </span>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPipSize(prev => prev === 'normal' ? 'large' : prev === 'large' ? 'compact' : 'normal');
                  }}
                  className="p-1 rounded text-white/60 hover:text-[#C5A059]"
                  title="Alternar Tamanho"
                >
                  <Maximize2 className="w-2.5 h-2.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsPipMinimized(true);
                  }}
                  className="p-1 rounded text-white/60 hover:text-[#C5A059]"
                  title="Minimizar Câmera"
                >
                  <Minimize2 className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>

            {/* VÍDEO DO PROFESSOR */}
            <div className="relative bg-black aspect-video flex items-center justify-center overflow-hidden">
              {cameraActive && !isVideoPaused ? (
                <video 
                  ref={videoRef}
                  autoPlay 
                  playsInline 
                  muted 
                  className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#1A0A0A] to-[#0A0505] text-[#C5A059] p-2 text-center">
                  <VideoOff className="w-5 h-5 text-[#C5A059] mb-1 opacity-70" />
                  <span className="font-cinzel text-[9px] font-bold text-white leading-none">Pausada</span>
                </div>
              )}

              {/* FEEDBACK DE MICROFONE MUDO NA TELA */}
              {isMicMuted && (
                <div className="absolute top-1 left-1 bg-red-600/90 text-white text-[8px] px-1.5 py-0.2 rounded font-mono font-bold flex items-center gap-1 shadow-md">
                  <MicOff className="w-2 h-2" /> MUDO
                </div>
              )}
            </div>

            {/* CONTROLES RÁPIDOS DA CÂMERA NA BASE */}
            <div className="p-1.5 bg-[#0F0505] flex items-center justify-around border-t border-[#C5A059]/20">
              <button
                onClick={toggleMic}
                className={`p-1.5 rounded-lg transition-all ${
                  isMicMuted 
                    ? 'bg-red-600 text-white' 
                    : 'bg-white/5 text-[#C5A059] hover:bg-white/10'
                }`}
                title={isMicMuted ? "Ativar Microfone" : "Silenciar Microfone"}
              >
                {isMicMuted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
              </button>

              <button
                onClick={toggleVideo}
                className={`p-1.5 rounded-lg transition-all ${
                  isVideoPaused 
                    ? 'bg-red-600 text-white' 
                    : 'bg-white/5 text-[#C5A059] hover:bg-white/10'
                }`}
                title={isVideoPaused ? "Ligar Câmera" : "Pausar Câmera"}
              >
                {isVideoPaused ? <VideoOff className="w-3 h-3" /> : <Video className="w-3 h-3" />}
              </button>

              <button
                onClick={flipCamera}
                className="p-1.5 rounded-lg bg-white/5 text-[#C5A059] hover:bg-white/10 transition-all"
                title="Inverter Câmera"
              >
                <SwitchCamera className="w-3 h-3" />
              </button>

              <button
                onClick={() => snapToCorner('bottom-right')}
                className="p-1.5 rounded-lg bg-white/5 text-white/60 hover:text-[#C5A059] transition-all"
                title="Encaixar Canto"
              >
                <Move className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* MODAL DE SELEÇÃO DE ESTUDO DA AULA (EBD OU TEOLOGIA) */}
      {/* ============================================================ */}
      {showBookSelector && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
          <div className="bg-[#0F0505] border-2 border-[#C5A059]/50 rounded-2xl md:rounded-3xl w-[94vw] max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            
            {/* CABEÇALHO DO MODAL COM ABAS: EBD PANORAMA VS CURSO DE TEOLOGIA */}
            <div className="p-3 sm:p-4 border-b border-[#C5A059]/30 bg-gradient-to-r from-[#1A0A0A] to-[#250000] flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  onClick={() => setSelectorTab('bible')}
                  className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl sm:rounded-2xl font-cinzel font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition-all ${
                    selectorTab === 'bible' 
                      ? 'bg-[#8B0000] text-white shadow-lg border border-[#C5A059]/40' 
                      : 'text-white/60 hover:text-white bg-white/5'
                  }`}
                >
                  <BookOpen className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#C5A059]" />
                  EBD Panorama
                </button>
                <button
                  onClick={() => setSelectorTab('theology')}
                  className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl sm:rounded-2xl font-cinzel font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition-all ${
                    selectorTab === 'theology' 
                      ? 'bg-[#8B0000] text-white shadow-lg border border-[#C5A059]/40' 
                      : 'text-white/60 hover:text-white bg-white/5'
                  }`}
                >
                  <GraduationCap className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#C5A059]" />
                  Teologia
                </button>
              </div>
              <button 
                onClick={() => setShowBookSelector(false)}
                className="text-white/60 hover:text-white p-1.5 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* CONTEÚDO DA ABA 1: EBD PANORAMA BÍBLICO (LIVROS E CAPÍTULOS) */}
            {selectorTab === 'bible' ? (
              <>
                <div className="p-3 sm:p-4 border-b border-white/10">
                  <input 
                    type="text"
                    value={bookSearch}
                    onChange={(e) => setBookSearch(e.target.value)}
                    placeholder="Buscar livro bíblico (ex: Levítico, Romanos, Gênesis)..."
                    className="w-full px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl sm:rounded-2xl bg-white/5 border border-white/15 text-white placeholder-white/40 font-montserrat text-xs sm:text-sm focus:outline-none focus:border-[#C5A059]"
                  />
                </div>

                <div className="flex-1 overflow-y-auto p-3 sm:p-6 grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
                  {filteredBooks.map(b => (
                    <button
                      key={b.name}
                      onClick={() => {
                        setSelectedBook(b.name);
                        setSelectedChapter(1);
                        setActiveTab('student');
                        setShowBookSelector(false);
                      }}
                      className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl text-left border transition-all ${
                        !isTheologyMode && selectedBook === b.name
                          ? 'bg-[#8B0000] text-white border-[#C5A059] shadow-lg'
                          : 'bg-white/5 text-gray-200 border-white/10 hover:border-[#C5A059]/40 hover:bg-white/10'
                      }`}
                    >
                      <span className="font-cinzel font-bold text-xs sm:text-sm block truncate">{b.name}</span>
                      <span className="text-[9px] sm:text-[10px] text-white/50 uppercase font-mono mt-0.5 block">
                        {b.chapters} {b.chapters === 1 ? 'Capítulo' : 'Capítulos'}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="p-3 sm:p-4 bg-black/60 border-t border-white/10 flex items-center justify-between gap-2">
                  <span className="text-[11px] sm:text-xs font-cinzel text-gray-300 truncate">
                    Cap. de <strong className="text-[#C5A059]">{selectedBook}</strong>:
                  </span>
                  <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-[60%]">
                    {Array.from({ length: currentBookData.chapters }, (_, i) => i + 1).map(chapNum => (
                      <button
                        key={chapNum}
                        onClick={() => {
                          setSelectedChapter(chapNum);
                          setActiveTab('student');
                          setShowBookSelector(false);
                        }}
                        className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl shrink-0 font-mono text-[11px] sm:text-xs font-bold transition-all ${
                          !isTheologyMode && selectedChapter === chapNum
                            ? 'bg-[#C5A059] text-black shadow-md'
                            : 'bg-white/10 text-white hover:bg-white/20'
                        }`}
                      >
                        {chapNum}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              /* CONTEÚDO DA ABA 2: CURSO DE TEOLOGIA & TEMÁTICOS */
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-3 sm:p-4 border-b border-white/10 flex items-center gap-2 sm:gap-3">
                  <input 
                    type="text"
                    value={theologySearch}
                    onChange={(e) => setTheologySearch(e.target.value)}
                    placeholder="Buscar matéria (ex: Hermenêutica, Cristologia)..."
                    className="flex-1 px-3 py-2 rounded-xl sm:rounded-2xl bg-white/5 border border-white/15 text-white placeholder-white/40 font-montserrat text-xs focus:outline-none focus:border-[#C5A059]"
                  />
                  <button
                    onClick={() => setIsCreatingTheme(prev => !prev)}
                    className="px-3 py-2 bg-[#8B0000] hover:bg-[#a00000] text-white rounded-xl sm:rounded-2xl font-cinzel text-[10px] sm:text-[11px] font-bold flex items-center gap-1 shrink-0 transition-all shadow-md"
                  >
                    <Plus className="w-3 h-3" />
                    + Matéria
                  </button>
                </div>

                {/* FORMULÁRIO DE NOVA MATÉRIA */}
                {isCreatingTheme && (
                  <div className="p-3 bg-black/60 border-b border-[#C5A059]/30 flex items-center gap-2 animate-fadeIn">
                    <input 
                      type="text"
                      value={newThemeTitleInput}
                      onChange={(e) => setNewThemeTitleInput(e.target.value)}
                      placeholder="Título da Nova Matéria..."
                      className="flex-1 px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-xs placeholder-white/40 focus:outline-none focus:border-[#C5A059]"
                    />
                    <button
                      onClick={handleCreateQuickTheme}
                      className="px-3 py-1.5 bg-[#C5A059] text-black font-cinzel font-bold text-xs rounded-lg hover:bg-[#d8b368] transition-all"
                    >
                      Salvar
                    </button>
                    <button
                      onClick={() => setIsCreatingTheme(false)}
                      className="p-1 text-white/50 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3">
                  {filteredThemes && filteredThemes.length > 0 ? (
                    filteredThemes.map(theme => {
                      const isExpanded = expandedThemeId === theme.id;
                      const isLoadingLessons = loadingLessonsThemeId === theme.id;
                      const lessons = lessonsByTheme[theme.id!] || [];

                      return (
                        <div 
                          key={theme.id} 
                          className={`rounded-xl sm:rounded-2xl border transition-all overflow-hidden ${
                            isExpanded 
                              ? 'bg-white/10 border-[#C5A059]/60 shadow-xl' 
                              : 'bg-white/5 border-white/10 hover:border-white/20'
                          }`}
                        >
                          {/* CABEÇALHO DO TEMA CLICÁVEL */}
                          <div 
                            onClick={() => handleToggleTheme(theme)}
                            className="p-3 sm:p-4 flex items-center justify-between cursor-pointer select-none gap-2"
                          >
                            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                              <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                                isExpanded ? 'bg-[#C5A059] text-black shadow-md' : 'bg-[#C5A059]/20 text-[#C5A059]'
                              }`}>
                                <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5" />
                              </div>
                              <div className="min-w-0">
                                <h4 className="font-cinzel font-bold text-xs sm:text-sm text-white truncate">{theme.title}</h4>
                                <p className="text-[10px] sm:text-[11px] text-gray-400 font-cormorant truncate">
                                  {theme.description || 'Módulo Teológico ADMA'}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {isLoadingLessons ? (
                                <Loader2 className="w-4 h-4 text-[#C5A059] animate-spin" />
                              ) : isExpanded ? (
                                <span className="flex items-center gap-1 text-[10px] sm:text-[11px] font-cinzel font-bold text-[#C5A059]">
                                  Recolher <ChevronUp className="w-3.5 h-3.5" />
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-[10px] sm:text-[11px] font-cinzel font-bold text-[#C5A059] bg-[#C5A059]/15 px-2.5 py-1 rounded-lg border border-[#C5A059]/30 hover:bg-[#C5A059] hover:text-black transition-all">
                                  Ver Aulas <ChevronDown className="w-3.5 h-3.5" />
                                </span>
                              )}
                            </div>
                          </div>

                          {/* LISTA EXPANDIDA DE AULAS DESTA MATÉRIA */}
                          {isExpanded && (
                            <div className="px-3 pb-3 pt-2 sm:px-4 sm:pb-4 border-t border-white/10 space-y-2.5 bg-black/40 animate-fadeIn">
                              <div className="flex items-center justify-between pt-1">
                                <span className="text-[9px] sm:text-[10px] font-mono text-[#C5A059] uppercase tracking-wider font-bold">
                                  Aulas Disponíveis ({lessons.length}):
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIsCreatingLessonThemeId(prev => prev === theme.id ? null : theme.id!);
                                  }}
                                  className="text-[9px] sm:text-[10px] font-cinzel font-bold text-white/80 hover:text-[#C5A059] flex items-center gap-1"
                                >
                                  <Plus className="w-3 h-3" /> + Nova Lição
                                </button>
                              </div>

                              {/* FORMULÁRIO DE NOVA LIÇÃO */}
                              {isCreatingLessonThemeId === theme.id && (
                                <div className="p-2.5 bg-black/70 rounded-xl border border-[#C5A059]/40 flex items-center gap-2">
                                  <input 
                                    type="text" 
                                    value={newLessonTitleInput}
                                    onChange={(e) => setNewLessonTitleInput(e.target.value)}
                                    placeholder="Título da Aula..."
                                    className="flex-1 px-2.5 py-1 rounded-lg bg-white/10 border border-white/20 text-white text-xs placeholder-white/40 focus:outline-none focus:border-[#C5A059]"
                                  />
                                  <button
                                    onClick={() => handleCreateQuickLesson(theme.id!)}
                                    className="px-2.5 py-1 bg-[#8B0000] text-white font-cinzel font-bold text-xs rounded-lg hover:bg-[#a00000]"
                                  >
                                    Criar
                                  </button>
                                </div>
                              )}

                              {/* LISTA DE AULAS */}
                              {isLoadingLessons ? (
                                <div className="py-4 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C5A059]" /> Carregando aulas...
                                </div>
                              ) : lessons.length > 0 ? (
                                <div className="space-y-1.5">
                                  {lessons.map((lesson, idx) => (
                                    <button
                                      key={lesson.id || idx}
                                      onClick={() => handleSelectTheologyLesson(theme, lesson)}
                                      className="w-full p-2.5 sm:p-3 rounded-xl bg-white/5 hover:bg-[#8B0000]/30 border border-white/10 hover:border-[#C5A059]/50 flex items-center justify-between text-left transition-all group gap-2"
                                    >
                                      <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                                        <div className="w-6 h-6 rounded-lg bg-black/40 flex items-center justify-center text-[10px] font-mono font-bold text-[#C5A059] shrink-0">
                                          {idx + 1}
                                        </div>
                                        <div className="min-w-0">
                                          <span className="text-xs font-bold text-white block group-hover:text-[#F5F5DC] truncate">
                                            {lesson.title}
                                          </span>
                                          <span className="text-[9px] text-gray-400 font-mono block">
                                            {lesson.content ? `${Math.ceil(lesson.content.length / 500)} min de estudo` : 'Pronta'}
                                          </span>
                                        </div>
                                      </div>

                                      <span className="px-2.5 py-1 rounded-lg bg-[#C5A059]/20 group-hover:bg-[#C5A059] text-[#C5A059] group-hover:text-black font-cinzel font-bold text-[9px] uppercase transition-all shadow-sm shrink-0">
                                        Ministrar ➔
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <div className="p-3 rounded-xl bg-black/30 border border-dashed border-white/10 text-center space-y-1.5">
                                  <BookMarked className="w-5 h-5 text-gray-400 mx-auto" />
                                  <p className="text-[11px] text-gray-300 font-cinzel">
                                    Nenhuma lição cadastrada ainda.
                                  </p>
                                  <button
                                    onClick={() => setIsCreatingLessonThemeId(theme.id!)}
                                    className="px-3 py-1.5 rounded-lg bg-[#8B0000] text-white font-cinzel text-[10px] font-bold hover:scale-105 transition-all shadow-md inline-flex items-center gap-1"
                                  >
                                    <Plus className="w-3 h-3" /> Adicionar Primeira Lição
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <GraduationCap className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="font-cinzel text-xs">Nenhuma matéria encontrada.</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">Toque em "+ Matéria" acima para começar.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
