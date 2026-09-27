import React, { useState, useEffect } from 'react';
import { ChevronLeft, Bell, Flame, Plus, Trash2, Send, Megaphone, User, Heart, Edit, Church } from 'lucide-react';
import { db } from '../../services/database';
import { Announcement, PrayerRequest } from '../../types';
import { ChurchUnit, CHURCH_UNITS } from '../../constants';
import { format } from 'date-fns';

interface MessagesViewProps {
  onBack: () => void;
  isAdmin?: boolean; // Prop para saber se pode postar aviso
  user?: any; // Dados do usuário logado
  userProgress?: any;
}

export default function MessagesView({ onBack, isAdmin = false, user, userProgress }: MessagesViewProps) {
  const [activeTab, setActiveTab] = useState<'avisos' | 'oracao'>('avisos');
  const userChurchUnit: ChurchUnit = userProgress?.church_unit || user?.church_unit || 'sede';
  const [selectedUnit, setSelectedUnit] = useState<ChurchUnit | 'all'>(userChurchUnit);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [prayers, setPrayers] = useState<PrayerRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Form States
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // Novo estado para controlar edição
  const [newTitle, setNewTitle] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [prayerCategory, setPrayerCategory] = useState('saude');
  const [announcementUnit, setAnnouncementUnit] = useState<'sede' | 'praca_gil' | 'geral'>('geral');

  // Load Data
  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
        if (activeTab === 'avisos') {
            const data = await db.entities.Announcements.list();
            setAnnouncements(data);
        } else {
            const data = await db.entities.PrayerRequests.list();
            setPrayers(data);
        }
    } catch (e) {
        console.error(e);
    } finally {
        setLoading(false);
    }
  };

  const resetForm = () => {
      setShowForm(false);
      setNewTitle('');
      setNewMessage('');
      setEditingId(null);
  };

  const handleEditClick = (ann: Announcement) => {
      setNewTitle(ann.title);
      setNewMessage(ann.message);
      setEditingId(ann.id || null);
      setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    try {
        if (activeTab === 'avisos' && isAdmin) {
            if (editingId) {
                // Modo Edição
                await db.entities.Announcements.update(editingId, {
                    title: newTitle || 'Comunicado',
                    message: newMessage,
                    // Mantém a data original ou atualiza se preferir. 
                    // Aqui opto por manter autor e data originais para histórico, ou pode atualizar a data.
                });
            } else {
                // Modo Criação
                const item: Announcement = {
                    title: newTitle || 'Comunicado',
                    message: newMessage,
                    date: new Date().toISOString(),
                    author: 'Secretaria ADMA',
                    priority: 'normal',
                    church_unit: announcementUnit
                };
                await db.entities.Announcements.create(item);
            }
        } else if (activeTab === 'oracao') {
            const item: PrayerRequest = {
                user_name: user?.user_name || 'Anônimo',
                user_email: user?.user_email || 'anon@adma.local',
                request_text: newMessage,
                date: new Date().toISOString(),
                prayer_count: 0,
                praying_users: [], // Inicializa lista vazia
                category: prayerCategory as any,
                church_unit: userChurchUnit
            };
            await db.entities.PrayerRequests.create(item);
        }
        
        resetForm();
        loadData();
    } catch (e) {
        alert("Erro ao enviar.");
    }
  };

  const handleDelete = async (id: string) => {
      if(!window.confirm("Apagar este item?")) return;
      try {
          if(activeTab === 'avisos') await db.entities.Announcements.delete(id);
          else await db.entities.PrayerRequests.delete(id);
          loadData();
      } catch(e) { console.error(e); }
  };

  const handlePrayClick = async (req: PrayerRequest) => {
    if (!user || !user.user_email) {
        alert("Você precisa estar logado para interagir.");
        return;
    }

    const myEmail = user.user_email;
    const currentList = req.praying_users || [];
    const hasPrayed = currentList.includes(myEmail);

    let newList: string[];
    
    if (hasPrayed) {
        // Desmarcar: Remove o email da lista
        newList = currentList.filter(email => email !== myEmail);
    } else {
        // Marcar: Adiciona o email à lista
        newList = [...currentList, myEmail];
    }

    const newCount = newList.length;

    // Optimistic Update (Atualiza UI instantaneamente)
    setPrayers(prev => prev.map(p => p.id === req.id ? { ...p, prayer_count: newCount, praying_users: newList } : p));
    
    // Server Update
    if(req.id) {
        await db.entities.PrayerRequests.update(req.id, { 
            prayer_count: newCount,
            praying_users: newList 
        });
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5DC] dark:bg-dark-bg transition-colors duration-300 pb-20">
        <div className="bg-[#8B0000] text-white p-4 pt-[calc(env(safe-area-inset-top)+1rem)] flex items-center justify-between sticky top-0 shadow-lg z-10">
            <div className="flex items-center gap-4">
                <button onClick={onBack}><ChevronLeft /></button>
                <h1 className="font-cinzel font-bold">Comunidade ADMA</h1>
            </div>
            {/* Botão de Nova Postagem */}
            {((activeTab === 'avisos' && isAdmin) || activeTab === 'oracao') && (
                <button onClick={() => { resetForm(); setShowForm(!showForm); }} className="bg-white/20 p-2 rounded-full hover:bg-white/30 transition">
                    <Plus className="w-6 h-6" />
                </button>
            )}
        </div>

        {/* Tabs */}
        <div className="flex bg-white dark:bg-dark-card border-b border-[#C5A059]">
            <button 
                onClick={() => setActiveTab('avisos')}
                className={`flex-1 py-4 font-cinzel font-bold flex justify-center items-center gap-2 transition-all ${activeTab === 'avisos' ? 'bg-[#8B0000] text-white' : 'text-gray-600 dark:text-gray-400'}`}
            >
                <Bell className="w-5 h-5" /> Quadro de Avisos
            </button>
            <button 
                onClick={() => setActiveTab('oracao')}
                className={`flex-1 py-4 font-cinzel font-bold flex justify-center items-center gap-2 transition-all ${activeTab === 'oracao' ? 'bg-[#C5A059] text-white' : 'text-gray-600 dark:text-gray-400'}`}
            >
                <Flame className="w-5 h-5" /> Pedidos de Oração
            </button>
        </div>

        {/* Filtro de Congregação: Sede | Praça Gil | Todas */}
        <div className="bg-[#180a0a] border-b border-[#C5A059]/30 px-3 py-2 flex items-center justify-between gap-2 overflow-x-auto">
            <span className="text-[10px] font-cinzel font-bold text-white/60 uppercase tracking-widest flex items-center gap-1.5 shrink-0">
                <Church className="w-3.5 h-3.5 text-[#C5A059]" /> {activeTab === 'avisos' ? 'Avisos de:' : 'Orações de:'}
            </span>
            <div className="inline-flex items-center gap-1 p-0.5 bg-black/50 rounded-xl border border-white/10 shrink-0">
                <button
                    onClick={() => setSelectedUnit('sede')}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-cinzel font-bold transition-all flex items-center gap-1.5 ${
                        selectedUnit === 'sede'
                            ? 'bg-[#8B0000] text-white shadow-md ring-1 ring-[#C5A059]'
                            : 'text-gray-400 hover:text-white'
                    }`}
                >
                    <span>Sede (Vilar dos Teles)</span>
                </button>
                <button
                    onClick={() => setSelectedUnit('praca_gil')}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-cinzel font-bold transition-all flex items-center gap-1.5 ${
                        selectedUnit === 'praca_gil'
                            ? 'bg-[#8B0000] text-white shadow-md ring-1 ring-[#C5A059]'
                            : 'text-gray-400 hover:text-white'
                    }`}
                >
                    <span>Praça Gil</span>
                </button>
                <button
                    onClick={() => setSelectedUnit('all')}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-cinzel font-bold transition-all flex items-center gap-1.5 ${
                        selectedUnit === 'all'
                            ? 'bg-[#C5A059] text-black font-black shadow-md'
                            : 'text-gray-400 hover:text-white'
                    }`}
                >
                    <span>Todas</span>
                </button>
            </div>
        </div>

        {/* Form Modal Inline */}
        {showForm && (
            <div className="p-4 bg-white dark:bg-dark-card shadow-md animate-in slide-in-from-top-5">
                <form onSubmit={handleSubmit} className="space-y-3">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="font-bold text-sm text-[#8B0000] dark:text-[#C5A059]">
                            {editingId ? 'Editar Publicação' : 'Nova Publicação'}
                        </h3>
                    </div>
                    {activeTab === 'avisos' && (
                        <>
                            <input 
                                type="text" 
                                placeholder="Título do Aviso" 
                                className="w-full p-3 border rounded dark:bg-gray-800 dark:text-white"
                                value={newTitle}
                                onChange={e => setNewTitle(e.target.value)}
                                required
                            />
                            {isAdmin && (
                                <div className="flex items-center gap-2 pt-1">
                                    <label className="text-xs font-bold text-gray-600 dark:text-gray-300 flex items-center gap-1">
                                        <Church className="w-3.5 h-3.5 text-[#C5A059]" />
                                        Destino do Aviso:
                                    </label>
                                    <select 
                                        value={announcementUnit}
                                        onChange={e => setAnnouncementUnit(e.target.value as any)}
                                        className="p-2 border rounded-lg text-xs font-montserrat dark:bg-gray-800 dark:text-white dark:border-gray-700"
                                    >
                                        <option value="geral">Geral (Todas as Unidades)</option>
                                        <option value="sede">Apenas Sede (Vilar dos Teles)</option>
                                        <option value="praca_gil">Apenas Praça Gil</option>
                                    </select>
                                </div>
                            )}
                        </>
                    )}
                    {activeTab === 'oracao' && (
                         <div className="flex flex-col sm:flex-row gap-2">
                            <select 
                                value={prayerCategory}
                                onChange={e => setPrayerCategory(e.target.value)}
                                className="flex-1 p-3 border rounded dark:bg-gray-800 dark:text-white"
                            >
                                <option value="saude">Saúde</option>
                                <option value="familia">Família</option>
                                <option value="espiritual">Espiritual</option>
                                <option value="financeiro">Financeiro</option>
                                <option value="outros">Outros</option>
                            </select>
                            <div className="p-2.5 rounded-lg border border-[#C5A059]/30 bg-[#C5A059]/10 text-[#C5A059] text-xs font-bold flex items-center gap-1.5">
                                <Church className="w-4 h-4 shrink-0" />
                                <span>Igreja: {userChurchUnit === 'praca_gil' ? 'Praça Gil' : 'Sede'}</span>
                            </div>
                         </div>
                    )}
                    <textarea 
                        placeholder={activeTab === 'avisos' ? "Digite o comunicado..." : "Descreva seu pedido de oração..."}
                        className="w-full p-3 border rounded h-32 dark:bg-gray-800 dark:text-white"
                        value={newMessage}
                        onChange={e => setNewMessage(e.target.value)}
                        required
                    />
                    <div className="flex gap-2 justify-end">
                        <button type="button" onClick={resetForm} className="px-4 py-2 text-gray-500">Cancelar</button>
                        <button type="submit" className="px-6 py-2 bg-[#8B0000] text-white rounded font-bold flex items-center gap-2">
                            <Send className="w-4 h-4" /> {editingId ? 'Salvar' : 'Publicar'}
                        </button>
                    </div>
                </form>
            </div>
        )}

        {/* Content List */}
        <div className="p-4 space-y-4">
            {loading ? (
                <div className="text-center py-10 opacity-50">Carregando...</div>
            ) : activeTab === 'avisos' ? (
                (() => {
                    const filtered = announcements.filter(ann => {
                        if (selectedUnit === 'all') return true;
                        if (!ann.church_unit || ann.church_unit === 'geral') return true;
                        return ann.church_unit === selectedUnit;
                    });
                    
                    if (filtered.length === 0) {
                        return (
                            <div className="text-center py-20 text-gray-400">
                                <Megaphone className="w-16 h-16 mx-auto mb-4 opacity-30" />
                                <p>Nenhum aviso para esta unidade no momento.</p>
                            </div>
                        );
                    }

                    return filtered.map(ann => (
                        <div key={ann.id} className="bg-white dark:bg-dark-card p-6 rounded-xl shadow-md border-l-4 border-[#8B0000] relative">
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className="font-cinzel font-bold text-lg dark:text-white">{ann.title}</h3>
                                    <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded border border-[#C5A059]/40 bg-[#C5A059]/10 text-[#C5A059]">
                                        {ann.church_unit === 'praca_gil' ? 'Praça Gil' : ann.church_unit === 'sede' ? 'Sede' : 'Geral'}
                                    </span>
                                </div>
                                {isAdmin && (
                                    <div className="flex gap-2">
                                        <button onClick={() => handleEditClick(ann)} className="text-gray-400 hover:text-[#C5A059]" title="Editar">
                                            <Edit className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => handleDelete(ann.id!)} className="text-gray-400 hover:text-red-500" title="Excluir">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                            </div>
                            <p className="font-cormorant text-lg text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{ann.message}</p>
                            <div className="mt-4 flex justify-between items-center text-xs text-gray-500 font-montserrat">
                                <span>{ann.author}</span>
                                <span>{new Date(ann.date).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                        </div>
                    ));
                })()
            ) : (
                (() => {
                    const filtered = prayers.filter(req => {
                        if (selectedUnit === 'all') return true;
                        const unit = req.church_unit || 'sede';
                        return unit === selectedUnit;
                    });

                    if (filtered.length === 0) {
                        return (
                            <div className="text-center py-20 text-gray-400">
                                <Flame className="w-16 h-16 mx-auto mb-4 opacity-30" />
                                <p>Mural de oração vazio para esta congregação.</p>
                                <p className="text-sm">Seja o primeiro a pedir oração.</p>
                            </div>
                        );
                    }

                    return filtered.map(req => {
                        const isPraying = (req.praying_users || []).includes(user?.user_email);
                        
                        return (
                            <div key={req.id} className="bg-white dark:bg-dark-card p-5 rounded-xl shadow-sm border border-[#C5A059]/20">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                                        <User className="w-5 h-5 text-gray-500 dark:text-gray-300" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="font-bold text-sm dark:text-white">{req.user_name}</p>
                                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border border-[#C5A059]/40 bg-[#C5A059]/10 text-[#C5A059]">
                                                {req.church_unit === 'praca_gil' ? 'Praça Gil' : 'Sede'}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500 capitalize">{req.category} • {format(new Date(req.date), "dd/MM")}</p>
                                    </div>
                                    {(isAdmin || user?.user_email === req.user_email) && (
                                        <button onClick={() => handleDelete(req.id!)} className="ml-auto text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                                    )}
                                </div>
                                
                                <p className="text-gray-700 dark:text-gray-300 font-cormorant text-lg mb-4 italic">
                                    "{req.request_text}"
                                </p>

                                <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-700 pt-3">
                                    <button 
                                        onClick={() => handlePrayClick(req)}
                                        className={`flex items-center gap-2 text-sm font-bold transition-colors active:scale-95 ${isPraying ? 'text-[#8B0000] dark:text-[#ff6b6b]' : 'text-[#C5A059] hover:text-[#8B0000]'}`}
                                    >
                                        <Heart className={`w-5 h-5 ${isPraying ? 'fill-current' : ''}`} />
                                        <span>{isPraying ? 'Vou orar (Marcado)' : 'Vou orar'}</span>
                                    </button>
                                    <span className="text-xs text-gray-400 font-bold">
                                        {req.prayer_count || 0} pessoas orando
                                    </span>
                                </div>
                            </div>
                        );
                    });
                })()
            )}
        </div>
    </div>
  );
}
