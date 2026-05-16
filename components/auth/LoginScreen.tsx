import React, { useState } from 'react';
import { BookOpen, Loader2, ShieldCheck, Sparkles, User, Lock, ArrowRight, UserPlus, LogIn, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CHURCH_NAME, PASTOR_PRESIDENT } from '../../constants';
import PrivacyPolicyModal from '../modals/PrivacyPolicyModal';

interface LoginScreenProps {
  onLogin: (firstName: string, lastName: string, password: string, isRegister: boolean) => Promise<string | void>;
  loading: boolean;
}

export default function LoginScreen({ onLogin, loading }: LoginScreenProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setErrorMsg('');

      if (!firstName.trim() || !lastName.trim() || !password.trim()) {
          setErrorMsg("Por favor, preencha todos os campos.");
          return;
      }

      if (isRegistering && !acceptedTerms) {
          setErrorMsg("Você precisa aceitar os termos de privacidade para continuar.");
          return;
      }

      if (password.length < 4) {
          setErrorMsg("A senha deve ter pelo menos 4 caracteres.");
          return;
      }

      // Aguarda a resposta da autenticação (que pode retornar uma string de erro)
      const error = await onLogin(firstName.trim(), lastName.trim(), password.trim(), isRegistering);
      
      if (error && typeof error === 'string') {
          setErrorMsg(error);
      }
  };

  return (
    <div className="min-h-screen bg-[#F5F5DC] dark:bg-[#121212] flex items-center justify-center p-6 transition-colors duration-500 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed">
      <div className="w-full max-w-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="bg-white/80 dark:bg-[#1E1E1E]/90 backdrop-blur-xl rounded-[32px] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] p-8 md:p-10 border border-white/50 dark:border-white/5 relative overflow-hidden"
        >
          {/* Decorative Gradient Line */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#8B0000] via-[#C5A059] to-[#8B0000]" />
          
          <div className="text-center mb-8">
            <motion.div 
                initial={{ rotate: -5, scale: 0.9 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ duration: 0.8, type: "spring" }}
                className="w-20 h-20 bg-gradient-to-br from-[#8B0000] to-[#500000] rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg shadow-red-900/30"
            >
              <BookOpen className="w-10 h-10 text-[#F5F5DC]" />
            </motion.div>
            
            <h1 className="font-cinzel text-2xl font-bold text-[#1a0f0f] dark:text-white mb-1 tracking-tight flex items-center justify-center gap-2">
                Bíblia ADMA <Sparkles className="w-4 h-4 text-[#C5A059]" />
            </h1>
            <p className="font-cormorant text-[#1a0f0f]/70 dark:text-white/70 text-sm italic tracking-wide">Prof. Michel Felix</p>
          </div>

          {/* Toggle Login/Register */}
          <div className="flex bg-gray-100 dark:bg-black/40 p-1 rounded-xl mb-6 relative">
              <button 
                onClick={() => { setIsRegistering(false); setErrorMsg(''); }}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all z-10 ${!isRegistering ? 'bg-white dark:bg-[#8B0000] text-black dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
              >
                  Entrar
              </button>
              <button 
                onClick={() => { setIsRegistering(true); setErrorMsg(''); }}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all z-10 ${isRegistering ? 'bg-white dark:bg-[#8B0000] text-black dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
              >
                  Criar Conta
              </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-3">
                  <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input 
                          type="text" 
                          placeholder="Nome"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          className="w-full pl-12 pr-4 py-3.5 bg-gray-50 dark:bg-black/30 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-[#C5A059] dark:text-white font-montserrat transition-all placeholder:text-gray-400 text-sm"
                          disabled={loading}
                      />
                  </div>
                  <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input 
                          type="text" 
                          placeholder="Sobrenome"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          className="w-full pl-12 pr-4 py-3.5 bg-gray-50 dark:bg-black/30 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-[#C5A059] dark:text-white font-montserrat transition-all placeholder:text-gray-400 text-sm"
                          disabled={loading}
                      />
                  </div>
                  <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input 
                          type="password" 
                          placeholder={isRegistering ? "Crie sua Senha" : "Sua Senha"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full pl-12 pr-4 py-3.5 bg-gray-50 dark:bg-black/30 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-[#C5A059] dark:text-white font-montserrat transition-all placeholder:text-gray-400 text-sm"
                          disabled={loading}
                      />
                  </div>
              </div>

              <AnimatePresence>
                {isRegistering && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-4"
                  >
                    <div className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-black/20 rounded-2xl border border-gray-100 dark:border-white/5">
                        <label className="relative flex items-center cursor-pointer">
                            <input 
                              type="checkbox" 
                              className="sr-only peer"
                              checked={acceptedTerms}
                              onChange={(e) => setAcceptedTerms(e.target.checked)}
                            />
                            <div className="w-5 h-5 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-md peer-checked:bg-[#8B0000] peer-checked:border-[#8B0000] transition-all flex items-center justify-center">
                                {acceptedTerms && <div className="w-2 h-2 bg-white rounded-full"></div>}
                            </div>
                        </label>
                        <div className="flex-1">
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium leading-relaxed">
                                Concordo em fornecer meu nome e progresso para sincronização com a nuvem ADMA, conforme a <button type="button" onClick={() => setShowPrivacy(true)} className="text-[#8B0000] dark:text-[#C5A059] font-bold underline decoration-dotted underline-offset-4 flex inline-items items-center gap-1">LGPD <ExternalLink className="w-2.5 h-2.5" /></button>
                            </p>
                        </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {errorMsg && (
                  <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-center shadow-inner"
                  >
                      <p className="text-red-600 dark:text-red-300 text-xs font-bold flex items-center justify-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                          {errorMsg}
                      </p>
                  </motion.div>
              )}

              <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#8B0000] text-white font-bold py-4 rounded-xl shadow-lg shadow-red-900/20 hover:bg-[#6b0000] hover:scale-[1.02] transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:scale-100"
              >
                  {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                      <>
                          <span className="font-cinzel text-sm tracking-widest uppercase">
                              {isRegistering ? 'Registrar Agora' : 'Acessar Sistema'}
                          </span>
                          {isRegistering ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                      </>
                  )}
              </button>
          </form>

          <div className="mt-8 text-center border-t border-gray-200 dark:border-white/10 pt-4">
              <div className="flex items-center justify-center gap-2 text-[10px] text-gray-400 uppercase tracking-widest opacity-60 font-montserrat mb-2">
                  <ShieldCheck className="w-3 h-3 text-[#C5A059]" /> Ambiente Seguro | <button onClick={() => setShowPrivacy(true)} className="hover:text-[#C5A059] transition-colors">Privacidade</button>
              </div>
              <p className="text-[10px] text-gray-400 font-montserrat uppercase tracking-wider">{CHURCH_NAME}</p>
              <p className="text-[9px] text-[#8B0000] dark:text-[#C5A059] font-bold mt-1">{PASTOR_PRESIDENT}</p>
          </div>

          <PrivacyPolicyModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />

        </motion.div>
      </div>
    </div>
  );
}
