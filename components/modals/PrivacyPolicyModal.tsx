import React from 'react';
import { Shield, X, Lock, Eye, Trash2, Download, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PrivacyPolicyModal({ isOpen, onClose }: PrivacyPolicyModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="bg-white dark:bg-[#1E1E1E] w-full max-w-2xl max-h-[85vh] rounded-[32px] shadow-2xl border border-[#C5A059]/30 relative z-10 overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="p-6 bg-[#1a0f0f] text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#C5A059] rounded-xl text-black">
                  <Shield className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="font-cinzel font-bold text-lg">Privacidade & Dados</h2>
                  <p className="text-[10px] text-[#C5A059] font-black uppercase tracking-widest">Conformidade LGPD</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 scrollbar-hide">
              <section className="space-y-3">
                <h3 className="font-cinzel font-bold text-gray-800 dark:text-white flex items-center gap-2">
                  <Info className="w-4 h-4 text-[#C5A059]" /> Sobre a Coleta
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed font-inter">
                  O aplicativo <strong>Bíblia ADMA</strong> coleta dados apenas para fins pedagógicos e de integração comunitária. Coletamos seu nome completo e e-mail para identificar seu progresso nas leituras e sua participação na Escola Bíblica Dominical (EBD).
                </p>
              </section>

              <section className="space-y-4">
                <h3 className="font-cinzel font-bold text-gray-800 dark:text-white flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[#C5A059]" /> Como usamos seus dados
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-gray-50 dark:bg-black/20 rounded-2xl border border-gray-100 dark:border-white/5 disabled:opacity-50">
                    <h4 className="text-xs font-black uppercase text-[#8B0000] dark:text-[#C5A059] mb-2 tracking-tighter">Sincronização</h4>
                    <p className="text-xs text-gray-500">Salvamos quais livros e capítulos você leu para que possa continuar de onde parou em qualquer dispositivo.</p>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-black/20 rounded-2xl border border-gray-100 dark:border-white/5">
                    <h4 className="text-xs font-black uppercase text-[#8B0000] dark:text-[#C5A059] mb-2 tracking-tighter">EBD & Chamada</h4>
                    <p className="text-xs text-gray-500">Sua presença na EBD é registrada digitalmente pela secretaria para fins de histórico acadêmico.</p>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-black/20 rounded-2xl border border-gray-100 dark:border-white/5">
                    <h4 className="text-xs font-black uppercase text-[#8B0000] dark:text-[#C5A059] mb-2 tracking-tighter">Ranking & Medalhas</h4>
                    <p className="text-xs text-gray-500">Seu progresso gera conquistas saudáveis que podem ser visualizadas pelos demais membros da comunidade.</p>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-black/20 rounded-2xl border border-gray-100 dark:border-white/5">
                    <h4 className="text-xs font-black uppercase text-[#8B0000] dark:text-[#C5A059] mb-2 tracking-tighter">Inteligência Artificial</h4>
                    <p className="text-xs text-gray-500">As dúvidas enviadas ao Professor Michel Felix (IA) são processadas para melhorar as respostas teológicas.</p>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="font-cinzel font-bold text-gray-800 dark:text-white flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-red-500" /> Seus Direitos (LGPD)
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">De acordo com a Lei Geral de Proteção de Dados, você tem o direito de:</p>
                <div className="space-y-2">
                  <div className="flex items-start gap-4 p-4 border border-gray-100 dark:border-white/5 rounded-2xl">
                    <Eye className="w-5 h-5 text-[#C5A059] shrink-0" />
                    <div>
                      <p className="text-sm font-bold dark:text-white">Acesso e Retificação</p>
                      <p className="text-xs text-gray-500">Você pode ver seus dados no perfil e solicitar correções à secretaria.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 p-4 border border-gray-100 dark:border-white/5 rounded-2xl">
                    <Trash2 className="w-5 h-5 text-red-500 shrink-0" />
                    <div>
                      <p className="text-sm font-bold dark:text-white">Eliminação de Dados</p>
                      <p className="text-xs text-gray-500">Você pode solicitar a exclusão definitiva de sua conta e histórico a qualquer momento entrando em contato com a administração.</p>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-black/40 flex justify-center shrink-0">
               <button 
                onClick={onClose}
                className="px-12 py-3 bg-[#1a0f0f] dark:bg-white dark:text-black text-white font-cinzel font-bold rounded-2xl text-xs tracking-[0.2em] shadow-xl active:scale-[0.98] transition-all"
               >
                 OK, ENTENDI
               </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
