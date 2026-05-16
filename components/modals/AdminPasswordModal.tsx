import React, { useState, useEffect } from 'react';
import { Lock, X, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AdminPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userRole?: string;
}

export default function AdminPasswordModal({ isOpen, onClose, onSuccess, userRole }: AdminPasswordModalProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    if (isOpen && userRole === 'admin') {
      setIsAuthorized(true);
      // Se já é admin no banco, libera automaticamente sem senha exposta
      const timer = setTimeout(() => {
        onSuccess();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isOpen, userRole, onSuccess]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // A senha agora não é tratada no código para evitar exposição.
    // O acesso é baseado estritamente na role do Supabase.
    setError(true);
    setTimeout(() => setError(false), 2000);
  };

  if (userRole === 'admin') {
    return (
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
             <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
              />
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-white dark:bg-[#1A1A1A] p-8 rounded-[32px] shadow-2xl relative z-10 border border-[#C5A059]/30 text-center max-w-xs w-full"
              >
                  <div className="w-20 h-20 bg-[#C5A059]/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-[#C5A059]/20">
                      <Lock className="w-10 h-10 text-[#C5A059] animate-pulse" />
                  </div>
                  <h2 className="font-cinzel text-xl font-bold mb-2 dark:text-white">Validando Acesso</h2>
                  <p className="text-gray-500 text-xs font-montserrat uppercase tracking-widest">Identidade confirmada no Supabase</p>
              </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-white dark:bg-[#1A1A1A] rounded-[40px] p-8 w-full max-w-sm shadow-2xl border border-[#C5A059]/30 relative z-10 overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 blur-3xl rounded-full -mr-16 -mt-16"></div>
            
            <div className="flex items-center justify-between mb-8 relative z-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center border border-red-500/20">
                  <ShieldAlert className="w-6 h-6 text-red-500" />
                </div>
                <div>
                  <h2 className="font-cinzel text-lg font-bold text-[#0F0505] dark:text-white">Acesso Restrito</h2>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Somente Administradores</p>
                </div>
              </div>
              <button 
                onClick={onClose} 
                className="w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-white/5 rounded-full hover:bg-red-50 dark:hover:bg-red-500/20 transition-all group"
              >
                <X className="w-5 h-5 text-gray-400 group-hover:text-red-500" />
              </button>
            </div>

            <div className="text-center space-y-4 relative z-10">
               <div className="p-5 bg-gray-50 dark:bg-white/5 rounded-3xl border border-gray-100 dark:border-white/5">
                  <p className="text-sm text-gray-600 dark:text-gray-300 font-medium leading-relaxed">
                    Sua conta não possui permissões administrativas configuradas no servidor.
                  </p>
               </div>
               
               <p className="text-[10px] text-gray-400 italic">
                 Contate o Professor Michel Felix para habilitar seu acesso via Supabase SQL.
               </p>

                <button 
                  onClick={onClose}
                  className="w-full py-4 bg-[#1a0f0f] dark:bg-white dark:text-black text-white rounded-2xl font-cinzel font-bold text-xs tracking-[0.2em] shadow-xl active:scale-[0.98] transition-all"
                >
                  VOLTAR
                </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
