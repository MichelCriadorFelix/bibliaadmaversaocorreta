import React from 'react';
import { Plus, FolderPlus, Trash2, Edit, ChevronUp, ChevronDown, GraduationCap, Lock, Unlock, Star, Save, X, BookOpen, ArrowLeft } from 'lucide-react';
import { ThematicTheme, ThematicFolder, ThematicLesson } from '../../types';

interface ThematicManagerProps {
    isAdmin: boolean;
    themes: ThematicTheme[];
    activeTheme: ThematicTheme | null;
    folders: ThematicFolder[];
    lessons: ThematicLesson[];
    onNavigate: (mode: 'themes_list' | 'lessons_list' | 'lesson_content', theme?: ThematicTheme, lesson?: ThematicLesson) => void;
    onToggleStar: (theme: ThematicTheme) => void;
    onDeleteTheme: (id: string) => void;
    onDeleteFolder: (id: string) => void;
    onDeleteLesson: (id: string) => void;
    onRenameLesson: (lesson: ThematicLesson) => void;
    onMoveLesson: (lesson: ThematicLesson, direction: 'up' | 'down') => void;
    onAddTheme: () => void;
    onAddFolder: () => void;
    onAddLesson: (folderId?: string) => void;
    newThemeTitle: string;
    setNewThemeTitle: (val: string) => void;
    newFolderTitle: string;
    setNewFolderTitle: (val: string) => void;
    newLessonTitle: string;
    setNewLessonTitle: (val: string) => void;
    userProgress: any;
}

