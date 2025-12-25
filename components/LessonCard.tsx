
import React from 'react';
import { StudentLecture } from '../types';
import { ICONS, SUBJECT_COLORS } from '../constants';

interface LectureCardProps {
  lecture: StudentLecture;
  onEdit: (lecture: StudentLecture) => void;
  onDelete: (id: string) => void;
  onTogglePostponed: (id: string) => void;
}

const formatTime12h = (timeStr: string) => {
  if (!timeStr) return '';
  const [hours, minutes] = timeStr.split(':');
  let h = parseInt(hours);
  const m = minutes;
  const ampm = h >= 12 ? 'م' : 'ص';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
};

const LectureCard: React.FC<LectureCardProps> = ({ lecture, onEdit, onDelete, onTogglePostponed }) => {
  const theme = SUBJECT_COLORS[lecture.subject] || { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', icon: 'text-slate-500' };
  const isOnline = lecture.type === 'online';
  const isPostponed = lecture.postponed;

  return (
    <div 
      onClick={() => onEdit(lecture)}
      className={`relative p-5 mb-4 bg-white dark:bg-[#1e293b] rounded-[2rem] border-r-[6px] shadow-sm transition-all duration-300 border-l border-t border-b border-slate-100 dark:border-slate-800 ${theme.border} hover:shadow-lg hover:translate-y-[-4px] group cursor-pointer ${isPostponed ? 'opacity-60 grayscale-[0.5]' : ''}`}
    >
      <div className="flex justify-between items-start">
        <div className={`flex-1 ${isPostponed ? 'line-through decoration-rose-500 decoration-2' : ''}`}>
          <div className="flex items-center gap-2 mb-2">
             <div className={`p-2 rounded-xl transition-transform duration-500 group-hover:rotate-12 ${theme.bg} dark:bg-opacity-10 ${theme.icon}`}>
               {isOnline ? ICONS.Monitor : ICONS.Bell}
             </div>
             <h3 className={`text-lg font-extrabold text-slate-800 dark:text-slate-100`}>{lecture.subject}</h3>
             <span className={`text-[9px] px-2 py-0.5 rounded-full font-black transition-all group-hover:scale-105 ${isOnline ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>
                {isOnline ? 'إلكترونية' : 'حضورية'}
             </span>
             {isPostponed && (
               <span className="text-[9px] px-2 py-0.5 rounded-full font-black bg-rose-100 text-rose-600 animate-pulse">
                 تم التأجيل
               </span>
             )}
          </div>
          
          <div className="flex items-center gap-4 text-slate-500 dark:text-slate-400 font-bold">
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-full text-xs transition-colors group-hover:bg-slate-100 dark:group-hover:bg-slate-700">
              <span className={theme.icon}>{ICONS.Clock}</span>
              <span>{formatTime12h(lecture.time)}</span>
            </div>
            {!isOnline && (
              <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-full text-xs transition-colors group-hover:bg-slate-100 dark:group-hover:bg-slate-700">
                <span className={theme.icon}>{ICONS.MapPin}</span>
                <span className="max-w-[100px] truncate">{lecture.location}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button 
            onClick={(e) => { e.stopPropagation(); onDelete(lecture.id); }}
            className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-400 hover:bg-rose-600 hover:text-white transition-all shadow-sm"
            title="حذف"
          >
            {ICONS.Trash}
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onTogglePostponed(lecture.id); }}
            className={`p-2.5 rounded-2xl transition-all shadow-sm border ${isPostponed ? 'bg-amber-500 text-white border-amber-400' : 'bg-slate-50 dark:bg-slate-800 text-slate-400 border-slate-100 dark:border-slate-700 hover:bg-amber-100'}`}
            title={isPostponed ? "إلغاء التأجيل" : "تأجيل"}
          >
            {isPostponed ? ICONS.Reset : ICONS.Ban}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LectureCard;
