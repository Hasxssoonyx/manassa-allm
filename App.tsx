
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Group, Student, Exam, ExamResult, 
  UserConfig, UserRole
} from './types';
import { ICONS } from './constants';
import Modal from './components/Modal';

// استيراد Firebase من الملف المركزي لضمان وحدة التهيئة
import { auth, db, firebaseConfig } from './firebase.ts';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  onAuthStateChanged,
  signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  collection, 
  query, 
  where, 
  onSnapshot,
  arrayUnion,
  addDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const Toast: React.FC<{ 
  message: string; 
  type: 'success' | 'error'; 
  onClose: () => void;
}> = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000); 
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-4 px-6 py-4 rounded-[1.8rem] shadow-2xl backdrop-blur-xl border animate-toast-in transition-all max-w-[90vw] ${
      type === 'success' ? 'bg-emerald-600/90 border-emerald-400 text-white' : 'bg-rose-600/90 border-rose-400 text-white'
    }`}>
      <div className="flex items-center gap-3">
        <div className="bg-white/20 p-2 rounded-xl shrink-0">
          {type === 'success' ? ICONS.Check : ICONS.Ban}
        </div>
        <p className="font-black text-sm leading-snug">{message}</p>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [config, setConfig] = useState<UserConfig>({
    name: '', username: '', role: null, profileImage: null, darkMode: false, onboarded: false
  });

  const [authMode, setAuthMode] = useState<'selection' | 'login' | 'signup'>('selection');
  const [pendingRole, setPendingRole] = useState<UserRole | null>(null);
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [view, setView] = useState<'dashboard' | 'details' | 'student-results'>('dashboard');
  const [activeTab, setActiveTab] = useState<'students' | 'exams'>('students');
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupLocation, setNewGroupLocation] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentUsername, setNewStudentUsername] = useState(''); 

  const activeGroup = useMemo(() => groups.find(g => g.id === activeGroupId), [groups, activeGroupId]);

  const myResults = useMemo(() => {
    if (config.role !== 'student') return [];
    const results: any[] = [];
    groups.forEach(g => {
      const sInG = g.students.find(s => s.username.toLowerCase() === config.username.toLowerCase());
      if (sInG) {
        g.exams.forEach(ex => {
          if (ex.results[sInG.id]) {
            results.push({ groupName: g.name, examTitle: ex.title, ...ex.results[sInG.id], maxGrade: ex.maxGrade, date: ex.date });
          }
        });
      }
    });
    return results;
  }, [groups, config.username, config.role]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data() as UserConfig;
            setConfig({ ...userData, onboarded: true });
            if (userData.darkMode) document.documentElement.classList.add('dark');
            setView(userData.role === 'teacher' ? 'dashboard' : 'student-results');
            
            const gQuery = userData.role === 'teacher' 
              ? query(collection(db, "groups"), where("teacherUid", "==", user.uid))
              : query(collection(db, "groups"), where("studentUsernames", "array-contains", userData.username.toLowerCase()));
            
            const unsubGroups = onSnapshot(gQuery, (snap) => {
              setGroups(snap.docs.map(d => ({ id: d.id, ...d.data() } as Group)));
            });
            return () => unsubGroups();
          } else {
            await signOut(auth);
            setAuthMode('selection');
          }
        } catch (err) {
          console.error("Firebase Sync Error:", err);
        }
      } else {
        setConfig({ name: '', username: '', role: null, profileImage: null, darkMode: false, onboarded: false });
        setAuthMode('selection');
      }
    });
    return () => unsubscribeAuth();
  }, []);

  const showToast = (message: string, type: 'success' | 'error') => setToast({ message, type });

  const handleAuth = async () => {
    if (!authUsername || !authPassword) { 
      showToast('يرجى كتابة اسم المستخدم وكلمة المرور', 'error'); 
      return; 
    }

    // سجل التحقق من المفتاح في الكونسول كما طلبت
    console.log("Config using API Key:", firebaseConfig.apiKey);

    // تحويل اليوزر نيم لإيميل تلقائياً
    const loginEmail = authUsername.trim().toLowerCase() + "@manasa.com";
    setIsSyncing(true);

    try {
      if (authMode === 'signup') {
        if (!authName) { showToast('يرجى كتابة الاسم الكامل', 'error'); setIsSyncing(false); return; }
        
        const userCred = await createUserWithEmailAndPassword(auth, loginEmail, authPassword);
        const userData: UserConfig = {
          name: authName,
          username: authUsername.trim().toLowerCase(),
          role: pendingRole,
          profileImage: null,
          darkMode: false,
          onboarded: true
        };
        await setDoc(doc(db, "users", userCred.user.uid), userData);
        setConfig(userData);
        showToast('تم إنشاء حسابك بنجاح!', 'success');
      } else {
        await signInWithEmailAndPassword(auth, loginEmail, authPassword);
        showToast('تم تسجيل الدخول بنجاح', 'success');
      }
    } catch (e: any) {
      console.error("Firebase Auth Error Details:", e);
      let msg = 'حدث خطأ غير متوقع، يرجى المحاولة ثانية';
      
      if (e.code === 'auth/api-key-not-valid') {
        msg = 'فشل التحقق من مفتاح API. تأكد من تفعيل Identity Toolkit API في مشروعك.';
      } else if (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password') {
        msg = 'بيانات الدخول غير صحيحة، تأكد من اليوزر نيم والباسورد.';
      } else if (e.code === 'auth/email-already-in-use') {
        msg = 'اسم المستخدم هذا مسجل مسبقاً، جرب الدخول.';
      }
      
      showToast(msg, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAddStudent = async () => {
    if (!newStudentName.trim() || !newStudentUsername.trim() || !activeGroupId) return;
    setIsSyncing(true);
    try {
      const q = query(collection(db, "users"), where("username", "==", newStudentUsername.toLowerCase()), where("role", "==", "student"));
      const snap = await getDocs(q);
      if (snap.empty) { 
        showToast('هذا الطالب غير مسجل في المنصة', 'error'); 
        setIsSyncing(false); 
        return; 
      }
      
      const s: Student = { id: Date.now().toString(), name: newStudentName, username: newStudentUsername.toLowerCase(), paid: false };
      await updateDoc(doc(db, "groups", activeGroupId), {
        students: arrayUnion(s),
        studentUsernames: arrayUnion(newStudentUsername.toLowerCase())
      });
      setIsStudentModalOpen(false); setNewStudentName(''); setNewStudentUsername('');
      showToast('تم ربط الطالب بالمجموعة', 'success');
    } catch (e) { 
      showToast('خطأ في الاتصال بقاعدة البيانات', 'error'); 
    } finally { 
      setIsSyncing(false); 
    }
  };

  if (!config.onboarded) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950 flex flex-col items-center justify-center p-8 text-center animate-fade-in">
        <div className="w-24 h-24 bg-indigo-600 rounded-[2.5rem] flex items-center justify-center text-white shadow-2xl mb-6">{ICONS.GraduationCap}</div>
        {authMode === 'selection' ? (
          <div className="w-full max-w-sm space-y-6">
            <h1 className="text-3xl font-black text-slate-900 dark:text-white">منصة الأستاذ الذكية</h1>
            <div className="flex flex-col gap-4">
              <button onClick={() => { setPendingRole('teacher'); setAuthMode('login'); }} className="w-full py-6 bg-indigo-600 text-white rounded-[2rem] font-black shadow-xl active:scale-95 transition-all">دخول (مدرس)</button>
              <button onClick={() => { setPendingRole('student'); setAuthMode('login'); }} className="w-full py-6 bg-white dark:bg-slate-800 border-2 border-indigo-100 text-indigo-600 rounded-[2rem] font-black">دخول (طالب)</button>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-sm space-y-4 animate-slide-in">
            <h2 className="text-2xl font-black dark:text-white">{authMode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}</h2>
            <p className="text-[10px] text-indigo-500 font-black uppercase tracking-widest">نوع الحساب: {pendingRole === 'teacher' ? 'مدرس' : 'طالب'}</p>
            {authMode === 'signup' && <input type="text" placeholder="الاسم الكامل" className="field" value={authName} onChange={e => setAuthName(e.target.value)} />}
            <input type="text" placeholder="اسم المستخدم (English)" className="field ltr-input" value={authUsername} onChange={e => setAuthUsername(e.target.value.replace(/[^a-z0-9_]/g, ''))} />
            <input type="password" placeholder="كلمة المرور" className="field ltr-input" value={authPassword} onChange={e => setAuthPassword(e.target.value)} />
            <button disabled={isSyncing} onClick={handleAuth} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black shadow-lg flex items-center justify-center gap-2">
              {isSyncing && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}
              {authMode === 'login' ? 'دخول للمنصة' : 'إنشاء الحساب'}
            </button>
            <button onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="text-sm font-black text-indigo-500 mt-2">{authMode === 'login' ? 'ليس لديك حساب؟ سجل الآن' : 'لديك حساب بالفعل؟ ادخل'}</button>
            <button onClick={() => setAuthMode('selection')} className="block mx-auto text-xs text-slate-400 font-bold mt-4">رجوع</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${config.darkMode ? 'dark' : ''} bg-[#F8FAFC] dark:bg-slate-950 pb-28 transition-colors duration-500`}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-5 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-4">
          {config.role === 'teacher' && view === 'details' && (
            <button onClick={() => setView('dashboard')} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl rotate-180 text-slate-400">{ICONS.ChevronLeft}</button>
          )}
          <div className="flex items-center gap-3">
             <div onClick={() => setIsSettingsOpen(true)} className="w-11 h-11 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 overflow-hidden flex items-center justify-center border-2 border-white dark:border-slate-800 cursor-pointer">
                {config.profileImage ? <img src={config.profileImage} className="w-full h-full object-cover" /> : <div className="text-indigo-600">{ICONS.User}</div>}
             </div>
             <div>
                <h2 className="font-black text-slate-900 dark:text-white leading-none text-sm">{config.name}</h2>
                <span className="text-[10px] font-black text-indigo-500 uppercase">{config.role === 'teacher' ? 'الأستاذ' : 'طالب'}</span>
             </div>
          </div>
        </div>
        <button onClick={() => setIsSettingsOpen(true)} className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-400 rounded-2xl">{ICONS.Settings}</button>
      </header>

      <main className="max-w-4xl mx-auto p-4">
        {config.role === 'teacher' ? (
          view === 'dashboard' ? (
            <div className="space-y-6 animate-fade-in">
              <div className="flex justify-between items-center px-2">
                <h3 className="text-2xl font-black dark:text-white">مجموعاتي</h3>
                <button onClick={() => setIsGroupModalOpen(true)} className="p-4 bg-indigo-600 text-white rounded-2xl shadow-lg">{ICONS.Plus}</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {groups.map(g => (
                  <div key={g.id} onClick={() => { setActiveGroupId(g.id); setView('details'); }} className="bg-white dark:bg-slate-900 p-7 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 hover:shadow-2xl transition-all cursor-pointer group">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl flex items-center justify-center text-indigo-600">{ICONS.Users}</div>
                    </div>
                    <h4 className="font-black text-xl mb-1 dark:text-white">{g.name}</h4>
                    <p className="text-xs text-slate-400 font-bold">{ICONS.MapPin} {g.location}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-fade-in">
               <div className="bg-white dark:bg-slate-900 p-7 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div className="text-right w-full sm:w-auto">
                    <h3 className="text-3xl font-black text-indigo-600">{activeGroup?.name}</h3>
                    <p className="text-sm text-slate-400 font-bold">{activeGroup?.location}</p>
                  </div>
                  <div className="flex p-1.5 bg-slate-50 dark:bg-slate-800 rounded-[1.8rem] w-full sm:w-auto shadow-inner">
                    <button onClick={() => setActiveTab('students')} className={`whitespace-nowrap flex-1 px-4 py-3 rounded-[1.4rem] font-black text-xs ${activeTab === 'students' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400'}`}>الطلاب</button>
                    <button onClick={() => setActiveTab('exams')} className={`whitespace-nowrap flex-1 px-4 py-3 rounded-[1.4rem] font-black text-xs ${activeTab === 'exams' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400'}`}>الامتحانات</button>
                  </div>
               </div>
               {activeTab === 'students' && (
                 <div className="space-y-5">
                    <div className="flex gap-4">
                       <input type="text" placeholder="بحث..." className="w-full field !p-5" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                       <button onClick={() => setIsStudentModalOpen(true)} className="p-5 bg-indigo-600 text-white rounded-[1.8rem]">{ICONS.Plus}</button>
                    </div>
                    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
                       {activeGroup?.students.filter(s => s.name.includes(searchQuery)).map((s, idx) => (
                         <div key={s.id} onClick={() => setSelectedStudentId(s.id)} className="p-6 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer border-b last:border-0 dark:border-slate-800 transition-colors">
                            <div className="flex items-center gap-5">
                               <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black bg-slate-50 text-slate-400">{idx + 1}</div>
                               <div>
                                 <h5 className="font-black text-slate-800 dark:text-white">{s.name}</h5>
                                 <span className="text-[10px] text-slate-400 uppercase tracking-widest ltr-text">@{s.username}</span>
                               </div>
                            </div>
                            {ICONS.ChevronLeft}
                         </div>
                       ))}
                    </div>
                 </div>
               )}
            </div>
          )
        ) : (
          <div className="space-y-8 animate-fade-in">
             <div className="flex items-center justify-between px-2">
               <h3 className="text-2xl font-black dark:text-white">نتائجي</h3>
               <div className="bg-indigo-50 p-3 rounded-2xl text-indigo-600">{ICONS.ClipboardList}</div>
             </div>
             <div className="space-y-4">
                {myResults.length === 0 ? (
                  <div className="p-16 text-center bg-white dark:bg-slate-900 rounded-[2.5rem] border-2 border-dashed border-slate-100">
                     <p className="text-slate-400 font-bold">لا توجد درجات حالياً.</p>
                  </div>
                ) : (
                  myResults.map((res, i) => (
                    <div key={i} className="bg-white dark:bg-slate-900 p-6 rounded-[2.2rem] border border-slate-100 flex justify-between items-center shadow-sm">
                       <div>
                          <h4 className="font-black dark:text-white mb-1">{res.examTitle}</h4>
                          <div className="text-[10px] font-bold text-slate-400">{res.groupName} | {res.date}</div>
                       </div>
                       <div className="text-right">
                          <div className="text-xl font-black text-indigo-600">{res.grade} <span className="text-xs text-slate-300">/ {res.maxGrade}</span></div>
                       </div>
                    </div>
                  ))
                )}
             </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <Modal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} title="الإعدادات">
         <div className="space-y-6">
            <button onClick={async () => { 
                 const newMode = !config.darkMode;
                 setConfig({...config, darkMode: newMode});
                 if (auth.currentUser) await updateDoc(doc(db, "users", auth.currentUser.uid), { darkMode: newMode });
               }} className="w-full p-5 bg-slate-50 dark:bg-slate-800 rounded-3xl flex justify-between items-center font-black text-sm">
                  <span className="dark:text-white">الوضع الليلي</span>{config.darkMode ? ICONS.Sun : ICONS.Moon}
            </button>
            <button onClick={async () => { await signOut(auth); window.location.reload(); }} className="w-full p-5 bg-rose-50 text-rose-600 rounded-3xl flex justify-between items-center font-black text-sm"><span>تسجيل الخروج</span>{ICONS.LogOut}</button>
         </div>
      </Modal>

      <Modal isOpen={isGroupModalOpen} onClose={() => setIsGroupModalOpen(false)} title="إنشاء مجموعة">
         <div className="space-y-4">
            <input type="text" placeholder="اسم المجموعة" className="field" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} />
            <input type="text" placeholder="الموقع" className="field" value={newGroupLocation} onChange={e => setNewGroupLocation(e.target.value)} />
            <button onClick={async () => {
              const g: any = { name: newGroupName, location: newGroupLocation, teacherUid: auth.currentUser?.uid, schedule: [], students: [], exams: [], studentUsernames: [] };
              await addDoc(collection(db, "groups"), g);
              setIsGroupModalOpen(false); setNewGroupName(''); setNewGroupLocation('');
              showToast('تمت إضافة المجموعة بنجاح', 'success');
            }} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black shadow-lg">تأكيد</button>
         </div>
      </Modal>

      <Modal isOpen={isStudentModalOpen} onClose={() => setIsStudentModalOpen(false)} title="إضافة طالب">
         <div className="space-y-4">
            <input type="text" placeholder="الاسم الكامل" className="field" value={newStudentName} onChange={e => setNewStudentName(e.target.value)} />
            <input type="text" placeholder="يوزر الطالب (English)" className="field ltr-input" value={newStudentUsername} onChange={e => setNewStudentUsername(e.target.value.replace(/[^a-z0-9_]/g, ''))} />
            <button disabled={isSyncing} onClick={handleAddStudent} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black shadow-lg">ربط الطالب</button>
         </div>
      </Modal>

      <nav className="fixed bottom-8 left-8 right-8 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-100 dark:border-slate-800 p-3 rounded-[3rem] shadow-2xl flex justify-around items-center z-50">
        <button onClick={() => setView('dashboard')} className={`flex-1 flex flex-col items-center gap-1 py-4 rounded-[2.5rem] transition-all ${view === 'dashboard' ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-400'}`}>{ICONS.Users} <span className="text-[10px] font-black uppercase">الرئيسية</span></button>
        <button onClick={() => setView('student-results')} className={`flex-1 flex flex-col items-center gap-1 py-4 rounded-[2.5rem] transition-all ${view === 'student-results' ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-400'}`}>{ICONS.ClipboardList} <span className="text-[10px] font-black uppercase">النتائج</span></button>
      </nav>

      <style>{`
        @keyframes toast-in { from { transform: translate(-50%, -100%); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
        .animate-toast-in { animation: toast-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .field { width: 100%; padding: 18px 24px; border: 2.5px solid #f1f5f9; border-radius: 1.8rem; outline: none; font-weight: 800; font-size: 15px; background: white; text-align: right; }
        .dark .field { background: #1e293b; border-color: #334155; color: white; }
        .ltr-input { direction: ltr; text-align: left; }
      `}</style>
    </div>
  );
};

export default App;
