import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Group, Student, DayOfWeek, DAYS, 
  GroupSchedule, Exam, ExamResult, 
  UserConfig, UserRole, SUBJECTS,
  StudentLecture, StudentHomework 
} from './types';
import { ICONS, SUBJECT_COLORS } from './constants';
import Modal from './components/Modal';
import LectureCard from './components/LessonCard';
import HomeworkItem from './components/HomeworkItem';

// --- استيراد Firebase المصلح (لا تلمس هذه الأسطر) ---
import { auth, db } from './firebase.ts';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  onAuthStateChanged,
  signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  doc, setDoc, getDoc, updateDoc, collection, onSnapshot, addDoc, deleteDoc, query, where, getDocs, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const formatTime12h = (timeStr: string) => {
  if (!timeStr) return '';
  try {
    const [hours, minutes] = timeStr.split(':');
    let h = parseInt(hours);
    const m = minutes;
    const ampm = h >= 12 ? 'م' : 'ص';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  } catch (e) { return timeStr; }
};

const Toast: React.FC<{ 
  message: string; 
  type: 'success' | 'error'; 
  onClose: () => void;
  action?: { label: string; onClick: () => void };
}> = ({ message, type, onClose, action }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000); 
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-4 px-6 py-4 rounded-[1.8rem] shadow-2xl animate-toast-in ${
      type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
    }`}>
      <div className="flex-shrink-0">{type === 'success' ? ICONS.Check : ICONS.Ban}</div>
      <div className="flex-1 font-bold tracking-tight">{message}</div>
      {action && (
        <button onClick={action.onClick} className="mr-2 px-3 py-1 bg-white/20 rounded-xl text-xs font-black uppercase">
          {action.label}
        </button>
      )}
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'onboarding' | 'dashboard' | 'teacher-groups' | 'teacher-exams' | 'teacher-weekly' | 'student-results'>('onboarding');
  const [config, setConfig] = useState<UserConfig>({ name: '', username: '', role: null, profileImage: null });
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; action?: any } | null>(null);
  
  const [groups, setGroups] = useState<Group[]>([]);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroup, setNewGroup] = useState<Partial<Group>>({ name: '', location: '', phone: '', schedule: [] });
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'students' | 'exams' | 'schedule'>('students');

  // --- التحكم بالدخول والخروج وربط البيانات ---
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          setConfig(userDoc.data() as UserConfig);
          setUser(firebaseUser);
          setView('dashboard');
          
          // جلب المجموعات فورياً عند الدخول
          const q = query(collection(db, 'groups'), where('teacherId', '==', firebaseUser.uid));
          const unsubscribeGroups = onSnapshot(q, (snapshot) => {
            setGroups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group)));
          });
          return () => unsubscribeGroups();
        }
      } else {
        setUser(null);
        setView('onboarding');
      }
      setLoading(false);
    });
    return () => unsubscribeAuth();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config.username || !config.password) return;
    const email = `${config.username}@manasa.com`;
    try {
      if (authMode === 'register') {
        const res = await createUserWithEmailAndPassword(auth, email, config.password);
        const userData = { name: config.name, username: config.username, role: config.role, profileImage: null };
        await setDoc(doc(db, 'users', res.user.uid), userData);
      } else {
        await signInWithEmailAndPassword(auth, email, config.password);
      }
    } catch (error: any) {
      setToast({ message: 'خطأ في المصادقة: تأكد من البيانات', type: 'error' });
    }
  };

  const addGroup = async () => {
    if (!newGroup.name || !user) return;
    try {
      await addDoc(collection(db, 'groups'), {
        ...newGroup,
        teacherId: user.uid,
        students: [],
        exams: [],
        createdAt: new Date().toISOString()
      });
      setShowAddGroup(false);
      setNewGroup({ name: '', location: '', phone: '', schedule: [] });
      setToast({ message: 'تمت إضافة المجموعة بنجاح', type: 'success' });
    } catch (e) {
      setToast({ message: 'فشل في إضافة المجموعة', type: 'error' });
    }
  };

  const deleteGroup = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه المجموعة؟')) return;
    try {
      await deleteDoc(doc(db, 'groups', id));
      setToast({ message: 'تم حذف المجموعة', type: 'success' });
    } catch (e) {
      setToast({ message: 'فشل الحذف', type: 'error' });
    }
  };

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8FAFC]">
      <div className="animate-spin text-indigo-600 mb-4">{ICONS.Reset}</div>
      <p className="font-black text-slate-400 animate-pulse uppercase tracking-widest">جاري التحميل...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-32 font-['Tajawal']">
      {toast && <Toast message={toast.message} type={toast.type} action={toast.action} onClose={() => setToast(null)} />}

      {!user ? (
        <div className="max-w-md mx-auto pt-20 px-8 animate-slide-in">
          <div className="text-center mb-12">
            <div className="w-24 h-24 bg-gradient-to-br from-indigo-600 to-violet-700 rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-indigo-200 rotate-3 group hover:rotate-0 transition-transform duration-500">
              <span className="text-white text-5xl font-black italic tracking-tighter">أ</span>
            </div>
            <h1 className="text-4xl font-black text-slate-900 mb-3 tracking-tight">منصة الأستاذ</h1>
            <p className="text-slate-400 font-bold text-lg italic uppercase tracking-wider">Smart Education System</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-5">
            {authMode === 'register' && (
              <input type="text" placeholder="الاسم الكامل" className="field" value={config.name} onChange={e => setConfig({...config, name: e.target.value})} />
            )}
            <input type="text" placeholder="اسم المستخدم" className="field" value={config.username} onChange={e => setConfig({...config, username: e.target.value})} />
            <input type="password" placeholder="كلمة المرور" className="field" value={config.password || ''} onChange={e => setConfig({...config, password: e.target.value})} />
            
            {authMode === 'register' && (
              <div className="grid grid-cols-2 gap-4 pt-4">
                <button type="button" onClick={() => setConfig({...config, role: 'teacher'})} className={`py-5 rounded-[2rem] font-black border-2 transition-all duration-300 ${config.role === 'teacher' ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl scale-105' : 'bg-white border-slate-100 text-slate-400 hover:border-indigo-100'}`}>أستاذ</button>
                <button type="button" onClick={() => setConfig({...config, role: 'student'})} className={`py-5 rounded-[2rem] font-black border-2 transition-all duration-300 ${config.role === 'student' ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl scale-105' : 'bg-white border-slate-100 text-slate-400 hover:border-indigo-100'}`}>طالب</button>
              </div>
            )}

            <button type="submit" className="w-full bg-slate-900 text-white py-6 rounded-[2.5rem] font-black text-xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.3)] hover:bg-indigo-600 transition-all duration-500 mt-8 relative overflow-hidden group">
              <span className="relative z-10">{authMode === 'login' ? 'دخول للمنصة' : 'إنشاء حساب جديد'}</span>
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-violet-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            </button>
          </form>

          <button onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} className="w-full mt-10 text-indigo-600 font-black text-center flex items-center justify-center gap-2 group">
            {authMode === 'login' ? 'ليس لديك حساب؟ سجل الآن' : 'لديك حساب بالفعل؟ سجل دخول'}
            <span className="group-hover:translate-x-[-4px] transition-transform">{ICONS.ChevronLeft}</span>
          </button>
        </div>
      ) : (
        <>
          <header className="px-8 pt-12 pb-8 flex justify-between items-end">
            <div>
              <p className="text-indigo-600 font-black text-xs uppercase tracking-[0.3em] mb-2 drop-shadow-sm">مرحباً بك مجدداً</p>
              <h1 className="text-4xl font-black text-slate-900 tracking-tight italic">{config.name}</h1>
            </div>
            <div className="flex gap-4">
              <button className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-slate-400 shadow-sm border border-slate-100 relative group transition-all hover:border-indigo-100">
                {ICONS.Bell}
                <span className="absolute top-3 right-3 w-3 h-3 bg-rose-500 rounded-full border-4 border-white animate-bounce"></span>
              </button>
              <button onClick={() => signOut(auth)} className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-rose-500 shadow-sm border border-slate-100 hover:bg-rose-50 transition-all active:scale-95">
                {ICONS.LogOut}
              </button>
            </div>
          </header>

          <main className="px-6 space-y-10 animate-slide-in">
            {view === 'dashboard' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-indigo-600 p-10 rounded-[4rem] text-white shadow-[0_30px_60px_-15px_rgba(79,70,229,0.4)] relative overflow-hidden group">
                    <div className="relative z-10">
                      <h3 className="text-xl font-bold opacity-80 mb-2">إجمالي المجموعات</h3>
                      <p className="text-7xl font-black italic tracking-tighter leading-none">{groups.length}</p>
                    </div>
                    <div className="absolute -right-10 -bottom-10 opacity-10 transform rotate-12 group-hover:scale-125 transition-transform duration-1000 scale-110">{ICONS.Users}</div>
                    <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/10 to-transparent"></div>
                  </div>
                  
                  <div className="bg-white p-10 rounded-[4rem] border border-slate-100 shadow-sm relative overflow-hidden group hover:border-indigo-100 transition-colors duration-500">
                    <h3 className="text-xl font-bold text-slate-400 mb-2">إجمالي الطلاب</h3>
                    <p className="text-7xl font-black italic text-slate-900 leading-none">0</p>
                    <div className="absolute -right-10 -bottom-10 text-slate-50 group-hover:text-indigo-50 transition-colors duration-700 scale-110">{ICONS.Student}</div>
                  </div>
                </div>

                <div className="flex justify-between items-center px-4">
                  <h2 className="text-3xl font-black text-slate-900 italic tracking-tight">مجموعاتك <span className="text-indigo-600 font-black underline decoration-indigo-200 underline-offset-8 decoration-8">النشطة</span></h2>
                  <button onClick={() => setView('teacher-groups')} className="text-indigo-600 font-black text-sm bg-indigo-50 px-6 py-3 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all duration-300">عرض الكل</button>
                </div>

                <div className="grid gap-6">
                  {groups.length === 0 ? (
                    <div className="bg-white border-2 border-dashed border-slate-200 rounded-[3.5rem] p-20 text-center group hover:border-indigo-300 transition-colors">
                      <div className="text-slate-200 mb-6 flex justify-center group-hover:text-indigo-200 transition-colors scale-150">{ICONS.Users}</div>
                      <p className="text-slate-400 font-bold text-lg mb-8 italic uppercase tracking-widest">لا توجد مجموعات مضافة حالياً</p>
                      <button onClick={() => setShowAddGroup(true)} className="bg-slate-900 text-white px-10 py-5 rounded-3xl font-black shadow-xl hover:bg-indigo-600 transition-all active:scale-95">إنشاء أول مجموعة</button>
                    </div>
                  ) : (
                    groups.map(g => (
                      <div key={g.id} onClick={() => { setSelectedGroup(g); setView('teacher-groups'); }} className="bg-white p-8 rounded-[3rem] border border-slate-100 flex justify-between items-center shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group">
                        <div className="flex items-center gap-6 text-right">
                          <div className="w-16 h-16 bg-slate-50 rounded-[1.5rem] flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors duration-500">
                            {ICONS.Users}
                          </div>
                          <div>
                            <h4 className="font-black text-2xl text-slate-900 mb-1 group-hover:text-indigo-600 transition-colors">{g.name}</h4>
                            <div className="flex gap-4">
                              <p className="text-slate-400 font-bold text-sm flex items-center gap-2">{ICONS.MapPin} {g.location}</p>
                              <p className="text-indigo-400 font-bold text-sm flex items-center gap-2 uppercase tracking-widest">0 طلاب</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <button onClick={(e) => { e.stopPropagation(); deleteGroup(g.id); }} className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">{ICONS.Trash}</button>
                          <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500">{ICONS.ChevronLeft}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {view === 'teacher-weekly' && (
              <div className="space-y-8 animate-slide-in">
                <h2 className="text-4xl font-black italic tracking-tighter mb-10 underline decoration-indigo-200 decoration-[12px] underline-offset-[12px]">الجدول الأسبوعي</h2>
                {DAYS.map(day => (
                  <div key={day} className="bg-white p-10 rounded-[4rem] border border-slate-100 shadow-sm hover:border-indigo-100 transition-all duration-500 group">
                    <div className="flex justify-between items-center mb-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 font-black">{day.charAt(0)}</div>
                        <h3 className="text-2xl font-black text-indigo-600">{day}</h3>
                      </div>
                      <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">اليوم الدراسي</span>
                    </div>
                    <div className="h-px bg-slate-50 w-full mb-8"></div>
                    <div className="flex flex-col items-center justify-center py-6 text-slate-300 italic font-bold">
                       <p className="text-sm">لا توجد محاضرات في هذا اليوم</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>

          {/* الشريط السفلي المستعاد بالكامل (الـ 4 أزرار الأصلية) */}
          <nav className="fixed bottom-10 left-10 right-10 bg-white/95 backdrop-blur-3xl border border-slate-100 p-3 rounded-[3.5rem] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.2)] flex justify-around items-center z-50">
            <button onClick={() => setView('dashboard')} className={`flex-1 flex flex-col items-center gap-2 py-5 rounded-[2.8rem] transition-all duration-500 ${view === 'dashboard' ? 'bg-indigo-600 text-white shadow-2xl scale-110 -translate-y-2' : 'text-slate-400 hover:text-slate-600'}`}>
               {ICONS.Monitor} <span className="text-[9px] font-black uppercase tracking-[0.15em]">الرئيسية</span>
            </button>
            <button onClick={() => setView('teacher-groups')} className={`flex-1 flex flex-col items-center gap-2 py-5 rounded-[2.8rem] transition-all duration-500 ${view === 'teacher-groups' ? 'bg-indigo-600 text-white shadow-2xl scale-110 -translate-y-2' : 'text-slate-400 hover:text-slate-600'}`}>
               {ICONS.Users} <span className="text-[9px] font-black uppercase tracking-[0.15em]">المجموعات</span>
            </button>
            <button onClick={() => setView('teacher-exams')} className={`flex-1 flex flex-col items-center gap-2 py-5 rounded-[2.8rem] transition-all duration-500 ${view === 'teacher-exams' ? 'bg-indigo-600 text-white shadow-2xl scale-110 -translate-y-2' : 'text-slate-400 hover:text-slate-600'}`}>
               {ICONS.ClipboardList} <span className="text-[9px] font-black uppercase tracking-[0.15em]">الاختبارات</span>
            </button>
            <button onClick={() => setView('teacher-weekly')} className={`flex-1 flex flex-col items-center gap-2 py-5 rounded-[2.8rem] transition-all duration-500 ${view === 'teacher-weekly' ? 'bg-indigo-600 text-white shadow-2xl scale-110 -translate-y-2' : 'text-slate-400 hover:text-slate-600'}`}>
               {ICONS.Calendar} <span className="text-[9px] font-black uppercase tracking-[0.15em]">الجدول</span>
            </button>
          </nav>
        </>
      )}

      {/* المودال الخاص بإضافة مجموعة */}
      {showAddGroup && (
        <Modal title="إنشاء مجموعة جديدة" onClose={() => setShowAddGroup(false)}>
          <div className="space-y-6">
            <input type="text" placeholder="اسم المجموعة (مثلاً: كيمياء السادس أ)" className="field" value={newGroup.name} onChange={e => setNewGroup({...newGroup, name: e.target.value})} />
            <input type="text" placeholder="المكان (مثلاً: معهد المنصور)" className="field" value={newGroup.location} onChange={e => setNewGroup({...newGroup, location: e.target.value})} />
            <button onClick={addGroup} className="w-full bg-indigo-600 text-white py-6 rounded-3xl font-black text-xl shadow-xl hover:bg-slate-900 transition-all duration-500">تأكيد الإضافة</button>
          </div>
        </Modal>
      )}

      <style>{`
        @keyframes toast-in { from { transform: translate(-50%, -100%); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
        .animate-toast-in { animation: toast-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes slide-in { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-slide-in { animation: slide-in 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .field { width: 100%; padding: 22px 28px; border: 2.5px solid #f8fafc; border-radius: 2.2rem; outline: none; font-weight: 800; font-size: 16px; background: white; text-align: right; transition: all 0.3s; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); }
        .field:focus { border-color: #4f46e5; transform: translateY(-2px); box-shadow: 0 20px 40px -15px rgba(79, 70, 229, 0.2); }
      `}</style>
    </div>
  );
}
