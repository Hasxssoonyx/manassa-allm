
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  CheckCircle2, Clock, Trash2, Bell, Monitor, MapPin, Ban, RefreshCw, 
  Plus, Users, BookOpen, Calendar, Settings, LogOut, ChevronLeft, 
  Search, ClipboardList, GraduationCap, MessageSquare, UserCheck, 
  UserX, Stethoscope, Star, Moon, Sun, Camera, User, CheckSquare, 
  Instagram, MessageCircle, Edit2, Lock, UserRound
} from 'lucide-react';

// --- تجاوز مشكلة reCAPTCHA ---
(window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;

import { auth, db } from './firebase.ts';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  onAuthStateChanged,
  signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  doc, setDoc, getDoc, getDocs, updateDoc, collection, query, 
  where, onSnapshot, arrayUnion, addDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- التعريفات (Types) ---
export type DayOfWeek = 'الأحد' | 'الاثنين' | 'الثلاثاء' | 'الأربعاء' | 'الخميس' | 'الجمعة' | 'السبت';
export type UserRole = 'teacher' | 'student';

export interface Student {
  id: string; name: string; username: string; paid: boolean;
  notes?: string; starred?: boolean; phone?: string;
}

export interface ExamResult {
  studentId: string; grade: number; status: 'present' | 'absent' | 'excused';
}

export interface Exam {
  id: string; title: string; date: string; maxGrade: number;
  type: 'daily' | 'semester'; results: Record<string, ExamResult>;
}

export interface Group {
  id: string; name: string; location: string; schedule: { id: string; day: DayOfWeek; time: string }[];
  students: Student[]; exams: Exam[]; studentUsernames: string[]; teacherUid?: string;
}

export interface UserConfig {
  name: string; username: string; role: UserRole | null;
  profileImage: string | null; darkMode: boolean; onboarded: boolean;
}

export const DAYS: DayOfWeek[] = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

// --- الأيقونات والألوان (Constants) ---
const ICONS = {
  Check: <CheckCircle2 size={18} />, Clock: <Clock size={14} />, Trash: <Trash2 size={18} />,
  Bell: <Bell size={20} />, Monitor: <Monitor size={20} />, MapPin: <MapPin size={14} />,
  Ban: <Ban size={18} />, Reset: <RefreshCw size={18} />, Plus: <Plus size={20} />,
  Users: <Users size={20} />, Calendar: <Calendar size={20} />, Settings: <Settings size={20} />,
  LogOut: <LogOut size={20} />, ChevronLeft: <ChevronLeft size={20} />, Search: <Search size={20} />,
  ClipboardList: <ClipboardList size={20} />, GraduationCap: <GraduationCap size={20} />,
  Notes: <MessageSquare size={16} />, Star: <Star size={18} />, Moon: <Moon size={20} />,
  Sun: <Sun size={20} />, Camera: <Camera size={18} />, User: <User size={40} />,
  Instagram: <Instagram size={18} />, WhatsApp: <MessageCircle size={18} />, Edit: <Edit2 size={16} />,
  Lock: <Lock size={18} />, UserIn: <UserRound size={18} />
};

const SUBJECT_COLORS: Record<string, any> = {
  'default': { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', icon: 'text-indigo-500' }
};

// --- المكونات الفرعية (Inlined Components) ---
const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-md animate-fade-in">
      <div className="bg-white dark:bg-[#1e293b] w-full max-w-md rounded-t-[3rem] sm:rounded-[3rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-modal-slide-up">
        <div className="p-6 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50/30 dark:bg-slate-800/30">
          <h2 className="text-xl font-black text-slate-800 dark:text-white">{title}</h2>
          <button onClick={onClose} className="p-2.5 bg-white dark:bg-slate-800 text-slate-400 rounded-2xl border dark:border-slate-700">&times;</button>
        </div>
        <div className="p-8 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

// --- التطبيق الأساسي ---
const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<Group[]>([]);
  const [config, setConfig] = useState<UserConfig>({
    name: '', username: '', role: null, profileImage: null, darkMode: false, onboarded: false
  });

  const [authMode, setAuthMode] = useState<'selection' | 'login' | 'signup'>('selection');
  const [pendingRole, setPendingRole] = useState<UserRole | null>(null);
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [groupSearch, setGroupSearch] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  const [view, setView] = useState<'dashboard' | 'details' | 'student-results' | 'schedule'>('dashboard');
  const [activeTab, setActiveTab] = useState<'students' | 'exams'>('students');
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isExamModalOpen, setIsExamModalOpen] = useState(false);
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);

  // States for new items
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupLoc, setNewGroupLoc] = useState('');
  const [newExamTitle, setNewExamTitle] = useState('');
  const [newExamMax, setNewExamMax] = useState(100);
  const [newExamType, setNewExamType] = useState<'daily' | 'semester'>('daily');
  const [newStudentU, setNewStudentU] = useState('');
  const [newStudentN, setNewStudentN] = useState('');

  const activeGroup = useMemo(() => groups.find(g => g.id === activeGroupId), [groups, activeGroupId]);
  const selectedStudent = useMemo(() => activeGroup?.students.find(s => s.id === selectedStudentId), [activeGroup, selectedStudentId]);
  const selectedExam = useMemo(() => activeGroup?.exams.find(e => e.id === selectedExamId), [activeGroup, selectedExamId]);

  const showToast = (message: string, type: 'success' | 'error') => setToast({ message, type });

  const myResults = useMemo(() => {
    if (config.role !== 'student' || !config.username) return [];
    const results: any[] = [];
    groups.forEach(g => {
      const s = g.students.find(st => st.username === config.username.toLowerCase());
      if (s) {
        g.exams.forEach(ex => {
          const res = ex.results[s.id];
          if (res) results.push({ examTitle: ex.title, groupName: g.name, date: ex.date, grade: res.grade, maxGrade: ex.maxGrade });
        });
      }
    });
    return results;
  }, [groups, config.username, config.role]);

  const studentExamHistory = useMemo(() => {
    if (!activeGroup || !selectedStudentId) return [];
    return activeGroup.exams.map(ex => ({
      title: ex.title, date: ex.date, maxGrade: ex.maxGrade, result: ex.results[selectedStudentId]
    })).filter(h => h.result);
  }, [activeGroup, selectedStudentId]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const docRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(docRef);
        if (userDoc.exists()) {
          const userData = userDoc.data() as UserConfig;
          setConfig({ ...userData, onboarded: true });
          if (userData.darkMode) document.documentElement.classList.add('dark');
          if (userData.role === 'teacher') {
            setView('dashboard');
            onSnapshot(query(collection(db, "groups"), where("teacherUid", "==", user.uid)), snap => 
              setGroups(snap.docs.map(d => ({ id: d.id, ...d.data() } as Group)))
            );
          } else {
            setView('schedule');
            onSnapshot(query(collection(db, "groups"), where("studentUsernames", "array-contains", userData.username.toLowerCase())), snap => 
              setGroups(snap.docs.map(d => ({ id: d.id, ...d.data() } as Group)))
            );
          }
        }
      } else {
        setConfig({ name: '', username: '', role: null, profileImage: null, darkMode: false, onboarded: false });
        setAuthMode('selection');
        setGroups([]);
        setActiveGroupId(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleAuth = async () => {
    if (!authUsername || !authPassword) return showToast('يرجى ملء الحقول', 'error');
    setIsSyncing(true);
    const email = authUsername.trim().toLowerCase() + "@manasa.com";
    try {
      if (authMode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, email, authPassword);
        const userData = { name: authName, username: authUsername.trim().toLowerCase(), role: pendingRole, profileImage: null, darkMode: false, onboarded: true };
        await setDoc(doc(db, "users", cred.user.uid), userData);
        setConfig(userData);
      } else { await signInWithEmailAndPassword(auth, email, authPassword); }
      showToast('تم بنجاح', 'success');
    } catch (e) { showToast('خطأ في البيانات', 'error'); } finally { setIsSyncing(false); }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setIsSettingsOpen(false);
      showToast('تم تسجيل الخروج', 'success');
    } catch (e) {
      showToast('خطأ في تسجيل الخروج', 'error');
    }
  };

  const handleAddGroup = async () => {
    if (!newGroupName) return;
    await addDoc(collection(db, "groups"), { name: newGroupName, location: newGroupLoc, teacherUid: auth.currentUser?.uid, students: [], exams: [], schedule: [], studentUsernames: [] });
    setIsGroupModalOpen(false); setNewGroupName(''); setNewGroupLoc('');
    showToast('تم الإنشاء', 'success');
  };

  const handleAddExam = async () => {
    if (!newExamTitle || !activeGroupId) return;
    const ex: Exam = { id: Date.now().toString(), title: newExamTitle, date: new Date().toLocaleDateString('ar-EG'), maxGrade: newExamMax, type: newExamType, results: {} };
    await updateDoc(doc(db, "groups", activeGroupId), { exams: arrayUnion(ex) });
    setIsExamModalOpen(false); setNewExamTitle('');
    showToast('تمت إضافة الامتحان', 'success');
  };

  const handleAddStudent = async () => {
    if (!newStudentU || !activeGroupId) return;
    const s: Student = { id: Date.now().toString(), name: newStudentN || 'طالب جديد', username: newStudentU.toLowerCase(), paid: false, starred: false };
    await updateDoc(doc(db, "groups", activeGroupId), { students: arrayUnion(s), studentUsernames: arrayUnion(s.username) });
    setIsStudentModalOpen(false); setNewStudentU(''); setNewStudentN('');
    showToast('تمت الإضافة', 'success');
  };

  const updateGrade = async (examId: string, studentId: string, grade: number, status: any) => {
    if (!activeGroup) return;
    const updated = activeGroup.exams.map(ex => ex.id === examId ? { ...ex, results: { ...ex.results, [studentId]: { studentId, grade, status } } } : ex);
    await updateDoc(doc(db, "groups", activeGroup.id), { exams: updated });
  };

  if (loading) return <div className="h-screen flex items-center justify-center font-black text-indigo-600 animate-pulse text-2xl">منصة الأستاذ...</div>;

  if (!config.onboarded) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-8 text-center login-bg">
        <div className="w-24 h-24 bg-indigo-600 rounded-[2.5rem] flex items-center justify-center text-white shadow-2xl mb-8 transform hover:scale-110 transition-transform">{ICONS.GraduationCap}</div>
        {authMode === 'selection' ? (
          <div className="w-full max-w-sm space-y-6 animate-fade-in">
            <h1 className="text-4xl font-black mb-2 dark:text-white">منصة الأستاذ</h1>
            <div className="text-xs font-bold text-slate-400 mb-8 uppercase tracking-widest">بالتعاون مع الاستاذ عمار</div>
            <button onClick={() => { setPendingRole('teacher'); setAuthMode('login'); }} className="w-full py-6 bg-indigo-600 text-white rounded-[2rem] font-black text-lg shadow-xl shadow-indigo-200 dark:shadow-none active:scale-95 transition-all flex items-center justify-center gap-3">
              {ICONS.UserIn} دخول (مدرس)
            </button>
            <button onClick={() => { setPendingRole('student'); setAuthMode('login'); }} className="w-full py-6 bg-white dark:bg-slate-800 border-2 border-indigo-100 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 rounded-[2rem] font-black text-lg active:scale-95 transition-all flex items-center justify-center gap-3">
              {ICONS.GraduationCap} دخول (طالب)
            </button>
            <div className="mt-8 text-[10px] font-black text-slate-400 opacity-50 uppercase">تم التطوير بواسطة حسنين</div>
          </div>
        ) : (
          <div className="w-full max-w-sm space-y-6 animate-fade-in">
            <div className="space-y-2">
              <h2 className="text-3xl font-black dark:text-white tracking-tighter">{authMode === 'login' ? 'تسجيل الدخول' : 'حساب جديد'}</h2>
              <div className="text-[10px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 dark:bg-indigo-900/30 px-4 py-1.5 rounded-full inline-block">رتبة: {pendingRole === 'teacher' ? 'مدرس' : 'طالب'}</div>
            </div>
            
            <div className="space-y-4">
              {authMode === 'signup' && (
                <div className="relative group">
                  <div className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors">{ICONS.UserIn}</div>
                  <input type="text" placeholder="الاسم الكامل" className="field !pr-14" value={authName} onChange={e => setAuthName(e.target.value)} />
                </div>
              )}
              
              <div className="relative group">
                <div className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors">{ICONS.UserIn}</div>
                <input type="text" placeholder="اسم المستخدم" className="field ltr-input !pr-14" value={authUsername} onChange={e => setAuthUsername(e.target.value.replace(/[^a-z0-9_]/g, ''))} />
              </div>

              <div className="relative group">
                <div className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors">{ICONS.Lock}</div>
                <input type="password" placeholder="كلمة المرور" className="field ltr-input !pr-14" value={authPassword} onChange={e => setAuthPassword(e.target.value)} />
              </div>

              <button disabled={isSyncing} onClick={handleAuth} className="w-full py-5 bg-indigo-600 text-white rounded-[2.2rem] font-black shadow-xl shadow-indigo-100 dark:shadow-none active:scale-95 transition-all flex items-center justify-center gap-2">
                {isSyncing ? <RefreshCw className="animate-spin" size={20} /> : 'تأكيد الدخول'}
              </button>
            </div>

            <div className="space-y-2 pt-2">
              <button onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="text-sm font-black text-indigo-500 block mx-auto py-2 hover:underline transition-all">
                {authMode === 'login' ? 'ليس لديك حساب؟ سجل الآن' : 'لديك حساب بالفعل؟ سجل دخول'}
              </button>
              <button onClick={() => setAuthMode('selection')} className="text-xs font-bold text-slate-400 block mx-auto px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl active:scale-90 transition-all">
                رجوع للخلف
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${config.darkMode ? 'dark' : ''} bg-[#F8FAFC] dark:bg-slate-950 pb-28 transition-colors duration-500`}>
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-5 flex items-center justify-between border-b dark:border-slate-800">
        <div className="flex items-center gap-4">
          {config.role === 'teacher' && view !== 'dashboard' && <button onClick={() => setView('dashboard')} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl rotate-180 text-slate-400">{ICONS.ChevronLeft}</button>}
          <div className="flex items-center gap-3">
             <div onClick={() => setIsSettingsOpen(true)} className="w-11 h-11 rounded-2xl bg-indigo-100 overflow-hidden cursor-pointer">{config.profileImage ? <img src={config.profileImage} className="w-full h-full object-cover" /> : <div className="flex items-center justify-center h-full text-indigo-600">{ICONS.User}</div>}</div>
             <div><h2 className="font-black text-slate-900 dark:text-white leading-none text-sm">{config.name}</h2><span className="text-[10px] font-black text-indigo-500 uppercase">{config.role === 'teacher' ? 'الأستاذ' : 'طالب'}</span></div>
          </div>
        </div>
        <button onClick={() => setIsSettingsOpen(true)} className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-400 rounded-2xl">{ICONS.Settings}</button>
      </header>

      <main className="max-w-4xl mx-auto p-4 lg:p-6">
        {config.role === 'teacher' ? (
          view === 'dashboard' ? (
            <div className="space-y-6">
              <div className="flex justify-between items-center px-2">
                <h3 className="text-2xl font-black dark:text-white tracking-tighter">مجموعاتي</h3>
                <button onClick={() => setIsGroupModalOpen(true)} className="p-4 bg-indigo-600 text-white rounded-2xl shadow-lg hover:scale-110 active:scale-95 transition-all">{ICONS.Plus}</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {groups.map(g => (
                  <div key={g.id} onClick={() => { setActiveGroupId(g.id); setView('details'); }} className="bg-white dark:bg-slate-900 p-7 rounded-[2.5rem] border dark:border-slate-800 hover:shadow-2xl transition-all cursor-pointer relative group">
                    <div className="flex justify-between items-start mb-6">
                        <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl flex items-center justify-center text-indigo-600">{ICONS.Users}</div>
                        <span className="text-2xl font-black text-slate-100 dark:text-slate-800">#{g.students.length}</span>
                    </div>
                    <h4 className="font-black text-xl mb-1 dark:text-white">{g.name}</h4>
                    <p className="text-xs text-slate-400 font-bold flex items-center gap-1.5">{ICONS.MapPin} {g.location}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : view === 'details' ? (
            <div className="space-y-6">
               <div className="bg-white dark:bg-slate-900 p-7 rounded-[2.5rem] shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div className="text-right w-full sm:w-auto"><h3 className="text-3xl font-black text-indigo-600">{activeGroup?.name}</h3><p className="text-sm text-slate-400">{activeGroup?.location}</p></div>
                  <div className="flex p-1.5 bg-slate-50 dark:bg-slate-800 rounded-[1.8rem] w-full sm:w-auto">
                    <button onClick={() => setActiveTab('students')} className={`flex-1 px-4 py-3 rounded-[1.4rem] font-black text-xs ${activeTab === 'students' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400'}`}>الطلاب</button>
                    <button onClick={() => setActiveTab('exams')} className={`flex-1 px-4 py-3 rounded-[1.4rem] font-black text-xs ${activeTab === 'exams' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400'}`}>الامتحانات</button>
                  </div>
               </div>
               {activeTab === 'students' ? (
                 <div className="space-y-5">
                    <button onClick={() => setIsStudentModalOpen(true)} className="w-full p-5 bg-indigo-600 text-white rounded-[1.8rem] font-black shadow-lg flex items-center justify-center gap-2">{ICONS.Plus} إضافة طالب</button>
                    {activeGroup?.students.map(s => (
                       <div key={s.id} onClick={() => setSelectedStudentId(s.id)} className="bg-white dark:bg-slate-900 p-6 rounded-[2.2rem] flex items-center justify-between hover:shadow-xl transition-all cursor-pointer border dark:border-slate-800">
                          <div className="flex items-center gap-5">
                             <div className="text-right"><h5 className="font-black text-slate-800 dark:text-white text-lg">{s.name}</h5><span className={`text-[9px] font-black px-2 py-0.5 rounded-lg ${s.paid ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>{s.paid ? 'مدفوع' : 'قسط'}</span></div>
                          </div>
                       </div>
                    ))}
                 </div>
               ) : (
                 <div className="space-y-4">
                    <button onClick={() => setIsExamModalOpen(true)} className="w-full p-5 bg-indigo-600 text-white rounded-[1.8rem] font-black shadow-lg">إضافة امتحان جديد</button>
                    {activeGroup?.exams.map(ex => (
                       <div key={ex.id} onClick={() => { setSelectedExamId(ex.id); setView('student-results'); }} className="bg-white dark:bg-slate-900 p-6 rounded-[2.2rem] flex justify-between items-center border dark:border-slate-800 cursor-pointer">
                          <div><h5 className="font-black text-lg dark:text-white mb-1">{ex.title}</h5><span className="text-[10px] text-slate-400 font-bold">{ex.date} | {ex.maxGrade} درجة</span></div>
                          <button className="p-4 bg-slate-50 dark:bg-slate-800 text-slate-400 rounded-2xl">{ICONS.ChevronLeft}</button>
                       </div>
                    ))}
                 </div>
               )}
            </div>
          ) : (
             /* Student Results Entry View */
             <div className="space-y-6">
                <div className="flex items-center gap-4 px-2">
                   <button onClick={() => setView('details')} className="p-3 bg-white dark:bg-slate-800 rounded-2xl rotate-180 text-slate-400 shadow-sm">{ICONS.ChevronLeft}</button>
                   <h3 className="text-2xl font-black text-indigo-600">{selectedExam?.title}</h3>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border dark:border-slate-800 overflow-hidden shadow-sm">
                   {activeGroup?.students.map((s, idx) => {
                     const res = selectedExam?.results[s.id];
                     return (
                       <div key={s.id} className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-b last:border-0 dark:border-slate-800">
                          <div className="flex items-center gap-4">
                             <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black bg-slate-50 dark:bg-slate-800 text-slate-400 text-xs">#{idx+1}</div>
                             <h6 className="font-black dark:text-white">{s.name}</h6>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl">
                              <button onClick={() => updateGrade(selectedExam!.id, s.id, res?.grade || 0, 'present')} className={`px-4 py-2 rounded-xl text-[10px] font-black ${res?.status === 'present' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>حاضر</button>
                              <button onClick={() => updateGrade(selectedExam!.id, s.id, 0, 'absent')} className={`px-4 py-2 rounded-xl text-[10px] font-black ${res?.status === 'absent' ? 'bg-rose-500 text-white shadow-lg' : 'text-slate-400'}`}>غائب</button>
                            </div>
                            {res?.status === 'present' && <input type="number" className="w-20 field !py-2.5 !px-4 text-center ltr-input" placeholder="الدرجة" value={res?.grade || ''} onChange={e => updateGrade(selectedExam!.id, s.id, parseInt(e.target.value) || 0, 'present')} />}
                          </div>
                       </div>
                     );
                   })}
                </div>
             </div>
          )
        ) : (
          /* Student Interface */
          <div className="space-y-8">
             <h3 className="text-2xl font-black dark:text-white px-2">نتائجي ودرجاتي</h3>
             <div className="space-y-4">
                {myResults.length === 0 ? (
                  <div className="p-16 text-center bg-white dark:bg-slate-900 rounded-[2.5rem] border-2 border-dashed dark:border-slate-800 text-slate-400 font-bold">لا توجد نتائج حالياً.</div>
                ) : (
                  myResults.map((r, i) => (
                    <div key={i} className="bg-white dark:bg-slate-900 p-6 rounded-[2.2rem] flex justify-between items-center shadow-sm border dark:border-slate-800">
                        <div><h4 className="font-black dark:text-white">{r.examTitle}</h4><p className="text-[10px] text-slate-400">{r.groupName} | {r.date}</p></div>
                        <div className="text-2xl font-black text-indigo-600">{r.grade} <span className="text-xs text-slate-300">/ {r.maxGrade}</span></div>
                    </div>
                  ))
                )}
             </div>
          </div>
        )}
      </main>

      {/* --- Modals --- */}
      <Modal isOpen={!!selectedStudentId} onClose={() => setSelectedStudentId(null)} title="بيانات الطالب">
         {selectedStudent && (
           <div className="space-y-6">
              <div className="flex items-center gap-6 p-4 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-[2rem]">
                 <div className="w-20 h-20 bg-white dark:bg-slate-800 rounded-3xl flex items-center justify-center text-3xl text-indigo-600 border shadow-sm">{ICONS.User}</div>
                 <div className="flex-1">
                    <h3 className="text-xl font-black dark:text-white mb-2">{selectedStudent.name}</h3>
                    <button onClick={() => { const n = window.prompt("الاسم الجديد:", selectedStudent.name); if(n) updateDoc(doc(db, "groups", activeGroupId!), { students: activeGroup!.students.map(st => st.id === selectedStudentId ? {...st, name: n} : st) }); }} className="p-2.5 rounded-xl bg-white dark:bg-slate-800 text-slate-500 shadow-sm border dark:border-slate-700">{ICONS.Edit}</button>
                 </div>
              </div>
              <div className="space-y-3">
                <p className="text-[10px] font-black text-slate-400 px-2 uppercase tracking-widest">سجل الامتحانات</p>
                {studentExamHistory.map((h, idx) => (
                  <div key={idx} className="p-4 bg-white dark:bg-slate-800 rounded-2xl border dark:border-slate-700 flex justify-between items-center shadow-sm">
                    <div><p className="font-black text-sm dark:text-white">{h.title}</p><p className="text-[9px] text-slate-400">{h.date}</p></div>
                    <div className="text-xs font-black text-indigo-600">{h.result?.grade}/{h.maxGrade}</div>
                  </div>
                ))}
              </div>
           </div>
         )}
      </Modal>

      <Modal isOpen={isExamModalOpen} onClose={() => setIsExamModalOpen(false)} title="امتحان جديد">
         <div className="space-y-4">
            <input type="text" placeholder="عنوان الامتحان" className="field" value={newExamTitle} onChange={e => setNewExamTitle(e.target.value)} />
            <input type="number" placeholder="الدرجة القصوى" className="field" value={newExamMax} onChange={e => setNewExamMax(parseInt(e.target.value) || 100)} />
            <select className="field" value={newExamType} onChange={e => setNewExamType(e.target.value as any)}><option value="daily">يومي</option><option value="semester">فصلي</option></select>
            <button onClick={handleAddExam} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black shadow-lg shadow-indigo-500/20 transition-all active:scale-95">حفظ</button>
         </div>
      </Modal>

      <Modal isOpen={isGroupModalOpen} onClose={() => setIsGroupModalOpen(false)} title="مجموعة جديدة">
         <div className="space-y-4">
            <input type="text" placeholder="اسم المجموعة" className="field" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} />
            <input type="text" placeholder="الموقع" className="field" value={newGroupLoc} onChange={e => setNewGroupLoc(e.target.value)} />
            <button onClick={handleAddGroup} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black shadow-lg shadow-indigo-500/20 transition-all active:scale-95">حفظ</button>
         </div>
      </Modal>

      <Modal isOpen={isStudentModalOpen} onClose={() => setIsStudentModalOpen(false)} title="إضافة طالب">
         <div className="space-y-4">
            <input type="text" placeholder="اسم الطالب الكامل" className="field" value={newStudentN} onChange={e => setNewStudentN(e.target.value)} />
            <input type="text" placeholder="اسم المستخدم (English)" className="field ltr-input" value={newStudentU} onChange={e => setNewStudentU(e.target.value.toLowerCase())} />
            <button onClick={handleAddStudent} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black shadow-lg shadow-indigo-500/20 transition-all active:scale-95">ربط الطالب</button>
         </div>
      </Modal>

      <Modal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} title="الإعدادات">
         <div className="space-y-6">
            <div className="flex flex-col items-center gap-4 py-4 border-b dark:border-slate-800">
                <div className="w-24 h-24 rounded-[2rem] bg-indigo-100 overflow-hidden shadow-xl flex items-center justify-center text-indigo-600 border-4 border-white dark:border-slate-800">{config.profileImage ? <img src={config.profileImage} className="w-full h-full object-cover" /> : <div className="scale-150">{ICONS.User}</div>}</div>
                <div className="text-center"><h4 className="font-black text-slate-800 dark:text-white">{config.name}</h4><p className="text-[10px] text-slate-400 uppercase tracking-widest">@{config.username}</p></div>
            </div>
            <button onClick={() => window.open('https://wa.me/9647715729997')} className="w-full p-5 bg-emerald-50 text-emerald-600 rounded-3xl flex justify-between items-center font-black hover:bg-emerald-100 transition-all"><span>واتساب الاستاذ</span>{ICONS.WhatsApp}</button>
            <button onClick={() => window.open('https://instagram.com/8o7y')} className="w-full p-5 bg-indigo-50 text-indigo-600 rounded-3xl flex justify-between items-center font-black hover:bg-indigo-100 transition-all"><span>تواصل مع المطور</span>{ICONS.Instagram}</button>
            <button onClick={handleSignOut} className="w-full p-5 bg-rose-50 text-rose-600 rounded-3xl flex justify-between items-center font-black hover:bg-rose-100 transition-all"><span>تسجيل الخروج</span>{ICONS.LogOut}</button>
         </div>
      </Modal>

      <nav className="fixed bottom-8 left-8 right-8 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border dark:border-slate-800 p-3 rounded-[3rem] shadow-2xl flex justify-around items-center z-50">
        {config.role === 'teacher' ? (
          <button onClick={() => setView('dashboard')} className={`flex-1 flex flex-col items-center gap-1 py-4 rounded-[2.5rem] transition-all ${view === 'dashboard' ? 'bg-indigo-600 text-white shadow-xl scale-105' : 'text-slate-400'}`}>{ICONS.Users} <span className="text-[10px] font-black uppercase">المجموعات</span></button>
        ) : (
          <button onClick={() => setView('student-results')} className={`flex-1 flex flex-col items-center gap-1 py-4 rounded-[2.5rem] transition-all ${view === 'student-results' ? 'bg-amber-600 text-white shadow-xl scale-105' : 'text-slate-400'}`}>{ICONS.ClipboardList} <span className="text-[10px] font-black uppercase">النتائج</span></button>
        )}
      </nav>

      <style>{`
        .field { width: 100%; padding: 18px 24px; border: 2.5px solid #f1f5f9; border-radius: 2rem; outline: none; font-weight: 800; background: white; text-align: right; transition: all 0.3s; }
        .field:focus { border-color: #4f46e5; box-shadow: 0 10px 20px -10px rgba(79, 70, 229, 0.1); }
        .dark .field { background: #1e293b; border-color: #334155; color: white; }
        .ltr-input { direction: ltr; text-align: left; }
        .login-bg { background-image: radial-gradient(circle at 2px 2px, #f1f5f9 1px, transparent 0); background-size: 24px 24px; }
        .dark .login-bg { background-image: radial-gradient(circle at 2px 2px, #1e293b 1px, transparent 0); }
      `}</style>
    </div>
  );
};

export default App;
