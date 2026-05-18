import React, { useState, useEffect, useCallback } from 'react';
import { MotionConfig } from 'framer-motion';
import LoginScreen from './components/auth/LoginScreen';
import DashboardHome from './components/dashboard/DashboardHome';
import BibleReader from './components/bible/BibleReader';
import AdminPanel from './components/admin/AdminPanel';
import PanoramaView from './components/panorama/PanoramaView';
import DevotionalView from './components/devotional/DevotionalView';
import PlansView from './components/plans/PlansView';
import RankingView from './components/ranking/RankingView';
import MessagesView from './components/messages/MessagesView';
import DynamicModuleViewer from './components/dynamic/DynamicModuleViewer';
import BibleSearch from './components/bible/BibleSearch';
import AdminPasswordModal from './components/modals/AdminPasswordModal';
import Toast from './components/ui/Toast';
import NetworkStatus from './components/ui/NetworkStatus';
import { db, syncManager } from './services/database';
import { AppConfig, DynamicModule } from './types';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [userProgress, setUserProgress] = useState<any>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [performanceMode, setPerformanceMode] = useState(false); // Novo Estado para Modo Lite
  const [fontScale, setFontScale] = useState(100); // Estado para Zoom (Escala)
  
  const [view, setView] = useState('dashboard');
  
  // Sincronização com o botão de voltar do Hardware/Navegador
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const state = event.state;
      if (state) {
        setView(state.view || 'dashboard');
        setNavParams(state.params || {});
        if (state.activeModule) setActiveModule(state.activeModule);
      } else {
        // Se não houver estado (primeira página), voltamos ao dashboard
        setView('dashboard');
        setNavParams({});
      }
    };

    window.addEventListener('popstate', handlePopState);
    
    // Define o estado inicial se estiver autenticado para que possamos voltar para cá
    if (isAuthenticated) {
        window.history.replaceState({ view: 'dashboard', params: {} }, "");
    }

    return () => window.removeEventListener('popstate', handlePopState);
  }, [isAuthenticated]);

  const [toast, setToast] = useState({ msg: '', type: 'info' as any });
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [navParams, setNavParams] = useState<any>({});

  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [activeModule, setActiveModule] = useState<DynamicModule | null>(null);

  useEffect(() => {
    const loadConfig = async () => {
        try {
            const configs = await db.entities.AppConfig.list();
            const cfg = configs[0];
            if (cfg) {
                setAppConfig(cfg);
                if (cfg.theme) {
                    if (cfg.theme.primaryColor) document.documentElement.style.setProperty('--primary-color', cfg.theme.primaryColor);
                    if (cfg.theme.secondaryColor) document.documentElement.style.setProperty('--secondary-color', cfg.theme.secondaryColor);
                }
            }
        } catch(e) {
            console.error("Erro ao carregar configurações", e);
        }
    };
    loadConfig();

    const saved = localStorage.getItem('adma_user');
    if (saved) {
        const u = JSON.parse(saved);
        setUser(u);
        setIsAuthenticated(true);
        loadProgress(u.user_email, u.user_name);
    }
    
    const isDark = localStorage.getItem('adma_dark_mode') === 'true' || 
                 (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setDarkMode(isDark);

    // Carregar preferência de Performance
    const isPerf = localStorage.getItem('adma_perf_mode') === 'true';
    setPerformanceMode(isPerf);

    // Carregar preferência de Escala (Zoom)
    const savedScale = localStorage.getItem('adma_font_scale');
    if (savedScale) {
        const s = parseInt(savedScale);
        setFontScale(s);
        document.documentElement.style.fontSize = `${s}%`;
    }

    // Processar fila de sincronização quando voltar a ficar online
    const handleOnline = () => {
        syncManager.processQueue();
    };
    window.addEventListener('online', handleOnline);

    // Tenta processar a fila ao iniciar o app
    syncManager.processQueue();

    return () => {
        window.removeEventListener('online', handleOnline);
    };
  }, []);

  useEffect(() => {
      if (darkMode) {
          document.documentElement.classList.add('dark');
          localStorage.setItem('adma_dark_mode', 'true');
      } else {
          document.documentElement.classList.remove('dark');
          localStorage.setItem('adma_dark_mode', 'false');
      }
  }, [darkMode]);

  // Efeito para aplicar classe de Performance no Body
  useEffect(() => {
      if (performanceMode) {
          document.body.classList.add('perf-mode');
          localStorage.setItem('adma_perf_mode', 'true');
      } else {
          document.body.classList.remove('perf-mode');
          localStorage.setItem('adma_perf_mode', 'false');
      }
  }, [performanceMode]);

  // Função para alterar escala da fonte (Zoom)
  const updateFontScale = (delta: number) => {
      // Limita entre 85% e 110% para não quebrar totalmente o layout
      const newScale = Math.min(110, Math.max(85, fontScale + delta));
      setFontScale(newScale);
      localStorage.setItem('adma_font_scale', newScale.toString());
      document.documentElement.style.fontSize = `${newScale}%`;
  };

  const loadProgress = async (email: string, nameFallback?: string) => {
    try {
        const profiles = await db.entities.ReadingProgress.filter({ user_email: email });
        
        if (profiles && profiles.length > 0) {
            // Se houver múltiplos perfis, fazemos o merge para garantir que nenhum progresso seja perdido
            let mergedProfile = { ...profiles[0] };

            if (profiles.length > 1) {
                const chaptersSet = new Set(mergedProfile.chapters_read || []);
                const ebdSet = new Set(mergedProfile.ebd_read || []);
                const thematicSet = new Set(mergedProfile.thematic_read || []);
                const quizzesTakenSet = new Set(mergedProfile.quizzes_taken || []);
                let maxQuizPoints = mergedProfile.quiz_points || 0;
                let latestName = mergedProfile.user_name;
                let latestDate = new Date(mergedProfile.updated_at || mergedProfile.created_at || 0).getTime();

                for (let i = 1; i < profiles.length; i++) {
                    const p = profiles[i];
                    (p.chapters_read || []).forEach((c: string) => chaptersSet.add(c));
                    (p.ebd_read || []).forEach((e: string) => ebdSet.add(e));
                    (p.thematic_read || []).forEach((t: string) => thematicSet.add(t));
                    (p.quizzes_taken || []).forEach((q: string) => quizzesTakenSet.add(q));
                    
                    if ((p.quiz_points || 0) > maxQuizPoints) maxQuizPoints = p.quiz_points;
                    
                    const pDate = new Date(p.updated_at || p.created_at || 0).getTime();
                    if (pDate > latestDate) {
                        latestDate = pDate;
                        latestName = p.user_name;
                    }
                }

                mergedProfile.chapters_read = Array.from(chaptersSet);
                mergedProfile.total_chapters = mergedProfile.chapters_read.length;
                mergedProfile.ebd_read = Array.from(ebdSet);
                mergedProfile.total_ebd_read = mergedProfile.ebd_read.length;
                mergedProfile.thematic_read = Array.from(thematicSet);
                mergedProfile.total_thematic_read = mergedProfile.thematic_read.length;
                mergedProfile.quizzes_taken = Array.from(quizzesTakenSet);
                mergedProfile.quiz_points = maxQuizPoints;
                mergedProfile.user_name = latestName;
                
                // Salva o perfil consolidado de volta na nuvem para limpar a bagunça
                await db.entities.ReadingProgress.update(mergedProfile.id, mergedProfile);
            } else {
                // Mesmo com um perfil só, garante que os totais estejam sincronizados com os arrays
                let needsUpdate = false;
                const updates: any = {};

                const realChapterCount = mergedProfile.chapters_read ? mergedProfile.chapters_read.length : 0;
                if (realChapterCount !== (mergedProfile.total_chapters || 0)) {
                    mergedProfile.total_chapters = realChapterCount;
                    updates.total_chapters = realChapterCount;
                    needsUpdate = true;
                }

                const realEbdCount = mergedProfile.ebd_read ? mergedProfile.ebd_read.length : 0;
                if (realEbdCount !== (mergedProfile.total_ebd_read || 0)) {
                    mergedProfile.total_ebd_read = realEbdCount;
                    updates.total_ebd_read = realEbdCount;
                    needsUpdate = true;
                }

                const realThematicCount = mergedProfile.thematic_read ? mergedProfile.thematic_read.length : 0;
                if (realThematicCount !== (mergedProfile.total_thematic_read || 0)) {
                    mergedProfile.total_thematic_read = realThematicCount;
                    updates.total_thematic_read = realThematicCount;
                    needsUpdate = true;
                }

                if (needsUpdate) {
                    await db.entities.ReadingProgress.update(mergedProfile.id, updates);
                }
            }

            setUserProgress(mergedProfile);
            
            // Ativa Admin se o perfil no banco tiver a role correspondente
            if (mergedProfile.role === 'admin') {
                setIsAdmin(true);
            }
        } else {
            const displayName = nameFallback || user?.user_name || email;
            const newP = await db.entities.ReadingProgress.create({ 
                user_email: email, 
                user_name: displayName, 
                chapters_read: [], 
                total_chapters: 0,
                active_plans: [],
                ebd_read: [],
                total_ebd_read: 0
            });
            setUserProgress(newP);
        }
    } catch (e) {
        console.error("Erro ao carregar progresso", e);
    }
  };

  const handleLogin = async (first: string, last: string, password: string, isRegister: boolean): Promise<string | void> => {
    if (first === "Visitante" && last === "Preview") {
        const visitorName = "Visitante Preview";
        const visitorEmail = "visitante.preview@adma.local";
        
        const visitorProfile: any = {
            id: 'local_visitor_id',
            user_email: visitorEmail,
            user_name: visitorName,
            chapters_read: [],
            total_chapters: 0,
            active_plans: [],
            ebd_read: [],
            total_ebd_read: 0,
            is_blocked: false
        };

        setUserProgress(visitorProfile);
        setUser({ user_name: visitorName, user_email: visitorEmail });
        setIsAuthenticated(true);
        return;
    }

    const fullName = `${first} ${last}`;
    const email = `${first.toLowerCase()}.${last.toLowerCase()}@adma.local`;

    try {
        const users = await db.entities.ReadingProgress.filter({ user_email: email });
        
        if (users && users.length > 0) {
             users.sort((a: any, b: any) => {
                const lenA = a.chapters_read ? a.chapters_read.length : 0;
                const lenB = b.chapters_read ? b.chapters_read.length : 0;
                return lenB - lenA;
            });
        }
        
        const existingUser = users.length > 0 ? users[0] : null;

        if (isRegister) {
            if (existingUser) {
                return "Usuário já existe com este nome. Tente entrar.";
            }
            
            const newUser = await db.entities.ReadingProgress.create({ 
                user_email: email, 
                user_name: fullName, 
                password_pin: password,
                chapters_read: [], 
                total_chapters: 0,
                active_plans: [],
                ebd_read: [],
                total_ebd_read: 0,
                role: 'user'
            });
            setUserProgress(newUser);
        } else {
            if (!existingUser) {
                return "Usuário não encontrado. Crie uma conta.";
            }

            if (existingUser.is_blocked) {
                return "Conta bloqueada. Contate a administração.";
            }

            if (existingUser.password_pin && existingUser.password_pin !== password) {
                return "Senha incorreta.";
            }

            const realCount = existingUser.chapters_read ? existingUser.chapters_read.length : 0;
            if (realCount > (existingUser.total_chapters || 0)) {
                 existingUser.total_chapters = realCount;
                 await db.entities.ReadingProgress.update(existingUser.id, { total_chapters: realCount });
            }

            setUserProgress(existingUser);
            if (existingUser.role === 'admin') {
                setIsAdmin(true);
            }
        }

        const u = { user_name: fullName, user_email: email };
        localStorage.setItem('adma_user', JSON.stringify(u));
        setUser(u);
        setIsAuthenticated(true);

    } catch (e) {
        console.error("Login Error", e);
        return "Erro ao conectar. Verifique sua rede.";
    }
  };

  const handleLogout = () => {
      if(window.confirm("Deseja realmente sair e trocar de usuário?")) {
          localStorage.removeItem('adma_user');
          setUser(null);
          setUserProgress(null);
          setIsAuthenticated(false);
          setIsAdmin(false);
          setView('dashboard');
      }
  };

  const showToast = useCallback((msg: string, type: 'success'|'error'|'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'info' }), 5000);
  }, []);

  const handleAdminSuccess = useCallback(() => {
    setIsAdmin(true);
    setShowAdminModal(false);
    showToast('Modo Admin Ativado!', 'success');
  }, [showToast]);

  const toggleDarkMode = useCallback(() => setDarkMode(prev => !prev), []);
  
  // Função para alternar o modo desempenho
  const togglePerformanceMode = useCallback(() => {
      setPerformanceMode(prev => {
          const newState = !prev;
          showToast(newState ? "Modo Desempenho (Lite) Ativado!" : "Modo Visual Completo Ativado!", "info");
          return newState;
      });
  }, [showToast]);

  const handleNavigate = useCallback((v: string, params?: any) => {
      if (v.startsWith('module_')) {
          if (params && params.module) {
              const state = { view: 'dynamic_module', params: params || {}, activeModule: params.module };
              setActiveModule(params.module);
              setView('dynamic_module');
              window.history.pushState(state, "");
          }
          return;
      }
      
      const state = { view: v, params: params || {} };
      setView(v);
      if(params) setNavParams(params);
      window.history.pushState(state, "");
      window.scrollTo(0, 0);
  }, []);

  if (!isAuthenticated) return <LoginScreen onLogin={handleLogin} loading={false} />;

  const renderView = () => {
    switch(view) {
        case 'dashboard':
            return <DashboardHome 
                onNavigate={handleNavigate} 
                isAdmin={isAdmin} 
                onEnableAdmin={() => setShowAdminModal(true)}
                onOpenSearch={() => setShowSearch(true)}
                user={user}
                userProgress={userProgress}
                darkMode={darkMode}
                toggleDarkMode={toggleDarkMode}
                onShowToast={showToast}
                onLogout={handleLogout}
                appConfig={appConfig}
                performanceMode={performanceMode} // Passando prop
                togglePerformanceMode={togglePerformanceMode} // Passando função
                fontScale={fontScale} // Passando estado zoom
                onUpdateFontScale={updateFontScale} // Passando função zoom
            />;
        case 'reader':
            return <BibleReader 
                onBack={() => handleNavigate('dashboard')} 
                onNavigate={handleNavigate}
                isAdmin={isAdmin}
                onShowToast={showToast}
                initialBook={navParams.book}
                initialChapter={navParams.chapter}
                initialVerse={navParams.verse}
                userProgress={userProgress}
                onProgressUpdate={setUserProgress}
            />;
        case 'admin':
            return <AdminPanel onBack={() => handleNavigate('dashboard')} onShowToast={showToast} />;
        case 'panorama':
            return <PanoramaView 
                onBack={() => handleNavigate('dashboard')} 
                onNavigate={handleNavigate}
                isAdmin={isAdmin} 
                onShowToast={showToast}
                userProgress={userProgress} 
                onProgressUpdate={setUserProgress} 
                initialBook={navParams.book}
                initialChapter={navParams.chapter}
            />;
        case 'devotional':
            return <DevotionalView onBack={() => handleNavigate('dashboard')} onNavigate={handleNavigate} onShowToast={showToast} isAdmin={isAdmin} />;
        case 'plans':
            return <PlansView 
                onBack={() => handleNavigate('dashboard')} 
                onNavigate={handleNavigate} 
                userProgress={userProgress} 
                onProgressUpdate={setUserProgress} 
                onShowToast={showToast}
            />;
        case 'ranking':
            return <RankingView onBack={() => handleNavigate('dashboard')} userProgress={userProgress} />;
        case 'messages':
            return <MessagesView onBack={() => handleNavigate('dashboard')} isAdmin={isAdmin} user={user} />;
        case 'dynamic_module':
            return activeModule ? <DynamicModuleViewer module={activeModule} onBack={() => handleNavigate('dashboard')} /> : <div className="p-10 text-center">Módulo não encontrado</div>;
        default:
            return <div className="dark:text-white p-10 text-center font-cinzel">Página em Construção</div>;
    }
  };

  return (
    <MotionConfig reducedMotion={performanceMode ? "always" : "user"}>
      <div className="font-sans text-gray-900 dark:text-gray-100 min-h-screen bg-background dark:bg-dark-bg transition-colors duration-300 flex flex-col">
          <div className="flex-1">
              {renderView()}
          </div>
          
          <AdminPasswordModal 
            isOpen={showAdminModal} 
            onClose={() => setShowAdminModal(false)} 
            onSuccess={handleAdminSuccess} 
            userRole={userProgress?.role}
          />
          <BibleSearch isOpen={showSearch} onClose={() => setShowSearch(false)} onNavigate={handleNavigate} />
          <NetworkStatus />
          {toast.msg && <Toast message={toast.msg} type={toast.type} onClose={() => setToast({ ...toast, msg: '' })} />}
      </div>
    </MotionConfig>
  );
}
