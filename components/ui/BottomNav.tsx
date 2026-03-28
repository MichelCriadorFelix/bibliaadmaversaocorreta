import React from 'react';
import { Home, BookOpen, Calendar, ListChecks, Trophy } from 'lucide-react';

interface BottomNavProps {
  currentView: string;
  onNavigate: (view: string) => void;
}

export default function BottomNav({ currentView, onNavigate }: BottomNavProps) {
  const navItems = [
    { id: 'dashboard', icon: Home, label: 'Início' },
    { id: 'reader', icon: BookOpen, label: 'Bíblia' },
    { id: 'devotional', icon: Calendar, label: 'Devocional' },
    { id: 'plans', icon: ListChecks, label: 'Planos' },
    { id: 'ranking', icon: Trophy, label: 'Ranking' },
  ];

  if (currentView === 'admin' || currentView === 'login' || currentView === 'reader') return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-40">
      {/* OTIMIZAÇÃO: Removed backdrop-blur-xl -> bg opacity 98% */}
      <div className="bg-white/98 dark:bg-[#1E1E1E]/98 border border-white/40 dark:border-white/5 rounded-3xl shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] h-16 px-2 flex justify-around items-center max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="relative flex flex-col items-center justify-center w-full h-full group"
            >
              <div 
                className={`absolute inset-0 rounded-2xl transition-all duration-300 scale-0 group-active:scale-95 ${isActive ? 'bg-[#8B0000]/5 dark:bg-[#ff6b6b]/10 scale-90' : 'group-hover:bg-gray-100/50 dark:group-hover:bg-white/5 group-hover:scale-75'}`}
              />
              
              <div className={`relative transition-all duration-300 transform ${isActive ? '-translate-y-1' : ''}`}>
                 <item.icon 
                    className={`w-6 h-6 transition-all duration-300 ${
                        isActive 
                        ? 'text-[#8B0000] dark:text-[#ff6b6b] stroke-[2.5px] drop-shadow-sm' 
                        : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300'
                    }`} 
                 />
              </div>

              <span 
                className={`text-[9px] font-montserrat font-bold absolute bottom-2 transition-all duration-300 ${
                    isActive 
                    ? 'opacity-100 translate-y-0 text-[#8B0000] dark:text-[#ff6b6b]' 
                    : 'opacity-0 translate-y-2 text-gray-400'
                }`}
              >
                {item.label}
              </span>
              
              {/* Active Dot Indicator */}
              <span className={`absolute -bottom-1 w-1 h-1 bg-[#8B0000] dark:bg-[#ff6b6b] rounded-full transition-all duration-300 ${isActive ? 'opacity-0' : 'opacity-0'}`} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