export const ThematicManager: React.FC<ThematicManagerProps> = ({
    isAdmin,
    themes,
    activeTheme,
    folders,
    lessons,
    onNavigate,
    onToggleStar,
    onDeleteTheme,
    onDeleteFolder,
    onDeleteLesson,
    onRenameLesson,
    onMoveLesson,
    onAddTheme,
    onAddFolder,
    onAddLesson,
    newThemeTitle,
    setNewThemeTitle,
    newFolderTitle,
    setNewFolderTitle,
    newLessonTitle,
    setNewLessonTitle,
    userProgress
}) => {
    const [expandedFolders, setExpandedFolders] = React.useState<Record<string, boolean>>({});

    const toggleFolder = (folderId: string) => {
        setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
    };

    // Se não tiver tema ativo, mostra lista de temas
    if (!activeTheme) {
        return (
            <div className="space-y-8">
                {isAdmin && (
                    <div className="bg-white dark:bg-dark-card p-8 rounded-[2.5rem] border-4 border-dashed border-[#C5A059]/30">
                        <h3 className="font-cinzel font-black text-[#8B0000] mb-6 uppercase tracking-widest text-center">Nova Série Temática</h3>
                        <div className="flex gap-4">
                            <input 
                                value={newThemeTitle}
                                onChange={(e) => setNewThemeTitle(e.target.value)}
                                placeholder="Título da Série (Ex: Os Segredos do Tabernáculo)"
                                className="flex-1 bg-gray-50 dark:bg-black/20 border-2 border-gray-200 dark:border-gray-800 rounded-2xl px-6 py-4 outline-none focus:border-[#C5A059] transition-all"
                            />
                            <button onClick={onAddTheme} className="bg-[#8B0000] text-white px-8 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-[#a00000] transition-all shadow-lg">Criar</button>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {themes.map(theme => {
                        const isUnlocked = isAdmin || !theme.access_password || userProgress?.unlocked_themes?.[theme.id!] === theme.access_password;
                        
                        return (
                            <div key={theme.id} className="group relative bg-white dark:bg-dark-card rounded-[3rem] border-4 border-[#C5A059]/20 overflow-hidden shadow-xl hover:shadow-2xl transition-all hover:scale-[1.02] active:scale-95 cursor-pointer">
                                <div className="p-10" onClick={() => onNavigate('lessons_list', theme)}>
                                    <div className="flex justify-between items-start mb-6">
                                        <div className="w-16 h-16 bg-[#8B0000]/10 rounded-2xl flex items-center justify-center border border-[#8B0000]/20">
                                            <GraduationCap className="w-8 h-8 text-[#8B0000]" />
                                        </div>
                                        <div className="flex gap-2">
                                            {isAdmin && (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); onToggleStar(theme); }}
                                                    className={`p-3 rounded-xl transition-all ${theme.is_starred ? 'bg-yellow-100 text-yellow-600' : 'bg-gray-100 text-gray-400 hover:text-yellow-500'}`}
                                                >
                                                    <Star className={`w-5 h-5 ${theme.is_starred ? 'fill-current' : ''}`} />
                                                </button>
                                            )}
                                            {theme.access_password && (
                                                <div className={`p-3 rounded-xl ${isUnlocked ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                                    {isUnlocked ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <h3 className="font-cinzel font-black text-2xl text-[#8B0000] dark:text-[#ff6b6b] uppercase tracking-widest mb-4 leading-tight">{theme.title}</h3>
                                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest opacity-60">Estudos Temáticos ADMA • {new Date(theme.created_at).toLocaleDateString()}</p>
                                </div>
                                
                                {isAdmin && (
                                    <div className="absolute bottom-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={(e) => { e.stopPropagation(); onDeleteTheme(theme.id!); }} className="p-3 bg-red-100 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    // Se tiver tema ativo, mostra lista de aulas e pastas
    return (
        <div className="space-y-12">
            <div className="flex items-center justify-between bg-white dark:bg-dark-card p-8 rounded-[2.5rem] border-4 border-[#C5A059]/30 shadow-xl">
                <div>
                    <h2 className="font-cinzel font-black text-3xl text-[#8B0000] dark:text-[#ff6b6b] uppercase tracking-widest">{activeTheme.title}</h2>
                    <p className="text-[10px] text-[#C5A059] font-black uppercase tracking-[0.4em] mt-2">Gerenciamento de Conteúdo Estudos Temáticos</p>
                </div>
                <button onClick={() => onNavigate('themes_list')} className="flex items-center gap-2 px-8 py-4 bg-gray-100 dark:bg-black/20 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-all">
                    <ArrowLeft className="w-4 h-4" />
                    Voltar
                </button>
            </div>

            {isAdmin && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-white dark:bg-dark-card p-8 rounded-[2.5rem] border-4 border-dashed border-[#C5A059]/30">
                        <h4 className="font-cinzel font-black text-[#8B0000] mb-6 uppercase tracking-widest text-xs">Nova Pasta</h4>
                        <div className="flex gap-4">
                            <input value={newFolderTitle} onChange={(e) => setNewFolderTitle(e.target.value)} placeholder="Nome da Pasta" className="flex-1 bg-gray-50 dark:bg-black/20 border-2 border-gray-200 dark:border-gray-800 rounded-2xl px-6 py-4 text-sm outline-none focus:border-[#C5A059]" />
                            <button onClick={onAddFolder} className="bg-[#C5A059] text-white px-6 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-[#b08d4a] transition-all"><FolderPlus className="w-4 h-4" /></button>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-dark-card p-8 rounded-[2.5rem] border-4 border-dashed border-[#C5A059]/30">
                        <h4 className="font-cinzel font-black text-[#8B0000] mb-6 uppercase tracking-widest text-xs">Nova Aula (Raiz)</h4>
                        <div className="flex gap-4">
                            <input value={newLessonTitle} onChange={(e) => setNewLessonTitle(e.target.value)} placeholder="Título da Aula" className="flex-1 bg-gray-50 dark:bg-black/20 border-2 border-gray-200 dark:border-gray-800 rounded-2xl px-6 py-4 text-sm outline-none focus:border-[#C5A059]" />
                            <button onClick={() => onAddLesson()} className="bg-[#8B0000] text-white px-6 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-[#a00000] transition-all"><Plus className="w-4 h-4" /></button>
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-12">
                {/* Pastas e suas Aulas */}
                {folders.map(folder => {
                    const isExpanded = expandedFolders[folder.id!];
                    return (
                    <div key={folder.id} className="space-y-6">
                        <div 
                            className="flex items-center justify-between border-b-4 border-[#C5A059]/30 pb-4 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 p-2 rounded-xl transition-colors -mx-2"
                            onClick={() => toggleFolder(folder.id!)}
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-[#C5A059]/10 rounded-xl flex items-center justify-center border border-[#C5A059]/20">
                                    <BookOpen className="w-5 h-5 text-[#C5A059]" />
                                </div>
                                <h3 className="font-cinzel font-black text-xl text-[#C5A059] uppercase tracking-widest">{folder.title}</h3>
                                {isExpanded ? <ChevronUp className="w-5 h-5 text-[#C5A059] ml-2" /> : <ChevronDown className="w-5 h-5 text-[#C5A059] ml-2" />}
                            </div>
                            {isAdmin && (
                                <div className="flex gap-2">
                                    <button onClick={(e) => {
                                        e.stopPropagation();
                                        const title = window.prompt("Título da Aula nesta pasta:", newLessonTitle);
                                        if(title) {
                                            setNewLessonTitle(title);
                                            onAddLesson(folder.id);
                                        }
                                    }} className="p-3 bg-green-100 text-green-600 rounded-xl hover:bg-green-600 hover:text-white transition-all"><Plus className="w-4 h-4" /></button>
                                    <button onClick={(e) => {
                                        e.stopPropagation();
                                        onDeleteFolder(folder.id!);
                                    }} className="p-3 bg-red-100 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            )}
                        </div>
                        {isExpanded && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-2 fade-in duration-300">
                                {lessons.filter(l => l.folder_id === folder.id).map(lesson => (
                                    <LessonCard 
                                        key={lesson.id} 
                                        lesson={lesson} 
                                        isAdmin={isAdmin} 
                                        onNavigate={onNavigate} 
                                        onDelete={onDeleteLesson} 
                                        onRename={onRenameLesson} 
                                        onMove={onMoveLesson}
                                        isCompleted={userProgress?.thematic_read?.includes(lesson.id!)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )})}

                {/* Aulas na Raiz */}
                {lessons.filter(l => !l.folder_id).length > 0 && (
                    <div className="space-y-6">
                        <h3 className="font-cinzel font-black text-xl text-[#8B0000] uppercase tracking-widest border-b-4 border-[#8B0000]/30 pb-4">Aulas Avulsas</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {lessons.filter(l => !l.folder_id).map(lesson => (
                                <LessonCard 
                                    key={lesson.id} 
                                    lesson={lesson} 
                                    isAdmin={isAdmin} 
                                    onNavigate={onNavigate} 
                                    onDelete={onDeleteLesson} 
                                    onRename={onRenameLesson} 
                                    onMove={onMoveLesson}
                                    isCompleted={userProgress?.thematic_read?.includes(lesson.id!)}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const LessonCard = ({ lesson, isAdmin, onNavigate, onDelete, onRename, onMove, isCompleted }: any) => (
    <div className="group bg-white dark:bg-dark-card p-8 rounded-[2.5rem] border-4 border-[#C5A059]/20 shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] active:scale-95 cursor-pointer relative overflow-hidden">
        <div onClick={() => onNavigate('lesson_content', undefined, lesson)}>
            <div className="flex justify-between items-start mb-4">
                <span className="text-[10px] font-black text-[#C5A059] uppercase tracking-[0.3em]">Aula {lesson.order_index}</span>
                {isCompleted && <div className="bg-green-100 text-green-600 p-2 rounded-lg"><GraduationCap className="w-4 h-4" /></div>}
            </div>
            <h4 className="font-cinzel font-black text-lg text-[#8B0000] dark:text-[#ff6b6b] uppercase tracking-widest leading-tight">{lesson.title}</h4>
        </div>
        
        {isAdmin && (
            <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={(e) => { e.stopPropagation(); onMove(lesson, 'up'); }} className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-[#C5A059] hover:text-white transition-all"><ChevronUp className="w-3 h-3" /></button>
                <button onClick={(e) => { e.stopPropagation(); onMove(lesson, 'down'); }} className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-[#C5A059] hover:text-white transition-all"><ChevronDown className="w-3 h-3" /></button>
                <button onClick={(e) => { e.stopPropagation(); onRename(lesson); }} className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all"><Edit className="w-3 h-3" /></button>
                <button onClick={(e) => { e.stopPropagation(); onDelete(lesson.id!); }} className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-all"><Trash2 className="w-3 h-3" /></button>
            </div>
        )}
    </div>
);
