import { useState, useEffect } from 'react';
import { Search, BookOpen, GraduationCap, ShieldCheck, Trophy, Calendar, ListChecks, Mail, Moon, Sun, X, Share, LogOut, Sparkles, Brain, FileText, Link as LinkIcon, Star, MapPin, Monitor, PlusSquare, Instagram, Zap, ZapOff, ClipboardList, ChevronRight } from 'lucide-react';

// Variável global para capturar o evento de instalação fora do ciclo de vida do componente
// Isso evita perder o evento se o usuário navegar para outra tela e voltar
let globalDeferredPrompt: any = null;

if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e) => {
        // Previne o mini-infobar padrão do Chrome no Android
        e.preventDefault();
        // Guarda o evento para ser disparado quando o usuário clicar no botão
        globalDeferredPrompt = e;
        console.log('PWA: Evento beforeinstallprompt capturado globalmente');
    });
}

import { CHURCH_NAME, TOTAL_CHAPTERS, PASTOR_PRESIDENT } from '../../constants';
import { motion, AnimatePresence } from 'framer-motion';
import { AppConfig, DynamicModule } from '../../types';
import { db } from '../../services/database';
import AttendanceManager from '../admin/AttendanceManager';

interface DashboardProps {
    onNavigate: (view: string, params?: any) => void;
    isAdmin: boolean;
    onEnableAdmin: () => void;
    onOpenSearch?: () => void;
    user: any;
    userProgress: any;
    darkMode: boolean;
    toggleDarkMode: () => void;
    onShowToast: (msg: string, type: 'info' | 'success' | 'error') => void;
    onLogout: () => void;
    appConfig: AppConfig | null;
    performanceMode?: boolean;
    togglePerformanceMode?: () => void;
    fontScale?: number;
    onUpdateFontScale?: (delta: number) => void;
}

