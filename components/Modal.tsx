
import React from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-md animate-fade-in">
      <div className="bg-white dark:bg-[#1e293b] w-full max-w-md rounded-t-[3rem] sm:rounded-[3rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-modal-slide-up transition-colors duration-300">
        <div className="p-6 border-b border-slate-50 dark:border-slate-800 flex justify-between items-center bg-slate-50/30 dark:bg-slate-800/30">
          <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">{title}</h2>
          <button 
            onClick={onClose} 
            className="p-2.5 bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:text-rose-500 transition-all rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700"
          >
            &times;
          </button>
        </div>
        <div className="p-8 overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </div>
      <style>{`
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes modal-slide-up {
          from { transform: translateY(100px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }
        .animate-modal-slide-up { animation: modal-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default Modal;
