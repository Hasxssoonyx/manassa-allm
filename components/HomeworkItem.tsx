
import React from 'react';
import { StudentHomework } from '../types';
import { ICONS, SUBJECT_COLORS } from '../constants';

interface HomeworkItemProps {
  homework: StudentHomework;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

const HomeworkItem: React.FC<HomeworkItemProps> = ({ homework, onToggle, onDelete }) => {
  const theme = SUBJECT_COLORS[homework.subject] || { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', icon: 'text-slate-500' };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(homework.id);
  };

  return (
    <div className="relative mb-4">
      <div 
        onClick={() => onToggle(homework.id)}
        className={`group flex items-center gap-4 p-5 rounded-[2rem] border transition-all duration-300 cursor-pointer ${homework.completed ? 'bg-slate-50/70 dark:bg-slate-800/50 grayscale-[0.8] opacity-70 border-transparent' : 'bg-white dark:bg-[#1e293b] border-slate-100 dark:border-slate-800 hover:shadow-lg hover:border-indigo-100'}`}
      >
        {/* Checkbox Circle */}
        <div className={`w-9 h-9 rounded-2xl border-2 flex items-center justify-center transition-all shrink-0 ${homework.completed ? 'bg-emerald-500 border-emerald-500 text-white rotate-0' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 group-hover:border-indigo-300'}`}>
          {homework.completed ? (
             <div className="scale-90">{ICONS.Check}</div>
          ) : (
             <div className="w-2 h-2 bg-slate-100 dark:bg-slate-700 rounded-full group-hover:bg-indigo-100"></div>
          )}
        </div>
        
        <div className="flex-1 min-w-0 pr-2">
          {/* Fixed: Use homework.task instead of title */}
          <p className={`font-bold text-[14px] leading-tight mb-2 transition-all duration-500 ${homework.completed ? 'line-through decoration-emerald-500 decoration-2 text-slate-400' : 'text-slate-800 dark:text-slate-100'}`}>
            {homework.task}
          </p>
          <div className="flex items-center gap-2">
            <span className={`text-[9px] px-2.5 py-1 rounded-full font-black border ${theme.bg} dark:bg-opacity-10 ${theme.text} ${theme.border}`}>
              {homework.subject}
            </span>
            {/* Fixed: Use homework.createdAt instead of dueDate */}
            <span className="text-[9px] text-slate-400 font-bold flex items-center gap-1 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-lg">
               {ICONS.Clock} <span className="mt-0.5">{homework.createdAt}</span>
            </span>
          </div>
        </div>

        <button 
          onClick={handleDelete}
          className="p-3 bg-rose-50 dark:bg-rose-900/20 text-rose-400 hover:bg-rose-600 hover:text-white active:scale-75 transition-all rounded-2xl shrink-0 z-20"
        >
          {ICONS.Trash}
        </button>
      </div>
    </div>
  );
};

export default HomeworkItem;