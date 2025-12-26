
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

// --- تجاوز مشكلة الـ reCAPTCHA برمجياً ---
(window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;

import { auth, db } from './firebase.ts';
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
  addDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const formatTime12h = (timeStr: string) => {
  if (!timeStr) return '';
  try {
    const [hours, minutes] = timeStr.split(':');
    let h = parseInt(hours);
    const ampm = h >= 12 ? 'م' : 'ص';
    h = h % 12 || 12;
    return `${h}:${minutes} ${ampm}`;
  } catch (e) { return timeStr; }
};

const Toast: React.FC<{ message: string; type: 'success' | 'error'; onClose: () => void }> = ({ message, type, onClose }) => {
  useEffect(() => { const timer = setTimeout(onClose, 4000); return () => clearTimeout(timer); }, [onClose]);
  return (
    <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-4 px-6 py-4 rounded-[1.8rem] shadow-2xl backdrop-blur-xl border animate-toast-in ${
      type === 'success' ? 'bg-emerald-600/90 border-emerald-400 text-white' : 'bg-rose-600/90 border-rose-400 text-white'
    }`}>
      <div className="bg-white/20 p-2 rounded-xl">{type === 'success' ? ICONS.Check : ICONS.Ban}</div>
      <p className="font-black text-sm">{message}</p>
    </div>
  );
};

const App: React.FC = () => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [studentLectures, setStudentLectures] = useState<StudentLecture[]>([]);
  const [studentHomeworks, setStudentHomeworks] = useState<StudentHomework[]>([]);
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
  const [view, setView] = useState<'dashboard' | 'details' | 'schedule' | 'homework' | 'teacher-weekly' | 'student-results'>('dashboard');
  const [activeTab, setActiveTab] = useState<'students' | 'exams' | 'group-schedule'>('students');
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [isExamModalOpen, setIsExamModalOpen] = useState(false);
  const [isAddGroupScheduleModalOpen, setIsAddGroupScheduleModalOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [isAddLectureModalOpen, setIsAddLectureModalOpen] = useState(false);
  const [isAddHomeworkModalOpen, setIsAddHomeworkModalOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [tempNote, setTempNote] = useState('');

  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupLocation, setNewGroupLocation] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentUsername, setNewStudentUsername] = useState('');
  const [newExamTitle, setNewExamTitle] = useState('');
  const [newExamMaxGrade, setNewExamMaxGrade] = useState(100);
  const [newExamType, setNewExamType] = useState<'daily' | 'semester'>('daily');
  const [newGSched, setNewGSched] = useState<{day: DayOfWeek, time: string}>({day: 'السبت', time: ''});
  const [itemToDelete, setItemToDelete] = useState<{ id: string; type: string } | null>(null);

  const activeGroup = useMemo(() => groups.find(g => g.id === activeGroupId), [groups, activeGroupId]);
  const selectedStudent = useMemo(() => activeGroup?.students.find(s => s.id === selectedStudentId), [activeGroup, selectedStudentId]);
  const selectedExam = useMemo(() => activeGroup?.exams.find(e => e.id === selectedExamId), [activeGroup, selectedExamId]);

  const filteredGroups = useMemo(() => {
    return groups.filter(g => g.name.toLowerCase().includes(groupSearch.toLowerCase()) || g.location.toLowerCase().includes(groupSearch.toLowerCase()));
  }, [groups, groupSearch]);

  const studentExamHistory = useMemo(() => {
    if (!activeGroup || !selectedStudentId) return [];
    return activeGroup.exams.map(ex => ({
      title: ex.title,
      date: ex.date,
      maxGrade: ex.maxGrade,
      result: ex.results[selectedStudentId]
    })).filter(h => h.result);
  }, [activeGroup, selectedStudentId]);

  // Fix: Adding missing myResults calculation for student view across multiple groups
  const myResults = useMemo(() => {
    if (config.role !== 'student' || !config.username) return [];
    const results: any[] = [];
    groups.forEach(group => {
      const studentInGroup = group.students.find(s => s.username === config.username.toLowerCase());
      if (studentInGroup) {
        group.exams.forEach(exam => {
          const res = exam.results[studentInGroup.id];
          if (res) {
            results.push({
              examTitle: exam.title,
              groupName: group.name,
              date: exam.date,
              grade: res.grade,
              maxGrade: exam.maxGrade
            });
          }
        });
      }
    });
    return results;
  }, [groups, config.username, config.role]);

  const showToast = (message: string, type: 'success' | 'error') => setToast({ message, type });

  const getStudentStats = (studentId: string) => {
    const stats = { present: 0, absent: 0, excused: 0 };
    if (!activeGroup) return stats;
    activeGroup.exams.forEach(ex => {
      const res = ex.results[studentId];
      if (res) {
        if (res.status === 'present') stats.present++;
        else if (res.status === 'absent') stats.absent++;
        else if (res.status === 'excused') stats.excused++;
      }
    });
    return stats;
  };

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
            const qG = query(collection(db, "groups"), where("teacherUid", "==", user.uid));
            onSnapshot(qG, snap => setGroups(snap.docs.map(d => ({ id: d.id, ...d.data() } as Group))));
          } else {
            setView('schedule');
            const qG = query(collection(db, "groups"), where("studentUsernames", "array-contains", userData.username.toLowerCase()));
            onSnapshot(qG, snap => setGroups(snap.docs.map(d => ({ id: d.id, ...d.data() } as Group))));
          }
        } else { await signOut(auth); setAuthMode('selection'); }
      } else {
        setConfig({ name: '', username: '', role: null, profileImage: null, darkMode: false, onboarded: false });
        setAuthMode('selection');
      }
    });
    return () => unsub();
  }, []);

  const handleAuth = async () => {
    if (!authUsername || !authPassword) return showToast('يرجى ملء الحقول', 'error');
    if (authUsername.length < 4 || authUsername.length > 12) return showToast('اسم المستخدم يجب أن يكون بين 4 و 12 حرفاً', 'error');
    setIsSyncing(true);
    const email = authUsername.trim().toLowerCase() + "@manasa.com";
    try {
      if (authMode === 'signup') {
        if (!authName) { setIsSyncing(false); return showToast('يرجى كتابة الاسم الكامل', 'error'); }
        const cred = await createUserWithEmailAndPassword(auth, email, authPassword);
        const userData = { name: authName, username: authUsername.trim().toLowerCase(), role: pendingRole, profileImage: null, darkMode: false, onboarded: true };
        await setDoc(doc(db, "users", cred.user.uid), userData);
        setConfig(userData);
      } else {
        await signInWithEmailAndPassword(auth, email, authPassword);
      }
      showToast('تم بنجاح', 'success');
    } catch (e) { showToast('خطأ في البيانات أو المستخدم موجود مسبقاً', 'error'); } finally { setIsSyncing(false); }
  };

  const handleAddGroup = async () => {
    if (!newGroupName || !newGroupLocation) return;
    await addDoc(collection(db, "groups"), { name: newGroupName, location: newGroupLocation, teacherUid: auth.currentUser?.uid, students: [], exams: [], schedule: [], studentUsernames: [] });
    setIsGroupModalOpen(false); setNewGroupName(''); setNewGroupLocation('');
    showToast('تم إنشاء المجموعة', 'success');
  };

  const handleAddStudent = async () => {
    if (!newStudentUsername || !activeGroupId) return;
    setIsSyncing(true);
    const q = query(collection(db, "users"), where("username", "==", newStudentUsername.toLowerCase()), where("role", "==", "student"));
    const snap = await getDocs(q);
    if (snap.empty) { showToast('الطالب غير مسجل بالمنصة', 'error'); setIsSyncing(false); return; }
    const s: Student = { id: Date.now().toString(), name: newStudentName || 'طالب جديد', username: newStudentUsername.toLowerCase(), paid: false, starred: false, notes: '' };
    await updateDoc(doc(db, "groups", activeGroupId), { students: arrayUnion(s), studentUsernames: arrayUnion(s.username) });
    setIsStudentModalOpen(false); setIsSyncing(false);
    showToast('تمت إضافة الطالب للمجموعة', 'success');
  };

  const handleAddExam = async () => {
    if (!newExamTitle || !activeGroupId) return;
    const maxVal = Math.min(newExamMaxGrade, 100);
    const newExam: Exam = {
      id: Date.now().toString(), title: newExamTitle, date: new Date().toLocaleDateString('ar-EG'),
      maxGrade: maxVal, type: newExamType, results: {}
    };
    await updateDoc(doc(db, "groups", activeGroupId), { exams: arrayUnion(newExam) });
    setIsExamModalOpen(false); setNewExamTitle('');
    showToast('تمت إضافة الامتحان', 'success');
  };

  const handleEditStudentName = async () => {
    if (!activeGroup || !selectedStudentId) return;
    const newName = window.prompt("أدخل الاسم الجديد للطالب:", selectedStudent?.name);
    if (newName && newName.trim()) {
      const updated = activeGroup.students.map(s => s.id === selectedStudentId ? { ...s, name: newName } : s);
      await updateDoc(doc(db, "groups", activeGroup.id), { students: updated });
      showToast('تم تحديث اسم الطالب بنجاح', 'success');
    }
  };

  const updateGrade = async (examId: string, studentId: string, grade: number, status: any) => {
    if (!activeGroup) return;
    const gradeVal = Math.min(grade, 100);
    const updatedExams = activeGroup.exams.map(ex => ex.id === examId ? { ...ex, results: { ...ex.results, [studentId]: { studentId, grade: gradeVal, status } } } : ex);
    await updateDoc(doc(db, "groups", activeGroup.id), { exams: updatedExams });
  };

  const toggleStar = async (studentId: string) => {
    if (!activeGroup) return;
    const updated = activeGroup.students.map(s => s.id === studentId ? { ...s, starred: !s.starred } : s);
    await updateDoc(doc(db, "groups", activeGroup.id), { students: updated });
  };

  const togglePayment = async (studentId: string) => {
    if (!activeGroup) return;
    const updated = activeGroup.students.map(s => s.id === studentId ? { ...s, paid: !s.paid } : s);
    await updateDoc(doc(db, "groups", activeGroup.id), { students: updated });
  };

  const handleProfilePicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        setConfig(prev => ({ ...prev, profileImage: base64 }));
        if (auth.currentUser) await updateDoc(doc(db, "users", auth.currentUser.uid), { profileImage: base64 });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateName = async () => {
    const newName = window.prompt("أدخل اسمك الجديد:", config.name);
    if (newName && newName.trim()) {
      setConfig(prev => ({ ...prev, name: newName }));
      if (auth.currentUser) await updateDoc(doc(db, "users", auth.currentUser.uid), { name: newName });
      showToast('تم تحديث الاسم', 'success');
    }
  };

  const handleSignOut = async () => {
    if (window.confirm("هل أنت متأكد من رغبتك في تسجيل الخروج؟")) {
      await signOut(auth);
      window.location.reload();
    }
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    const { id, type } = itemToDelete;
    if (type === 'group') { await deleteDoc(doc(db, "groups", id)); setView('dashboard'); }
    else if (activeGroupId) {
       const groupRef = doc(db, "groups", activeGroupId);
       if (type === 'student') {
          const updatedS = activeGroup?.students.filter(s => s.id !== id);
          const updatedU = activeGroup?.studentUsernames.filter(u => u !== selectedStudent?.username);
          await updateDoc(groupRef, { students: updatedS, studentUsernames: updatedU });
       } else if (type === 'exam') {
          const updated = activeGroup?.exams.filter(e => e.id !== id);
          await updateDoc(groupRef, { exams: updated });
       }
    }
    setIsConfirmDeleteOpen(false); setItemToDelete(null); showToast('تم الحذف بنجاح', 'success');
  };

  if (!config.onboarded) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-8 animate-fade-in text-center relative overflow-hidden login-bg">
        <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-500 via-transparent to-transparent"></div>
        <div className="w-24 h-24 bg-indigo-600 rounded-[2.5rem] flex items-center justify-center text-white shadow-2xl mb-8 transform hover:scale-110 transition-transform z-10">{ICONS.GraduationCap}</div>
        {authMode === 'selection' ? (
          <div className="w-full max-w-sm space-y-6 z-10">
            <h1 className="text-4xl font-black mb-8 dark:text-white tracking-tighter">منصة الأستاذ</h1>
            <div className="text-xs font-bold text-slate-400 mb-2">بالتعاون مع الاستاذ عمار</div>
            <button onClick={() => { setPendingRole('teacher'); setAuthMode('login'); }} className="w-full py-6 bg-indigo-600 text-white rounded-[2rem] font-black text-lg shadow-xl active:scale-95 transition-all">دخول (مدرس)</button>
            <button onClick={() => { setPendingRole('student'); setAuthMode('login'); }} className="w-full py-6 bg-white dark:bg-slate-800 border-2 border-indigo-100 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 rounded-[2rem] font-black text-lg">دخول (طالب)</button>
            <div className="mt-8 text-[10px] font-black text-slate-400 opacity-50 uppercase tracking-widest">تم التطوير بواسطة حسنين</div>
          </div>
        ) : (
          <div className="w-full max-w-sm space-y-4 animate-slide-in z-10">
            <h2 className="text-2xl font-black dark:text-white">{authMode === 'login' ? 'تسجيل الدخول' : 'حساب جديد'}</h2>
            <div className="text-[10px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 dark:bg-indigo-900/30 px-4 py-1.5 rounded-full inline-block mb-4">رتبة: {pendingRole === 'teacher' ? 'مدرس' : 'طالب'}</div>
            {authMode === 'signup' && <input type="text" placeholder="الاسم الكامل" className="field" value={authName} onChange={e => setAuthName(e.target.value)} />}
            <input type="text" placeholder="اسم المستخدم (English)" className="field ltr-input" value={authUsername} onChange={e => setAuthUsername(e.target.value.replace(/[^a-z0-9_]/g, ''))} />
            <input type="password" placeholder="كلمة المرور" className="field ltr-input" value={authPassword} onChange={e => setAuthPassword(e.target.value)} />
            <button disabled={isSyncing} onClick={handleAuth} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black shadow-lg flex items-center justify-center gap-2 mt-4 hover:shadow-indigo-500/20">
              {isSyncing ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : 'تأكيد'}
            </button>
            <button onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="text-sm font-black text-indigo-500 block mx-auto py-2">{authMode === 'login' ? 'سجل الآن' : 'لديك حساب؟'}</button>
            <button onClick={() => setAuthMode('selection')} className="text-xs text-slate-400 block mx-auto">رجوع</button>
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
          {config.role === 'teacher' && view !== 'dashboard' && view !== 'teacher-weekly' && (
            <button onClick={() => setView('dashboard')} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl rotate-180 text-slate-400 shadow-sm transition-transform active:scale-90">{ICONS.ChevronLeft}</button>
          )}
          <div className="flex items-center gap-3">
             <div onClick={() => setIsSettingsOpen(true)} className="w-11 h-11 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center border-2 border-white dark:border-slate-700 shadow-sm cursor-pointer text-indigo-600 overflow-hidden">
                {config.profileImage ? <img src={config.profileImage} className="w-full h-full object-cover" /> : ICONS.User}
             </div>
             <div>
                <h2 className="font-black text-slate-900 dark:text-white leading-none text-sm">{config.name}</h2>
                <span className="text-[10px] font-black text-indigo-500 uppercase">{config.role === 'teacher' ? 'الأستاذ' : 'طالب'}</span>
             </div>
          </div>
        </div>
        <button onClick={() => setIsSettingsOpen(true)} className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-400 rounded-2xl hover:bg-indigo-50 transition-all">{ICONS.Settings}</button>
      </header>

      <main className="max-w-4xl mx-auto p-4 lg:p-6">
        {config.role === 'teacher' ? (
          view === 'dashboard' ? (
            <div className="space-y-6 animate-fade-in">
              <div className="flex flex-col gap-4 px-2">
                <div className="flex justify-between items-center">
                  <h3 className="text-2xl font-black dark:text-white tracking-tighter">مجموعاتي</h3>
                  <button onClick={() => setIsGroupModalOpen(true)} className="p-4 bg-indigo-600 text-white rounded-2xl shadow-lg hover:scale-110 active:scale-95 transition-all">{ICONS.Plus}</button>
                </div>
                <div className="relative">
                   <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">{ICONS.Search}</div>
                   <input type="text" placeholder="ابحث عن مجموعة..." className="field !pr-12 !py-4" value={groupSearch} onChange={e => setGroupSearch(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {filteredGroups.map(g => (
                  <div key={g.id} onClick={() => { setActiveGroupId(g.id); setView('details'); }} className="bg-white dark:bg-slate-900 p-7 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 hover:shadow-2xl transition-all cursor-pointer relative overflow-hidden group">
                    <div className="flex justify-between items-start mb-6">
                        <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl flex items-center justify-center text-indigo-600">{ICONS.Users}</div>
                        <div className="flex flex-col items-end gap-2">
                            <button onClick={(e) => { e.stopPropagation(); setItemToDelete({id: g.id, type: 'group'}); setIsConfirmDeleteOpen(true); }} className="p-2 text-rose-400 hover:bg-rose-50 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity">{ICONS.Trash}</button>
                            <span className="text-2xl font-black text-slate-100 dark:text-slate-800">#{g.students.length}</span>
                        </div>
                    </div>
                    <h4 className="font-black text-xl mb-1 dark:text-white">{g.name}</h4>
                    <p className="text-xs text-slate-400 font-bold flex items-center gap-1.5">{ICONS.MapPin} {g.location}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-fade-in">
               <div className="bg-white dark:bg-slate-900 p-7 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4 sticky top-24 z-40 backdrop-blur-lg">
                  <div className="text-right w-full sm:w-auto">
                    <h3 className="text-3xl font-black text-indigo-600 tracking-tight leading-none mb-1">{activeGroup?.name}</h3>
                    <p className="text-sm text-slate-400 font-bold">{activeGroup?.location}</p>
                  </div>
                  <div className="flex p-1.5 bg-slate-50 dark:bg-slate-800 rounded-[1.8rem] w-full sm:w-auto shadow-inner">
                    <button onClick={() => setActiveTab('students')} className={`flex-1 px-4 py-3 rounded-[1.4rem] font-black text-xs transition-all ${activeTab === 'students' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400'}`}>الطلاب</button>
                    <button onClick={() => setActiveTab('exams')} className={`flex-1 px-4 py-3 rounded-[1.4rem] font-black text-xs transition-all ${activeTab === 'exams' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400'}`}>الامتحانات</button>
                    <button onClick={() => setActiveTab('group-schedule')} className={`flex-1 px-4 py-3 rounded-[1.4rem] font-black text-xs transition-all ${activeTab === 'group-schedule' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400'}`}>المواعيد</button>
                  </div>
               </div>

               {activeTab === 'students' && (
                 <div className="space-y-5">
                    <div className="flex gap-4 px-2">
                       <input type="text" placeholder="ابحث عن طالب..." className="w-full field !p-5" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                       <button onClick={() => setIsStudentModalOpen(true)} className="p-5 bg-indigo-600 text-white rounded-[1.8rem] hover:bg-indigo-700 active:scale-90 transition-all">{ICONS.Plus}</button>
                    </div>
                    <div className="grid grid-cols-1 gap-4 px-1">
                       {activeGroup?.students.filter(s => s.name.includes(searchQuery)).map(s => (
                          <div key={s.id} onClick={() => setSelectedStudentId(s.id)} className="bg-white dark:bg-slate-900 p-6 rounded-[2.2rem] border border-slate-100 dark:border-slate-800 flex items-center justify-between hover:shadow-xl transition-all cursor-pointer group">
                             <div className="flex items-center gap-5">
                                <button onClick={(e) => { e.stopPropagation(); toggleStar(s.id); }} className={`p-2 transition-all ${s.starred ? 'text-amber-400 fill-amber-400 scale-110' : 'text-slate-200'}`}>{ICONS.Star}</button>
                                <div className="text-right">
                                  <h5 className="font-black text-slate-800 dark:text-white text-lg leading-none mb-1">{s.name}</h5>
                                  <div className="flex gap-2">
                                     <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg ${s.paid ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>{s.paid ? 'مدفوع' : 'قسط'}</span>
                                     <span className="text-[9px] text-slate-400 font-bold uppercase">@{s.username}</span>
                                  </div>
                                </div>
                             </div>
                             <div className="flex items-center gap-2">
                                <button onClick={(e) => { e.stopPropagation(); togglePayment(s.id); }} className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${s.paid ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>تغيير الدفع</button>
                             </div>
                          </div>
                       ))}
                    </div>
                 </div>
               )}

               {activeTab === 'exams' && (
                 <div className="space-y-4 px-2">
                    <button onClick={() => setIsExamModalOpen(true)} className="w-full p-5 bg-indigo-600 text-white rounded-[1.8rem] font-black shadow-lg">إضافة امتحان جديد</button>
                    {activeGroup?.exams.map(ex => (
                       <div key={ex.id} onClick={() => { setSelectedExamId(ex.id); setView('student-results'); }} className="bg-white dark:bg-slate-900 p-6 rounded-[2.2rem] border border-slate-100 dark:border-slate-800 flex justify-between items-center group cursor-pointer hover:border-indigo-100">
                          <div>
                             <h5 className="font-black text-lg dark:text-white mb-1">{ex.title}</h5>
                             <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                                <span className={`px-2 py-0.5 rounded-full ${ex.type === 'semester' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-600'}`}>{ex.type === 'semester' ? 'فصلي' : 'يومي'}</span>
                                {ex.date} | {ex.maxGrade} درجة
                             </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={(e) => { e.stopPropagation(); setItemToDelete({id: ex.id, type: 'exam'}); setIsConfirmDeleteOpen(true); }} className="p-2 text-rose-400 hover:bg-rose-50 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity">{ICONS.Trash}</button>
                            <button className="p-4 bg-slate-50 dark:bg-slate-800 text-slate-400 rounded-2xl">{ICONS.ChevronLeft}</button>
                          </div>
                       </div>
                    ))}
                 </div>
               )}
            </div>
          )
        ) : (
          /* Student Dashboard (Schedule/Results) */
          <div className="space-y-8 animate-fade-in pb-20">
             {view === 'schedule' ? (
                <div className="space-y-8 px-2">
                   <div className="flex justify-between items-center">
                     <h3 className="text-2xl font-black dark:text-white">جدولي الدراسي</h3>
                     <button onClick={() => setIsAddLectureModalOpen(true)} className="p-4 bg-indigo-600 text-white rounded-2xl shadow-lg">{ICONS.Plus}</button>
                   </div>
                   {DAYS.map(day => {
                     const dayS = groups.flatMap(g => g.schedule.filter(s => s.day === day).map(s => ({ id: s.id, subject: g.name, time: s.time, location: g.location, day: s.day, type: 'physical' as any, postponed: false })));
                     if (dayS.length === 0) return null;
                     return (
                       <div key={day} className="space-y-4">
                          <h4 className="text-xs font-black text-slate-400 pr-3">{day}</h4>
                          {dayS.map(l => <LectureCard key={l.id} lecture={l} onEdit={()=>{}} onDelete={()=>{}} onTogglePostponed={()=>{}} />)}
                       </div>
                     );
                   })}
                </div>
             ) : (
                <div className="space-y-8 px-2">
                   <h3 className="text-2xl font-black dark:text-white">نتائجي ودرجاتي</h3>
                   {myResults.length === 0 ? (
                        <div className="p-16 text-center bg-white dark:bg-slate-900 rounded-[2.5rem] border-2 border-dashed border-slate-100 dark:border-slate-800 text-slate-400 font-bold">لا يوجد نتائج حالياً.</div>
                   ) : (
                        myResults.map((r, i) => (
                        <div key={i} className="bg-white dark:bg-slate-900 p-6 rounded-[2.2rem] border border-slate-100 dark:border-slate-800 flex justify-between items-center shadow-sm">
                            <div>
                                <h4 className="font-black dark:text-white">{r.examTitle}</h4>
                                <p className="text-[10px] text-slate-400">{r.groupName} | {r.date}</p>
                            </div>
                            <div className="text-2xl font-black text-indigo-600">{r.grade} <span className="text-xs text-slate-300">/ {r.maxGrade}</span></div>
                        </div>
                        ))
                   )}
                </div>
             )}
          </div>
        )}

        {/* رصد الدرجات للمدرس */}
        {config.role === 'teacher' && view === 'student-results' && selectedExam && (
          <div className="space-y-6 animate-fade-in pb-20">
             <div className="flex items-center gap-4 px-2">
                <button onClick={() => setView('details')} className="p-3 bg-white dark:bg-slate-800 rounded-2xl rotate-180 text-slate-400 shadow-sm">{ICONS.ChevronLeft}</button>
                <h3 className="text-2xl font-black text-indigo-600">{selectedExam.title}</h3>
             </div>
             <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
                {activeGroup?.students.map((s, idx) => {
                  const res = selectedExam.results[s.id];
                  return (
                    <div key={s.id} className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-b last:border-0 dark:border-slate-800">
                       <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black bg-slate-50 dark:bg-slate-800 text-slate-400 text-xs">#{idx+1}</div>
                          <h6 className="font-black dark:text-white">{s.name}</h6>
                       </div>
                       <div className="flex items-center gap-4">
                         <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl">
                           <button onClick={() => updateGrade(selectedExam.id, s.id, res?.grade || 0, 'present')} className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${res?.status === 'present' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>حاضر</button>
                           <button onClick={() => updateGrade(selectedExam.id, s.id, 0, 'absent')} className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${res?.status === 'absent' ? 'bg-rose-500 text-white shadow-lg' : 'text-slate-400'}`}>غائب</button>
                           <button onClick={() => updateGrade(selectedExam.id, s.id, 0, 'excused')} className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${res?.status === 'excused' ? 'bg-amber-500 text-white shadow-lg' : 'text-slate-400'}`}>مجاز</button>
                         </div>
                         {res?.status === 'present' && <input type="number" max="100" className="w-20 field !py-2.5 !px-4 text-center ltr-input" placeholder="الدرجة" value={res?.grade || ''} onChange={e => updateGrade(selectedExam.id, s.id, Math.min(parseInt(e.target.value) || 0, 100), 'present')} />}
                       </div>
                    </div>
                  );
                })}
             </div>
          </div>
        )}
      </main>

      {/* --- Modals --- */}
      
      {/* Student Details with Exam History */}
      <Modal isOpen={!!selectedStudentId} onClose={() => setSelectedStudentId(null)} title="بيانات الطالب">
         {selectedStudent && (
           <div className="space-y-6">
              <div className="flex items-center gap-6 p-4 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-[2rem] border border-indigo-100 dark:border-indigo-900/30">
                 <div className="w-20 h-20 bg-white dark:bg-slate-800 rounded-3xl flex items-center justify-center text-3xl text-indigo-600 border-2 border-indigo-100 dark:border-indigo-800 shadow-sm">{ICONS.User}</div>
                 <div className="flex-1">
                    <h3 className="text-xl font-black dark:text-white mb-2">{selectedStudent.name}</h3>
                    <div className="flex gap-2">
                       <button onClick={handleEditStudentName} className="p-2.5 rounded-xl bg-white dark:bg-slate-800 text-slate-500 hover:text-indigo-600 transition-all border border-slate-100 dark:border-slate-700 shadow-sm">{ICONS.Edit}</button>
                       <button onClick={() => { setTempNote(selectedStudent.notes || ''); setIsNoteModalOpen(true); }} className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-lg">{ICONS.Notes}</button>
                    </div>
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                 {(() => {
                    const stats = getStudentStats(selectedStudent.id);
                    return (<>
                      <div className="bg-emerald-50 dark:bg-emerald-900/10 p-4 rounded-3xl text-center border border-emerald-100 dark:border-emerald-900/30"><div className="text-lg font-black text-emerald-600">{stats.present}</div><div className="text-[10px] font-black text-emerald-400">حضور</div></div>
                      <div className="bg-rose-50 dark:bg-rose-900/10 p-4 rounded-3xl text-center border border-rose-100 dark:border-rose-900/30"><div className="text-lg font-black text-rose-600">{stats.absent}</div><div className="text-[10px] font-black text-rose-400">غياب</div></div>
                    </>);
                 })()}
              </div>

              <div className="space-y-3">
                <p className="text-[10px] font-black text-slate-400 uppercase pr-2">سجل الامتحانات</p>
                {studentExamHistory.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 dark:bg-slate-800 rounded-3xl text-slate-400 text-xs font-bold border border-slate-100 dark:border-slate-700">لا توجد سجلات بعد</div>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-2 custom-scrollbar">
                    {studentExamHistory.map((h, idx) => (
                      <div key={idx} className="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 flex justify-between items-center shadow-sm">
                        <div>
                          <p className="font-black text-sm dark:text-white">{h.title}</p>
                          <p className="text-[9px] text-slate-400">{h.date}</p>
                        </div>
                        <div className={`px-3 py-1 rounded-lg text-xs font-black ${h.result?.status === 'present' ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' : 'text-rose-500 bg-rose-50'}`}>
                          {h.result?.status === 'present' ? `${h.result.grade}/${h.maxGrade}` : 'غائب'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button onClick={() => { setItemToDelete({id: selectedStudent.id, type: 'student'}); setIsConfirmDeleteOpen(true); setSelectedStudentId(null); }} className="w-full py-5 bg-rose-50 text-rose-600 rounded-[2rem] font-black text-sm hover:bg-rose-100 transition-all">حذف الطالب من المجموعة</button>
           </div>
         )}
      </Modal>

      <Modal isOpen={isExamModalOpen} onClose={() => setIsExamModalOpen(false)} title="امتحان جديد">
         <div className="space-y-4">
            <input type="text" placeholder="عنوان الامتحان" className="field" value={newExamTitle} onChange={e => setNewExamTitle(e.target.value)} />
            <input type="number" placeholder="الدرجة القصوى" className="field" max="100" value={newExamMaxGrade} onChange={e => setNewExamMaxGrade(Math.min(parseInt(e.target.value) || 0, 100))} />
            <select className="field appearance-none" value={newExamType} onChange={e => setNewExamType(e.target.value as any)}>
               <option value="daily">امتحان يومي</option>
               <option value="semester">امتحان فصلي</option>
            </select>
            <button onClick={handleAddExam} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black shadow-lg">حفظ الامتحان</button>
         </div>
      </Modal>

      <Modal isOpen={isGroupModalOpen} onClose={() => setIsGroupModalOpen(false)} title="مجموعة جديدة">
         <div className="space-y-4">
            <input type="text" placeholder="اسم المجموعة" className="field" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} />
            <input type="text" placeholder="الموقع" className="field" value={newGroupLocation} onChange={e => setNewGroupLocation(e.target.value)} />
            <button onClick={handleAddGroup} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black shadow-lg">حفظ</button>
         </div>
      </Modal>

      <Modal isOpen={isStudentModalOpen} onClose={() => setIsStudentModalOpen(false)} title="إضافة طالب">
         <div className="space-y-4">
            <input type="text" placeholder="اسم الطالب" className="field" value={newStudentName} onChange={e => setNewStudentName(e.target.value)} />
            <input type="text" placeholder="يوزر الطالب (English)" className="field ltr-input" value={newStudentUsername} onChange={e => setNewStudentUsername(e.target.value.toLowerCase())} />
            <button disabled={isSyncing} onClick={handleAddStudent} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black shadow-lg">ربط الطالب</button>
         </div>
      </Modal>

      <Modal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} title="الإعدادات">
         <div className="space-y-6">
            <div className="flex flex-col items-center gap-4 py-4 border-b border-slate-100 dark:border-slate-800">
                <div className="relative group">
                    <div className="w-24 h-24 rounded-[2rem] bg-indigo-100 dark:bg-indigo-900/20 overflow-hidden border-4 border-white dark:border-slate-800 shadow-xl flex items-center justify-center text-indigo-600">
                        {config.profileImage ? <img src={config.profileImage} className="w-full h-full object-cover" /> : <div className="scale-150">{ICONS.User}</div>}
                    </div>
                    <label className="absolute -bottom-2 -right-2 p-3 bg-indigo-600 text-white rounded-2xl shadow-xl cursor-pointer hover:scale-110 active:scale-95 transition-all">
                        {ICONS.Camera}
                        <input type="file" className="hidden" accept="image/*" onChange={handleProfilePicChange} />
                    </label>
                </div>
                <div className="text-center">
                    <button onClick={handleUpdateName} className="font-black text-slate-800 dark:text-white flex items-center gap-2 hover:text-indigo-600">
                        {config.name} {ICONS.Edit}
                    </button>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">@{config.username}</p>
                </div>
            </div>

            <div className="space-y-3">
                <button onClick={async () => { 
                     const newMode = !config.darkMode; setConfig({...config, darkMode: newMode});
                     if (auth.currentUser) await updateDoc(doc(db, "users", auth.currentUser.uid), { darkMode: newMode });
                     document.documentElement.classList.toggle('dark');
                   }} className="w-full p-5 bg-slate-50 dark:bg-slate-800 rounded-3xl flex justify-between items-center font-black">
                      <span className="dark:text-white">الوضع الليلي</span>{config.darkMode ? ICONS.Sun : ICONS.Moon}
                </button>
                
                <div className="pt-4 space-y-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase px-2 tracking-widest">التواصل مع الاستاذ</p>
                    <button onClick={() => window.open('https://wa.me/9647715729997')} className="w-full p-5 bg-emerald-50 text-emerald-600 rounded-3xl flex justify-between items-center font-black hover:bg-emerald-100 transition-all">
                        <span>واتساب الاستاذ</span>
                        {ICONS.WhatsApp}
                    </button>
                    
                    <p className="text-[10px] font-black text-slate-400 uppercase px-2 tracking-widest mt-4">قسم المدرس - المطور</p>
                    <button onClick={() => window.open('https://instagram.com/8o7y')} className="w-full p-5 bg-indigo-50 text-indigo-600 rounded-3xl flex justify-between items-center font-black hover:bg-indigo-100 transition-all">
                        <span>التواصل مع المطور</span>
                        {ICONS.Instagram}
                    </button>
                </div>

                <button onClick={handleSignOut} className="w-full p-5 bg-rose-50 text-rose-600 rounded-3xl flex justify-between items-center font-black mt-8 hover:bg-rose-100 transition-all">
                    <span>تسجيل الخروج</span>
                    {ICONS.LogOut}
                </button>
            </div>
         </div>
      </Modal>

      <Modal isOpen={isConfirmDeleteOpen} onClose={() => setIsConfirmDeleteOpen(false)} title="تأكيد الحذف">
         <div className="space-y-6 text-center">
            <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto text-3xl shadow-sm">{ICONS.Trash}</div>
            <h4 className="text-xl font-black dark:text-white tracking-tighter">هل أنت متأكد من الحذف؟</h4>
            <div className="flex gap-4">
               <button onClick={() => setIsConfirmDeleteOpen(false)} className="flex-1 py-5 bg-slate-50 dark:bg-slate-800 text-slate-500 rounded-[1.8rem] font-black transition-all active:scale-95">إلغاء</button>
               <button onClick={confirmDelete} className="flex-1 py-5 bg-rose-600 text-white rounded-[1.8rem] font-black shadow-lg shadow-rose-500/20 transition-all active:scale-95">تأكيد</button>
            </div>
         </div>
      </Modal>

      <nav className="fixed bottom-8 left-8 right-8 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-100 dark:border-slate-800 p-3 rounded-[3rem] shadow-2xl flex justify-around items-center z-50 transition-all duration-500">
        {config.role === 'teacher' ? (
          <>
            <button onClick={() => setView('dashboard')} className={`flex-1 flex flex-col items-center gap-1 py-4 rounded-[2.5rem] transition-all ${view === 'dashboard' ? 'bg-indigo-600 text-white shadow-xl scale-105' : 'text-slate-400'}`}>{ICONS.Users} <span className="text-[10px] font-black uppercase">المجموعات</span></button>
            <button onClick={() => setView('teacher-weekly')} className={`flex-1 flex flex-col items-center gap-1 py-4 rounded-[2.5rem] transition-all ${view === 'teacher-weekly' ? 'bg-indigo-900 text-white shadow-xl' : 'text-slate-400'}`}>{ICONS.Calendar} <span className="text-[10px] font-black uppercase">الجدول</span></button>
          </>
        ) : (
          <>
            <button onClick={() => setView('schedule')} className={`flex-1 flex flex-col items-center gap-1 py-4 rounded-[2.5rem] transition-all ${view === 'schedule' ? 'bg-indigo-600 text-white shadow-xl scale-105' : 'text-slate-400'}`}>{ICONS.Calendar} <span className="text-[10px] font-black uppercase">الجدول</span></button>
            <button onClick={() => setView('student-results')} className={`flex-1 flex flex-col items-center gap-1 py-4 rounded-[2.5rem] transition-all ${view === 'student-results' ? 'bg-amber-600 text-white shadow-xl scale-105' : 'text-slate-400'}`}>{ICONS.ClipboardList} <span className="text-[10px] font-black uppercase">النتائج</span></button>
          </>
        )}
      </nav>

      <style>{`
        @keyframes toast-in { from { transform: translate(-50%, -100%); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
        .animate-toast-in { animation: toast-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .field { width: 100%; padding: 18px 24px; border: 2.5px solid #f1f5f9; border-radius: 1.8rem; outline: none; font-weight: 800; font-size: 15px; background: white; text-align: right; transition: all 0.3s; }
        .field:focus { border-color: #4f46e5; box-shadow: 0 10px 20px -10px rgba(79, 70, 229, 0.2); }
        .dark .field { background: #1e293b; border-color: #334155; color: white; }
        .ltr-input { direction: ltr; text-align: left; }
        .animate-slide-in { animation: slide-in 0.4s ease-out; }
        @keyframes slide-in { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .login-bg { background-image: radial-gradient(circle at 2px 2px, #f1f5f9 1px, transparent 0); background-size: 24px 24px; }
        .dark .login-bg { background-image: radial-gradient(circle at 2px 2px, #1e293b 1px, transparent 0); }
      `}</style>
    </div>
  );
};

export default App;