export default function DashboardHome({ onNavigate, isAdmin, onEnableAdmin, onOpenSearch, user, userProgress, darkMode, toggleDarkMode, onShowToast, onLogout, appConfig, performanceMode, togglePerformanceMode, fontScale, onUpdateFontScale }: DashboardProps) {
  const [clicks, setClicks] = useState(0);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop'>('desktop');
  const [dynamicModules, setDynamicModules] = useState<DynamicModule[]>([]);
  
  // State para o Modal de Frequência
  const [showAttendance, setShowAttendance] = useState(false);

  // Verificação de Permissão da Secretária (Nicole)
  const isSecretary = user?.user_email?.toLowerCase() === 'nicole.santos@adma.local';
  const canManageAttendance = isAdmin || isSecretary;

  useEffect(() => {
    const loadModules = async () => {
        try {
            const modules = await db.entities.DynamicModules.list();
            setDynamicModules(modules);
        } catch(e) {}
    };
    loadModules();
  }, []);

  useEffect(() => {
    const checkStandalone = () => {
        const isStand = window.matchMedia('(display-mode: standalone)').matches || 
                        (window.navigator as any).standalone === true;
        setIsStandalone(isStand);
    };
    checkStandalone();

    // Sincroniza o estado local com o prompt global se ele já existir
    if ((window as any).deferredPrompt) {
        setDeferredPrompt((window as any).deferredPrompt);
    }

    const handleBeforeInstall = (e: any) => {
      e.preventDefault(); 
      setDeferredPrompt(e);
      (window as any).deferredPrompt = e; // Atualiza o global também
      setIsStandalone(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) setPlatform('ios');
    else if (/android/.test(ua)) setPlatform('android');
    else setPlatform('desktop');

    return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    // Prioridade 1: iOS sempre mostra o tutorial (Apple não permite disparo via código)
    if (platform === 'ios') {
        setShowInstallModal(true);
        return;
    }

    // Prioridade 2: Tentar usar o prompt capturado (Android/PC)
    const promptToUse = deferredPrompt || (window as any).deferredPrompt;

    if (promptToUse) {
        try {
            promptToUse.prompt();
            const { outcome } = await promptToUse.userChoice;
            if (outcome === 'accepted') {
                setDeferredPrompt(null);
                (window as any).deferredPrompt = null;
                setIsStandalone(true);
                onShowToast('Instalação iniciada!', 'success');
            }
        } catch (err) {
            console.error('Erro ao disparar instalação:', err);
            setShowInstallModal(true); // Fallback se der erro
        }
    } else {
        // Prioridade 3: Se já está instalado, avisa
        if (isStandalone) {
            onShowToast('O App já está instalado!', 'info');
        } else {
            // Prioridade 4: Se não tem prompt e não é iOS, mostra o tutorial como último recurso
            setShowInstallModal(true);
        }
    }
  };

  const handleLogoClick = () => {
    const newClicks = clicks + 1;
    setClicks(newClicks);
    if (newClicks >= 5) {
        onEnableAdmin();
        setClicks(0);
    }
    setTimeout(() => setClicks(0), 3000);
  };

  const baseMenuItems = [
    { id: 'reader', icon: BookOpen, label: 'Bíblia Sagrada', desc: 'Leitura & Exegese', color: 'from-red-900 to-red-800' },
    { id: 'panorama', icon: GraduationCap, label: 'EBD Panorama', desc: 'Estudos Profundos', color: 'from-blue-900 to-blue-800' },
  ];

  const features = appConfig?.features || { enableDevotional: true, enablePlans: true, enableRanking: true, enableMessages: true };

  if (features.enableDevotional) baseMenuItems.push({ id: 'devotional', icon: Calendar, label: 'Devocional', desc: 'Palavra Diária', color: 'from-purple-900 to-purple-800' });
  if (features.enablePlans) baseMenuItems.push({ id: 'plans', icon: ListChecks, label: 'Planos de Leitura', desc: 'Metas de Leitura', color: 'from-green-900 to-green-800' });
  if (features.enableRanking) baseMenuItems.push({ id: 'ranking', icon: Trophy, label: 'Ranking', desc: 'Conquistas', color: 'from-amber-700 to-amber-600' });
  if (features.enableMessages) baseMenuItems.push({ id: 'messages', icon: Mail, label: 'Mural ADMA', desc: 'cultos e pedidos de oração', color: 'from-pink-800 to-pink-700' });

  const dynamicItems = dynamicModules.map(mod => {
      const IconMap: any = { 'Brain': Brain, 'FileText': FileText, 'Link': LinkIcon, 'Star': Star };
      const Icon = IconMap[mod.iconName] || Star;
      return {
          id: `module_${mod.id}`,
          icon: Icon,
          label: mod.title,
          desc: mod.type === 'quiz' ? 'Desafio Bíblico' : mod.description,
          color: 'from-cyan-700 to-cyan-600',
          module: mod
      };
  });

  const allMenuItems = [...baseMenuItems, ...dynamicItems];
  const progressPercent = userProgress ? Math.min(100, (userProgress.total_chapters / TOTAL_CHAPTERS) * 100) : 0;
  const readCount = userProgress?.total_chapters || 0;
  const primaryColor = appConfig?.theme?.primaryColor || '#8B0000';
  const appName = appConfig?.theme?.appName || 'Bíblia ADMA';
  
  const firstName = user?.user_name ? user.user_name.split(' ')[0] : 'Leitura';

  return (
    <div className="min-h-screen bg-[#FDFBF7] dark:bg-dark-bg transition-colors duration-500 font-sans">
        <AnimatePresence>
            {showInstallModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/90" onClick={() => setShowInstallModal(false)} />
                    <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="bg-white dark:bg-[#1E1E1E] w-full max-w-sm rounded-[40px] p-8 relative z-10 shadow-2xl border border-[#C5A059]/30" >
                        <button onClick={() => setShowInstallModal(false)} className="absolute top-6 right-6 text-gray-400 hover:text-red-500 transition-colors"><X /></button>
                        <div className="text-center mb-8">
                            <div className="relative inline-block mb-4">
                                <div className="absolute inset-0 bg-[#C5A059] blur-2xl opacity-20 animate-pulse"></div>
                                <div className="relative w-20 h-20 bg-gradient-to-br from-[#8B0000] to-[#500000] rounded-3xl mx-auto flex items-center justify-center shadow-xl border border-[#C5A059]/30">
                                    <BookOpen className="w-10 h-10 text-[#F5F5DC]" />
                                </div>
                            </div>
                            <h3 className="font-cinzel font-bold text-2xl text-[#1a0f0f] dark:text-white">Instalar Bíblia ADMA</h3>
                        </div>
                        <div className="space-y-6">
                            {platform === 'ios' ? (
                                <div className="space-y-5">
                                    <div className="flex items-center gap-4 bg-gray-50 dark:bg-black/20 p-4 rounded-2xl">
                                        <div className="w-10 h-10 bg-white dark:bg-gray-800 rounded-xl flex items-center justify-center shadow-sm">
                                            <Share className="w-5 h-5 text-blue-500" />
                                        </div>
                                        <p className="text-sm font-medium dark:text-gray-200">1. Toque no botão <span className="font-bold">Compartilhar</span>.</p>
                                    </div>
                                    <div className="flex items-center gap-4 bg-gray-50 dark:bg-black/20 p-4 rounded-2xl">
                                        <div className="w-10 h-10 bg-white dark:bg-gray-800 rounded-xl flex items-center justify-center shadow-sm">
                                            <PlusSquare className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                                        </div>
                                        <p className="text-sm font-medium dark:text-gray-200">2. Toque em <span className="font-bold">"Adicionar à Tela de Início"</span>.</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center p-4 bg-gray-50 dark:bg-black/20 rounded-2xl">
                                    <Monitor className="w-8 h-8 mx-auto mb-3 text-[#C5A059]" />
                                    <p className="text-sm font-medium dark:text-gray-200">Clique no ícone de instalar na barra de endereços do navegador.</p>
                                </div>
                            )}
                        </div>
                        <button onClick={() => setShowInstallModal(false)} className="w-full mt-8 bg-[#1a0f0f] dark:bg-white dark:text-black text-white font-cinzel font-bold py-4 rounded-2xl text-sm tracking-widest shadow-lg">ENTENDI</button>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
        
        {/* MODAL DE CHAMADA (SECRETARIA) */}
        {showAttendance && canManageAttendance && (
            <AttendanceManager 
                onClose={() => setShowAttendance(false)} 
                isAdmin={isAdmin}
                onShowToast={onShowToast}
            />
        )}

        <div className="relative bg-[#0F0505] text-white pb-28 rounded-b-[40px] shadow-2xl overflow-hidden isolate">
             <div className="absolute inset-0 z-0" style={{ background: `linear-gradient(to bottom, ${primaryColor}, #150505)` }}></div>
             <div className="relative z-20 px-6 pt-10 flex justify-between items-center">
                {(!isStandalone) && (
                    <motion.button 
                        initial={{ x: -20, opacity: 0 }} 
                        animate={{ x: 0, opacity: 1 }}
                        onClick={handleInstallClick} 
                        className="group flex items-center gap-3 bg-white/20 border border-white/20 pl-1.5 pr-5 py-1.5 rounded-full transition-all active:scale-95"
                    >
                        <div className="w-8 h-8 bg-gradient-to-br from-[#C5A059] to-[#9e8045] rounded-full flex items-center justify-center shadow-lg">
                            <PlusSquare className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-tighter leading-none">Instalar App</span>
                    </motion.button>
                )}

                <div className={`flex gap-3 ml-auto items-center`}>
                    {onUpdateFontScale && (
                        <div className="flex items-center gap-1 bg-white/10 rounded-full p-1 border border-white/10 mr-2">
                            <button onClick={() => onUpdateFontScale(-5)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-white font-bold text-xs" title="Diminuir Texto">A-</button>
                            <span className="text-[10px] text-white/50 font-mono hidden md:block">{fontScale}%</span>
                            <button onClick={() => onUpdateFontScale(5)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-white font-bold text-xs" title="Aumentar Texto">A+</button>
                        </div>
                    )}

                    {togglePerformanceMode && (
                        <button 
                            onClick={togglePerformanceMode} 
                            className={`p-2.5 rounded-full border transition-colors ${performanceMode ? 'bg-[#C5A059] border-[#C5A059] text-black shadow-lg shadow-[#C5A059]/30' : 'bg-white/10 border-white/10 hover:bg-white/20'}`}
                            title={performanceMode ? "Desativar Modo Desempenho (Lite)" : "Ativar Modo Desempenho (Lite)"}
                        >
                            {performanceMode ? <Zap className="w-4 h-4 fill-current" /> : <ZapOff className="w-4 h-4" />}
                        </button>
                    )}
                    <button onClick={toggleDarkMode} className="p-2.5 rounded-full bg-white/10 border border-white/10 hover:bg-white/20 transition-colors">{darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}</button>
                    <button onClick={onLogout} className="p-2.5 rounded-full bg-white/10 border border-white/10 hover:bg-red-500/20 transition-colors"><LogOut className="w-4 h-4" /></button>
                </div>
            </div>

            <div className="relative z-10 px-6 pt-8 flex flex-col items-center justify-center text-center space-y-5">
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                    <h3 className="font-montserrat text-[8px] font-medium tracking-[0.5em] text-white/40 uppercase">{CHURCH_NAME}</h3>
                </motion.div>

                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative group cursor-pointer my-1" onClick={handleLogoClick}>
                    <div className="absolute inset-0 bg-[#C5A059] blur-[60px] opacity-15 rounded-full animate-pulse"></div>
                    <div className="relative w-24 h-24 bg-gradient-to-br from-white/10 to-transparent rounded-[32px] border border-white/20 shadow-2xl flex items-center justify-center backdrop-blur-sm">
                        <BookOpen className="w-10 h-10 text-[#C5A059]" />
                    </div>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                    <h1 className="font-cinzel text-5xl md:text-6xl font-black text-white tracking-tighter drop-shadow-2xl">{appName}</h1>
                    <div className="flex flex-col items-center">
                        <p className="font-cormorant text-lg text-[#C5A059] italic font-semibold opacity-90 tracking-wide">Prof. Michel Felix</p>
                        <div className="h-[1px] w-12 bg-[#C5A059]/30 my-2"></div>
                        <p className="font-cinzel text-[8px] uppercase tracking-[0.3em] text-white/40 font-bold">Presidente: {PASTOR_PRESIDENT}</p>
                    </div>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex flex-wrap justify-center gap-3 px-4">
                    <a href="https://www.instagram.com/adma.vilardosteles/" target="_blank" rel="noopener noreferrer" className="px-5 py-2 rounded-xl border border-white/10 bg-white/5 text-white/80 font-cinzel text-[9px] font-bold flex items-center gap-2 hover:bg-white/10 transition-all backdrop-blur-md active:scale-95">
                        <Instagram className="w-3.5 h-3.5 text-[#C5A059]" /> <span>Instagram</span>
                    </a>
                    <a href="https://maps.app.goo.gl/cyZBbWNGFaAjEm2aA" target="_blank" rel="noopener noreferrer" className="px-5 py-2 rounded-xl border border-white/10 bg-white/5 text-white/80 font-cinzel text-[9px] font-bold flex items-center gap-2 hover:bg-white/10 transition-all backdrop-blur-md active:scale-95">
                        <MapPin className="w-3.5 h-3.5 text-[#C5A059]" /> <span>Localização</span>
                    </a>
                </motion.div>
            </div>
        </div>

        <div className="px-6 -mt-16 relative z-30 mb-8 space-y-4">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white dark:bg-[#1A1A1A] p-6 rounded-[32px] border border-gray-100 dark:border-white/5 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#C5A059]/5 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-[#C5A059]/10 transition-colors"></div>
                <div className="flex justify-between items-end mb-4 relative z-10">
                    <div className="flex flex-col">
                        <span className="font-montserrat text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5"><Sparkles className="w-3 h-3 text-[#C5A059]" /> Progresso de Leitura</span>
                        <span className="font-cinzel font-black text-2xl text-[#1a0f0f] dark:text-[#C5A059] tracking-tight">Progresso de {firstName}</span>
                        <span className="text-[10px] font-bold text-gray-400 mt-1 font-mono tracking-tighter">{readCount} / {TOTAL_CHAPTERS} capítulos lidos</span>
                    </div>
                    <div className="flex items-baseline gap-0.5">
                        <span className="font-montserrat font-black text-5xl dark:text-white tracking-tighter">{progressPercent.toFixed(0)}</span>
                        <span className="text-xs text-[#C5A059] font-black">%</span>
                    </div>
                </div>
                <div className="w-full bg-gray-100 dark:bg-black/40 rounded-full h-2.5 mb-1 p-[2px] border border-gray-200/50 dark:border-white/5">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${progressPercent}%` }} className="h-full rounded-full shadow-[0_0_10px_rgba(197,160,89,0.3)]" style={{ background: `linear-gradient(to right, ${primaryColor}, #C5A059)` }}></motion.div>
                </div>
            </motion.div>

            {/* BUSCADOR ADMA - STANDALONE FULL WIDTH */}
            {onOpenSearch && (
                <motion.button 
                    initial={{ opacity: 0, y: 20 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    transition={{ delay: 0.1 }}
                    onClick={onOpenSearch}
                    className="w-full bg-white dark:bg-[#1A1A1A] p-6 rounded-[32px] border border-gray-100 dark:border-white/5 shadow-2xl flex items-center gap-5 group active:scale-[0.98] transition-all overflow-hidden relative"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-[#C5A059]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div className="w-16 h-16 rounded-[20px] flex items-center justify-center text-white shadow-xl group-hover:scale-105 transition-all duration-500 relative z-10" style={{ background: `linear-gradient(135deg, ${primaryColor}, #500000)` }}>
                        <Search className="w-8 h-8" />
                        <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-[20px]"></div>
                    </div>
                    <div className="text-left relative z-10 flex-1">
                        <span className="font-cinzel font-black text-[#1a0f0f] dark:text-white text-xl block tracking-tight leading-tight">Buscador ADMA</span>
                        <span className="font-montserrat text-[9px] text-gray-400 font-black uppercase tracking-[0.15em] mt-1 block opacity-60">Temas, Versículos e Referências</span>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-white/5 flex items-center justify-center group-hover:bg-[#C5A059] group-hover:text-white transition-all duration-300">
                        <ChevronRight className="w-5 h-5 text-[#C5A059] group-hover:text-white" />
                    </div>
                </motion.button>
            )}
        </div>

        <div className="px-6 pb-32 grid grid-cols-2 gap-4">
            {allMenuItems.map((item, idx) => {
                // LÓGICA INTELIGENTE: Botão 'Bíblia Sagrada' verifica histórico para "Continuar Leitura"
                const handleItemClick = () => {
                    if (item.id === 'reader' && userProgress?.last_book && userProgress?.last_chapter) {
                        onNavigate('reader', { book: userProgress.last_book, chapter: userProgress.last_chapter });
                    } else {
                        onNavigate(item.id, { module: (item as any).module });
                    }
                };

                return (
                    <motion.button 
                        key={item.id} 
                        initial={{ opacity: 0, y: 20 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        transition={{ delay: 0.05 * idx }} 
                        onClick={handleItemClick} 
                        className="bg-white dark:bg-[#1A1A1A] p-6 rounded-[28px] text-left h-44 flex flex-col justify-between border border-gray-100 dark:border-white/5 shadow-xl hover:shadow-2xl transition-all active:scale-[0.96] group relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center text-white mb-2 shadow-lg group-hover:scale-110 transition-all duration-500`}>
                            <item.icon className="w-7 h-7" />
                        </div>
                        <div>
                            <span className="font-cinzel font-black text-[#1a0f0f] dark:text-gray-100 text-lg block mb-1 tracking-tight leading-tight">{item.label}</span>
                            <span className="font-montserrat text-[9px] text-gray-400 font-black uppercase tracking-wider block opacity-60">
                                {item.id === 'reader' && userProgress?.last_book 
                                    ? `Continuar: ${userProgress.last_book} ${userProgress.last_chapter}` 
                                    : item.desc}
                            </span>
                        </div>
                    </motion.button>
                );
            })}
            
            {/* BOTÃO EXCLUSIVO DA SECRETARIA/ADMIN */}
            {canManageAttendance && (
                <motion.button 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onClick={() => setShowAttendance(true)} 
                    className="col-span-2 bg-[#1a0f0f] dark:bg-black text-[#C5A059] p-5 rounded-3xl flex items-center justify-center gap-4 border border-[#C5A059]/30 hover:bg-black transition-colors shadow-lg active:scale-95 group"
                >
                    <div className="p-2 bg-[#C5A059]/20 rounded-full group-hover:bg-[#C5A059]/30 transition">
                        <ClipboardList className="w-6 h-6" />
                    </div>
                    <div className="text-left">
                        <span className="font-cinzel font-bold block text-sm">Secretaria EBD</span>
                        <span className="text-[10px] opacity-60 uppercase">Chamada & Frequência</span>
                    </div>
                </motion.button>
            )}

            {isAdmin && (
                <button onClick={() => onNavigate('admin')} className="col-span-2 bg-[#1a0f0f] dark:bg-black text-[#C5A059] p-5 rounded-3xl flex items-center justify-center gap-4 border border-[#C5A059]/30 hover:bg-black transition-colors shadow-lg active:scale-95">
                    <ShieldCheck className="w-6 h-6" />
                    <div className="text-left">
                        <span className="font-cinzel font-bold block text-sm">Painel Editor Chefe</span>
                        <span className="text-[10px] opacity-60 uppercase">Builder & Config</span>
                    </div>
                </button>
            )}
        </div>
    </div>
  );
}
