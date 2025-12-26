
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
  // --- States ---
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

  // Modals
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

  // Forms
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupLocation, setNewGroupLocation] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentUsername, setNewStudentUsername] = useState('');
  const [newExamTitle, setNewExamTitle] = useState('');
  const [newExamMaxGrade, setNewExamMaxGrade] = useState(100);
  const [newExamType, setNewExamType] = useState<'daily' | 'semester'>('daily');
  const [newGSched, setNewGSched] = useState<{day: DayOfWeek, time: string}>({day: 'السبت', time: ''});
  const [newHomeworkTask, setNewHomeworkTask] = useState('');
  const [newHomeworkSubject, setNewHomeworkSubject] = useState(SUBJECTS[0]);
  const [itemToDelete, setItemToDelete] = useState<{ id: string; type: string } | null>(null);

  // Derived Values
  const activeGroup = useMemo(() => groups.find(g => g.id === activeGroupId), [groups, activeGroupId]);
  const selectedStudent = useMemo(() => activeGroup?.students.find(s => s.id === selectedStudentId), [activeGroup, selectedStudentId]);
  const selectedExam = useMemo(() => activeGroup?.exams.find(e => e.id === selectedExamId), [activeGroup, selectedExamId]);

  // Fix: Correctly compute student exam history
  const studentExamHistory = useMemo(() => {
    if (!activeGroup || !selectedStudentId) return [];
    return activeGroup.exams.map(ex => ({
      title: ex.title,
      date: ex.date,
      maxGrade: ex.maxGrade,
      result: ex.results[selectedStudentId]
    })).filter(h => h.result);
  }, [activeGroup, selectedStudentId]);

  // Fix: Search filter for teacher groups
  const filteredGroups = useMemo(() => {
    return groups.filter(g => 
      g.name.toLowerCase().includes(groupSearch.toLowerCase()) || 
      g.location.toLowerCase().includes(groupSearch.toLowerCase())
    );
  }, [groups, groupSearch]);

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

  // --- Persistence for Personal Student Tasks ---
  useEffect(() => {
    if (config.role === 'student' && config.username) {
      const savedLectures = localStorage.getItem(`lectures_${config.username}`);
      const savedHomeworks = localStorage.getItem(`homeworks_${config.username}`);
      if (savedLectures) setStudentLectures(JSON.parse(savedLectures));
      if (savedHomeworks) setStudentHomeworks(JSON.parse(savedHomeworks));
    }
  }, [config.role, config.username]);

  useEffect(() => {
    if (config.role === 'student' && config.username) {
      localStorage.setItem(`lectures_${config.username}`, JSON.stringify(studentLectures));
      localStorage.setItem(`homeworks_${config.username}`, JSON.stringify(studentHomeworks));
    }
  }, [studentLectures, studentHomeworks]);

  // --- Auth & Firestore Sync ---
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
    // Constraint: Username length 4-12
    if (authUsername.length < 4 || authUsername.length > 12) {
      return showToast('يجب أن يكون اسم المستخدم بين 4 و 12 حرفاً', 'error');
    }
    setIsSyncing(true);
    const email = authUsername.trim().toLowerCase() + "@manasa.com";
    try {
      if (authMode === 'signup') {
        if (!authName) throw new Error("الاسم مطلوب");
        const cred = await createUserWithEmailAndPassword(auth, email, authPassword);
        const userData = { name: authName, username: authUsername.trim().toLowerCase(), role: pendingRole, profileImage: null, darkMode: false, onboarded: true };
        await setDoc(doc(db, "users", cred.user.uid), userData);
        setConfig(userData);
      } else {
        await signInWithEmailAndPassword(auth, email, authPassword);
      }
      showToast('تم بنجاح', 'success');
    } catch (e) { showToast('خطأ في البيانات أو اسم المستخدم مستخدم مسبقاً', 'error'); } finally { setIsSyncing(false); }
  };

  // --- Teacher Operations ---
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
    // Constraint: Max Grade 100
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
      const updatedStudents = activeGroup.students.map(s => 
        s.id === selectedStudentId ? { ...s, name: newName } : s
      );
      await updateDoc(doc(db, "groups", activeGroup.id), { students: updatedStudents });
      showToast('تم تحديث اسم الطالب', 'success');
    }
  };

  const handleAddGroupSchedule = async () => {
    if (!activeGroupId || !newGSched.time) return;
    const schedule: GroupSchedule = { id: Date.now().toString(), day: newGSched.day, time: newGSched.time };
    await updateDoc(doc(db, "groups", activeGroupId), { schedule: arrayUnion(schedule) });
    setIsAddGroupScheduleModalOpen(false);
    showToast('تمت إضافة الموعد بنجاح', 'success');
  };

  const updateGrade = async (examId: string, studentId: string, grade: number, status: any) => {
    if (!activeGroup) return;
    // Constraint: Max grade 100
    const gradeVal = Math.min(grade, 100);
    const updatedExams = activeGroup.exams.map(ex => ex.id === examId ? { ...ex, results: { ...ex.results, [studentId]: { studentId, grade: gradeVal, status } } } : ex);
    await updateDoc(doc(db, "groups", activeGroup.id), { exams: updatedExams });
  };

  const handleProfilePicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        setConfig(prev => ({ ...prev, profileImage: base64String }));
        if (auth.currentUser) {
          await updateDoc(doc(db, "users", auth.currentUser.uid), { profileImage: base64String });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSignOut = async () => {
    if (window.confirm("هل أنت متأكد من رغبتك في تسجيل الخروج؟")) {
      await signOut(auth);
      window.location.reload();
    }
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
       } else if (type === 'gschedule') {
          const updated = activeGroup?.schedule.filter(s => s.id !== id);
          await updateDoc(groupRef, { schedule: updated });
       }
    }
    setIsConfirmDeleteOpen(false); setItemToDelete(null); showToast('تم الحذف', 'success');
  };

  // --- Student Operations ---
  const handleAddPersonalLecture = () => {
    if (!newGSched.time) return;
    const l: StudentLecture = { id: Date.now().toString(), subject: newHomeworkSubject, day: newGSched.day, time: newGSched.time, type: 'physical', postponed: false };
    setStudentLectures([...studentLectures, l]);
    setIsAddLectureModalOpen(false);
    showToast('تمت إضافة الحصة للجدول', 'success');
  };

  const handleAddPersonalHomework = () => {
    if (!newHomeworkTask) return;
    const h: StudentHomework = { id: Date.now().toString(), subject: newHomeworkSubject, task: newHomeworkTask, completed: false, createdAt: new Date().toLocaleDateString('ar-EG') };
    setStudentHomeworks([h, ...studentHomeworks]);
    setIsAddHomeworkModalOpen(false); setNewHomeworkTask('');
    showToast('تمت إضافة المهمة', 'success');
  };

  const myResults = useMemo(() => {
    if (config.role !== 'student') return [];
    const results: any[] = [];
    groups.forEach(g => {
      const sInG = g.students.find(s => s.username === config.username);
      if (sInG) g.exams.forEach(ex => { if (ex.results[sInG.id]) results.push({ groupName: g.name, examTitle: ex.title, ...ex.results[sInG.id], maxGrade: ex.maxGrade, date: ex.date }); });
    });
    return results;
  }, [groups, config.username]);

  if (!config.onboarded) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950 flex flex-col items-center justify-center p-8 animate-fade-in text-center">
        <div className="w-24 h-24 bg-indigo-600 rounded-[2.5rem] flex items-center justify-center text-white shadow-2xl mb-8 transform hover:scale-110 transition-transform">{ICONS.GraduationCap}</div>
        {authMode === 'selection' ? (
          <div className="w-full max-w-sm space-y-6">
            <h1 className="text-4xl font-black mb-2 dark:text-white tracking-tighter">منصة الأستاذ</h1>
            {/* Added Credits */}
            <div className="text-xs font-bold text-slate-400 mb-8 uppercase tracking-widest">بالتعاون مع الاستاذ عمار</div>
            
            <button onClick={() => { setPendingRole('teacher'); setAuthMode('login'); }} className="w-full py-6 bg-indigo-600 text-white rounded-[2rem] font-black text-lg shadow-xl active:scale-95 transition-all">دخول (مدرس)</button>
            <button onClick={() => { setPendingRole('student'); setAuthMode('login'); }} className="w-full py-6 bg-white dark:bg-slate-800 border-2 border-indigo-100 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 rounded-[2rem] font-black text-lg">دخول (طالب)</button>
            
            {/* Added Footer Credits */}
            <div className="mt-8 text-[10px] font-black text-slate-400 opacity-50 uppercase tracking-widest">تم التطوير بواسطة حسنين</div>
          </div>
        ) : (
          <div className="w-full max-w-sm space-y-4 animate-slide-in">
            <h2 className="text-2xl font-black dark:text-white">{authMode === 'login' ? 'تسجيل الدخول' : 'حساب جديد'}</h2>
            <div className="text-[10px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 dark:bg-indigo-900/30 px-4 py-1.5 rounded-full inline-block">رتبة: {pendingRole === 'teacher' ? 'مدرس' : 'طالب'}</div>
            
            {/* Modern Auth UI */}
            <div className="space-y-4 pt-4">
              {authMode === 'signup' && (
                <div className="relative group">
                  <input type="text" placeholder="الاسم الكامل" className="field" value={authName} onChange={e => setAuthName(e.target.value)} />
                </div>
              )}
              <div className="relative group">
                <input type="text" placeholder="اسم المستخدم (English)" className="field ltr-input" value={authUsername} onChange={e => setAuthUsername(e.target.value.replace(/[^a-z0-9_]/g, ''))} />
              </div>
              <div className="relative group">
                <input type="password" placeholder="كلمة المرور" className="field ltr-input" value={authPassword} onChange={e => setAuthPassword(e.target.value)} />
              </div>
              <button disabled={isSyncing} onClick={handleAuth} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black shadow-lg flex items-center justify-center gap-2 mt-4 transition-all active:scale-95">
                {isSyncing ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : 'تأكيد الدخول'}
              </button>
            </div>
            
            <button onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="text-sm font-black text-indigo-500 block mx-auto py-2">{authMode === 'login' ? 'سجل الآن' : 'لديك حساب؟ سجل دخول'}</button>
            <button onClick={() => setAuthMode('selection')} className="text-xs text-slate-400 block mx-auto">رجوع للخلف</button>
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
            <button onClick={() => setView('dashboard')} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl rotate-180 text-slate-400">{ICONS.ChevronLeft}</button>
          )}
          <div className="flex items-center gap-3">
             <div onClick={() => setIsSettingsOpen(true)} className="w-11 h-11 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center border-2 border-white shadow-sm cursor-pointer text-indigo-600 overflow-hidden">
                {config.profileImage ? <img src={config.profileImage} className="w-full h-full object-cover" /> : ICONS.User}
             </div>
             <div>
                <h2 className="font-black text-slate-900 dark:text-white leading-none text-sm">{config.name}</h2>
                <span className="text-[10px] font-black text-indigo-500 uppercase">{config.role === 'teacher' ? 'الأستاذ' : 'طالب'}</span>
             </div>
          </div>
        </div>
        <button onClick={() => setIsSettingsOpen(true)} className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-400 rounded-2xl hover:bg-indigo-50">{ICONS.Settings}</button>
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
                {/* Search Bar for Teacher Groups */}
                <div className="relative">
                   <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">{ICONS.Search}</div>
                   <input 
                     type="text" 
                     placeholder="ابحث عن مجموعة..." 
                     className="field !pr-12 !py-4" 
                     value={groupSearch} 
                     onChange={e => setGroupSearch(e.target.value)} 
                   />
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
          ) : view === 'teacher-weekly' ? (
             <div className="space-y-8 animate-fade-in">
                <h3 className="text-2xl font-black dark:text-white px-2">الجدول الأسبوعي المجمع</h3>
                {DAYS.map(day => {
                   const dayScheds = groups.flatMap(g => g.schedule.filter(s => s.day === day).map(s => ({ ...s, groupName: g.name, loc: g.location })));
                   if (dayScheds.length === 0) return null;
                   return (
                     <div key={day} className="space-y-4">
                        <h4 className="text-xs font-black text-slate-400 pr-3 tracking-widest">{day}</h4>
                        {dayScheds.map(s => (
                          <div key={s.id} className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-4 hover:shadow-md transition-all">
                             <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl flex items-center justify-center text-indigo-600">{ICONS.Clock}</div>
                             <div>
                               <h5 className="font-black dark:text-white">{s.groupName}</h5>
                               <p className="text-[11px] font-bold text-slate-400">{formatTime12h(s.time)} - {s.loc}</p>
                             </div>
                          </div>
                        ))}
                     </div>
                   );
                })}
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
                    <div className="grid grid-cols-1 gap-4">
                       {activeGroup?.students.filter(s => s.name.includes(searchQuery)).map(s => (
                          <div key={s.id} onClick={() => setSelectedStudentId(s.id)} className="bg-white dark:bg-slate-900 p-6 rounded-[2.2rem] border border-slate-100 dark:border-slate-800 flex items-center justify-between hover:shadow-xl transition-all cursor-pointer group">
                             <div className="flex items-center gap-5">
                                <button onClick={(e) => { e.stopPropagation(); toggleStar(s.id); }} className={`p-2 transition-all ${s.starred ? 'text-amber-400 fill-amber-400 scale-110' : 'text-slate-200 hover:text-amber-200'}`}>{ICONS.Star}</button>
                                <div className="text-right">
                                  <h5 className="font-black text-slate-800 dark:text-white text-lg leading-none mb-1">{s.name}</h5>
                                  <div className="flex gap-2">
                                     <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg ${s.paid ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>{s.paid ? 'مدفوع' : 'غير مدفوع'}</span>
                                     <span className="text-[9px] text-slate-400 font-bold uppercase">@{s.username}</span>
                                  </div>
                                </div>
                             </div>
                             <button onClick={(e) => { e.stopPropagation(); togglePayment(s.id); }} className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${s.paid ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600 hover:bg-rose-100'}`}>
                                {s.paid ? 'تغيير للدفع' : 'تأكيد القسط'}
                             </button>
                          </div>
                       ))}
                    </div>
                 </div>
               )}

               {activeTab === 'exams' && (
                 <div className="space-y-4 px-2">
                    <button onClick={() => setIsExamModalOpen(true)} className="w-full p-5 bg-indigo-600 text-white rounded-[1.8rem] font-black shadow-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
                        {ICONS.Plus} إضافة امتحان جديد
                    </button>
                    {activeGroup?.exams.map(ex => (
                       <div key={ex.id} onClick={() => { setSelectedExamId(ex.id); setView('student-results'); }} className="bg-white dark:bg-slate-900 p-6 rounded-[2.2rem] border border-slate-100 dark:border-slate-800 flex justify-between items-center group cursor-pointer hover:border-indigo-200 transition-all">
                          <div>
                             <h5 className="font-black text-lg dark:text-white mb-1 group-hover:text-indigo-600 transition-colors">{ex.title}</h5>
                             <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                                <span className={`px-2 py-0.5 rounded-full ${ex.type === 'semester' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-600'}`}>{ex.type === 'semester' ? 'فصلي' : 'يومي'}</span>
                                {ex.date} | {ex.maxGrade} درجة
                             </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={(e) => { e.stopPropagation(); setItemToDelete({id: ex.id, type: 'exam'}); setIsConfirmDeleteOpen(true); }} className="p-2 text-rose-400 hover:bg-rose-50 rounded-xl opacity-0 group-hover:opacity-100 transition-all">{ICONS.Trash}</button>
                            <button className="p-4 bg-slate-50 dark:bg-slate-800 text-slate-400 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all">{ICONS.ChevronLeft}</button>
                          </div>
                       </div>
                    ))}
                 </div>
               )}

               {activeTab === 'group-schedule' && (
                  <div className="space-y-5 px-2">
                     <button onClick={() => setIsAddGroupScheduleModalOpen(true)} className="w-full p-5 bg-indigo-600 text-white rounded-[1.8rem] font-black shadow-lg flex items-center justify-center gap-2">
                        {ICONS.Plus} إضافة موعد للمجموعة
                     </button>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {activeGroup?.schedule.map(sc => (
                           <div key={sc.id} className="bg-white dark:bg-slate-900 p-5 rounded-[2.2rem] border border-slate-100 dark:border-slate-800 flex items-center justify-between group shadow-sm">
                              <div className="flex items-center gap-4">
                                 <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-indigo-600">{ICONS.Clock}</div>
                                 <div>
                                    <h6 className="font-black text-slate-800 dark:text-white text-lg leading-none mb-1">{sc.day}</h6>
                                    <p className="text-[11px] text-indigo-500 font-black">{formatTime12h(sc.time)}</p>
                                 </div>
                              </div>
                              <button onClick={() => { setItemToDelete({id: sc.id, type: 'gschedule'}); setIsConfirmDeleteOpen(true); }} className="p-2 text-rose-400 hover:bg-rose-50 rounded-xl opacity-0 group-hover:opacity-100 transition-all">{ICONS.Trash}</button>
                           </div>
                        ))}
                     </div>
                  </div>
               )}
            </div>
          )
        ) : (
          /* Student View Dashboard */
          <div className="space-y-8 animate-fade-in pb-20">
             {view === 'schedule' ? (
                <div className="space-y-8 px-2">
                   <div className="flex justify-between items-center">
                     <h3 className="text-2xl font-black dark:text-white">جدولي الدراسي</h3>
                     <button onClick={() => setIsAddLectureModalOpen(true)} className="p-4 bg-indigo-600 text-white rounded-2xl shadow-xl hover:scale-110 active:scale-95 transition-all">{ICONS.Plus}</button>
                   </div>
                   {DAYS.map(day => {
                     const groupSessions = groups.flatMap(g => 
                       g.schedule.filter(sc => sc.day === day).map(sc => ({
                         id: sc.id, subject: g.name, time: sc.time, location: g.location, day: sc.day, type: 'physical' as any, postponed: false
                       }))
                     );
                     const personalSessions = studentLectures.filter(l => l.day === day);
                     const allSessions = [...groupSessions, ...personalSessions].sort((a,b) => a.time.localeCompare(b.time));
                     
                     if (allSessions.length === 0) return null;
                     return (
                       <div key={day} className="space-y-4">
                          <h4 className="text-xs font-black text-slate-400 pr-3 tracking-widest">{day}</h4>
                          {allSessions.map(l => (
                            <LectureCard 
                              key={l.id} 
                              lecture={l} 
                              onEdit={()=>{}} 
                              onDelete={(id) => setStudentLectures(prev => prev.filter(p => p.id !== id))} 
                              onTogglePostponed={(id) => setStudentLectures(prev => prev.map(p => p.id === id ? {...p, postponed: !p.postponed} : p))} 
                            />
                          ))}
                       </div>
                     );
                   })}
                </div>
             ) : view === 'homework' ? (
                <div className="space-y-8 px-2">
                  <div className="flex justify-between items-center">
                    <h3 className="text-2xl font-black dark:text-white">الواجبات والمهام</h3>
                    <button onClick={() => setIsAddHomeworkModalOpen(true)} className="p-4 bg-emerald-600 text-white rounded-2xl shadow-xl hover:scale-110 active:scale-95 transition-all">{ICONS.Plus}</button>
                  </div>
                  <div className="space-y-4">
                     {studentHomeworks.length === 0 ? (
                        <div className="p-16 text-center bg-white dark:bg-slate-900 rounded-[2.5rem] border-2 border-dashed border-slate-100 dark:border-slate-800">
                             <p className="text-slate-400 font-bold">كل المهام منجزة! أضف واجباً جديداً.</p>
                        </div>
                     ) : (
                        studentHomeworks.map(h => (
                           <HomeworkItem 
                             key={h.id} homework={h} 
                             onToggle={(id) => setStudentHomeworks(prev => prev.map(p => p.id === id ? {...p, completed: !p.completed} : p))} 
                             onDelete={(id) => setStudentHomeworks(prev => prev.filter(p => p.id !== id))} 
                           />
                        ))
                     )}
                  </div>
               </div>
             ) : (
                <div className="space-y-8 px-2">
                    <h3 className="text-2xl font-black dark:text-white">نتائجي ودرجاتي</h3>
                    <div className="space-y-4">
                        {myResults.length === 0 ? (
                            <div className="p-16 text-center bg-white dark:bg-slate-900 rounded-[2.5rem] border-2 border-dashed border-slate-100 dark:border-slate-800">
                                <p className="text-slate-400 font-bold">لا توجد نتائج حالياً.</p>
                            </div>
                        ) : (
                            myResults.map((r, i) => (
                                <div key={i} className="bg-white dark:bg-slate-900 p-6 rounded-[2.2rem] border border-slate-100 dark:border-slate-800 flex justify-between items-center shadow-sm hover:shadow-md transition-all">
                                    <div>
                                        <h4 className="font-black dark:text-white mb-1">{r.examTitle}</h4>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">{r.groupName} | {r.date}</p>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-2xl font-black text-indigo-600 leading-none">{r.grade} <span className="text-xs text-slate-300">/ {r.maxGrade}</span></div>
                                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg inline-block mt-1 ${r.status === 'present' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{r.status === 'present' ? 'حاضر' : 'غائب'}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
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
             <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm mx-2">
                {activeGroup?.students.map((s, idx) => {
                  const res = selectedExam.results[s.id];
                  return (
                    <div key={s.id} className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-b last:border-0 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                       <div className="flex items-center gap-4 w-full sm:w-auto">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black bg-slate-50 dark:bg-slate-800 text-slate-400 text-xs">#{idx+1}</div>
                          <h6 className="font-black dark:text-white">{s.name}</h6>
                       </div>
                       <div className="flex items-center gap-4 w-full sm:w-auto">
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

      {/* --- Modals (All Integrated) --- */}
      
      {/* Teacher: New Group */}
      <Modal isOpen={isGroupModalOpen} onClose={() => setIsGroupModalOpen(false)} title="إنشاء مجموعة جديدة">
         <div className="space-y-4">
            <input type="text" placeholder="اسم المجموعة" className="field" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} />
            <input type="text" placeholder="الموقع / السنتر" className="field" value={newGroupLocation} onChange={e => setNewGroupLocation(e.target.value)} />
            <button onClick={handleAddGroup} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black shadow-lg">حفظ</button>
         </div>
      </Modal>

      {/* Teacher: Add Student */}
      <Modal isOpen={isStudentModalOpen} onClose={() => setIsStudentModalOpen(false)} title="إضافة طالب للمجموعة">
         <div className="space-y-4">
            <input type="text" placeholder="اسم الطالب" className="field" value={newStudentName} onChange={e => setNewStudentName(e.target.value)} />
            <input type="text" placeholder="اسم المستخدم (English)" className="field ltr-input" value={newStudentUsername} onChange={e => setNewStudentUsername(e.target.value)} />
            <p className="text-[10px] text-slate-400 font-bold text-center">ملاحظة: يجب أن يكون الطالب مسجلاً في المنصة مسبقاً.</p>
            <button disabled={isSyncing} onClick={handleAddStudent} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black shadow-lg flex items-center justify-center gap-2">
                {isSyncing ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : 'ربط الطالب'}
            </button>
         </div>
      </Modal>

      {/* Teacher: Student Info */}
      <Modal isOpen={!!selectedStudentId} onClose={() => setSelectedStudentId(null)} title="بيانات الطالب">
         {selectedStudent && (
           <div className="space-y-8">
              <div className="flex items-center gap-6 p-4 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-[2rem] border border-indigo-100 dark:border-indigo-900/30 shadow-sm transition-all">
                 <div className="w-20 h-20 bg-white dark:bg-slate-800 rounded-3xl flex items-center justify-center text-3xl text-indigo-600 border-2 border-indigo-100 dark:border-indigo-800 shadow-sm">{ICONS.User}</div>
                 <div className="flex-1">
                    <h3 className="text-xl font-black dark:text-white mb-2">{selectedStudent.name}</h3>
                    <div className="flex gap-2">
                       <button onClick={() => toggleStar(selectedStudent.id)} className={`p-2.5 rounded-xl transition-all shadow-sm ${selectedStudent.starred ? 'bg-amber-400 text-white' : 'bg-white dark:bg-slate-800 text-slate-400 border border-slate-100 dark:border-slate-700'}`}>{ICONS.Star}</button>
                       <button onClick={() => { setTempNote(selectedStudent.notes || ''); setIsNoteModalOpen(true); }} className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-md">{ICONS.Notes}</button>
                       {/* Point 10: Edit Student Name */}
                       <button onClick={handleEditStudentName} className="p-2.5 rounded-xl bg-white dark:bg-slate-800 text-slate-500 hover:text-indigo-600 transition-all border border-slate-100 dark:border-slate-700 shadow-sm">{ICONS.Edit}</button>
                    </div>
                 </div>
              </div>
              
              {/* Point 1: Displaying Student Exam History correctly */}
              <div className="space-y-3">
                <p className="text-[10px] font-black text-slate-400 px-2 uppercase tracking-widest">سجل الامتحانات</p>
                {studentExamHistory.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 dark:bg-slate-800 rounded-3xl text-slate-400 text-xs font-bold border border-slate-100 dark:border-slate-700">لا توجد سجلات حالياً</div>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-2 custom-scrollbar pr-1">
                    {studentExamHistory.map((h, idx) => (
                      <div key={idx} className="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 flex justify-between items-center shadow-sm">
                        <div>
                          <p className="font-black text-sm dark:text-white leading-tight">{h.title}</p>
                          <p className="text-[9px] text-slate-400 font-bold mt-0.5">{h.date}</p>
                        </div>
                        <div className="text-xs font-black text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1.5 rounded-xl">
                          {h.result.grade} / {h.maxGrade}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                 {(() => {
                    const stats = getStudentStats(selectedStudent.id);
                    return (<>
                      <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-3xl text-center border border-indigo-100 dark:border-indigo-800 shadow-sm"><div className="text-xl font-black text-indigo-600">{stats.present}</div><div className="text-[10px] font-black text-indigo-400 uppercase tracking-tighter">حضور</div></div>
                      <div className="bg-rose-50 dark:bg-rose-900/20 p-4 rounded-3xl text-center border border-rose-100 dark:border-rose-800 shadow-sm"><div className="text-xl font-black text-rose-600">{stats.absent}</div><div className="text-[10px] font-black text-rose-400 uppercase tracking-tighter">غياب</div></div>
                    </>);
                 })()}
              </div>
              <button onClick={() => { setItemToDelete({id: selectedStudent.id, type: 'student'}); setIsConfirmDeleteOpen(true); setSelectedStudentId(null); }} className="w-full py-5 bg-rose-50 dark:bg-rose-900/10 text-rose-600 rounded-[2rem] font-black hover:bg-rose-600 hover:text-white transition-all">حذف الطالب من المجموعة</button>
           </div>
         )}
      </Modal>

      {/* Teacher: Student Notes */}
      <Modal isOpen={isNoteModalOpen} onClose={() => setIsNoteModalOpen(false)} title="ملاحظات المدرس">
         <div className="space-y-4">
            <textarea className="field h-40 resize-none !rounded-[2.5rem]" placeholder="اكتب ملاحظاتك عن هذا الطالب..." value={tempNote} onChange={e => setTempNote(e.target.value)} />
            <button onClick={async () => {
                if (!activeGroup || !selectedStudentId) return;
                const updated = activeGroup.students.map(s => s.id === selectedStudentId ? { ...s, notes: tempNote } : s);
                await updateDoc(doc(db, "groups", activeGroup.id), { students: updated });
                setIsNoteModalOpen(false);
                showToast('تم حفظ الملاحظة', 'success');
            }} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black shadow-lg">حفظ الملاحظة</button>
         </div>
      </Modal>

      {/* Teacher: New Exam */}
      <Modal isOpen={isExamModalOpen} onClose={() => setIsExamModalOpen(false)} title="إنشاء امتحان جديد">
         <div className="space-y-4">
            <input type="text" placeholder="عنوان الامتحان" className="field" value={newExamTitle} onChange={e => setNewExamTitle(e.target.value)} />
            <input type="number" placeholder="الدرجة القصوى (100 كحد أقصى)" className="field" max="100" value={newExamMaxGrade} onChange={e => setNewExamMaxGrade(Math.min(parseInt(e.target.value) || 0, 100))} />
            {/* Point 4: Daily / Semester Exam Type */}
            <select 
              className="field appearance-none" 
              value={newExamType} 
              onChange={e => setNewExamType(e.target.value as any)}
            >
               <option value="daily">امتحان يومي</option>
               <option value="semester">امتحان فصلي</option>
            </select>
            <button onClick={handleAddExam} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black shadow-lg">إنشاء</button>
         </div>
      </Modal>

      {/* Teacher: Group Schedule */}
      <Modal isOpen={isAddGroupScheduleModalOpen} onClose={() => setIsAddGroupScheduleModalOpen(false)} title="إضافة موعد للمجموعة">
         <div className="space-y-4">
            <select className="field appearance-none" value={newGSched.day} onChange={e => setNewGSched({...newGSched, day: e.target.value as DayOfWeek})}>
               {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <input type="time" className="field" value={newGSched.time} onChange={e => setNewGSched({...newGSched, time: e.target.value})} />
            <button onClick={handleAddGroupSchedule} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black shadow-lg">إضافة الموعد</button>
         </div>
      </Modal>

      {/* Student: Personal Lecture */}
      <Modal isOpen={isAddLectureModalOpen} onClose={() => setIsAddLectureModalOpen(false)} title="إضافة حصة للجدول">
         <div className="space-y-4">
            <select className="field appearance-none" value={newHomeworkSubject} onChange={e => setNewHomeworkSubject(e.target.value)}>
               {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="field appearance-none" value={newGSched.day} onChange={e => setNewGSched({...newGSched, day: e.target.value as DayOfWeek})}>
               {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <input type="time" className="field" value={newGSched.time} onChange={e => setNewGSched({...newGSched, time: e.target.value})} />
            <button onClick={handleAddPersonalLecture} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black shadow-lg">حفظ الحصة</button>
         </div>
      </Modal>

      {/* Student: Personal Homework */}
      <Modal isOpen={isAddHomeworkModalOpen} onClose={() => setIsAddHomeworkModalOpen(false)} title="إضافة واجب جديد">
         <div className="space-y-4">
            <select className="field appearance-none" value={newHomeworkSubject} onChange={e => setNewHomeworkSubject(e.target.value)}>
               {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <textarea placeholder="ما هو الواجب المطلوب؟" className="field min-h-[120px] resize-none !rounded-[2rem]" value={newHomeworkTask} onChange={e => setNewHomeworkTask(e.target.value)} />
            <button onClick={handleAddPersonalHomework} className="w-full py-5 bg-emerald-600 text-white rounded-[2rem] font-black shadow-lg">إضافة المهمة</button>
         </div>
      </Modal>

      {/* Global Settings */}
      <Modal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} title="الإعدادات">
         <div className="space-y-6">
            {/* Point 7: Profile Image and Name Edit */}
            <div className="flex flex-col items-center gap-4 py-4 border-b border-slate-100 dark:border-slate-800">
                <div className="relative group">
                    <div className="w-24 h-24 rounded-[2rem] bg-indigo-100 dark:bg-indigo-900/20 overflow-hidden border-4 border-white dark:border-slate-800 shadow-xl flex items-center justify-center text-indigo-600">
                        {config.profileImage ? (
                          <img src={config.profileImage} className="w-full h-full object-cover" />
                        ) : (
                          <div className="scale-150">{ICONS.User}</div>
                        )}
                    </div>
                    <label className="absolute -bottom-2 -right-2 p-3 bg-indigo-600 text-white rounded-2xl shadow-xl cursor-pointer hover:scale-110 active:scale-95 transition-all">
                        {ICONS.Camera}
                        <input type="file" className="hidden" accept="image/*" onChange={handleProfilePicChange} />
                    </label>
                </div>
                <div className="text-center">
                    <button 
                      onClick={() => {
                        const newName = window.prompt("أدخل اسمك الجديد:", config.name);
                        if (newName && newName.trim()) {
                          setConfig(prev => ({ ...prev, name: newName }));
                          if (auth.currentUser) updateDoc(doc(db, "users", auth.currentUser.uid), { name: newName });
                        }
                      }}
                      className="font-black text-slate-800 dark:text-white flex items-center gap-2 hover:text-indigo-600 transition-colors"
                    >
                        {config.name} {ICONS.Edit}
                    </button>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">@{config.username}</p>
                </div>
            </div>

            <button onClick={async () => { 
                 const newMode = !config.darkMode; setConfig({...config, darkMode: newMode});
                 if (auth.currentUser) await updateDoc(doc(db, "users", auth.currentUser.uid), { darkMode: newMode });
                 document.documentElement.classList.toggle('dark');
               }} className="w-full p-5 bg-slate-50 dark:bg-slate-800 rounded-3xl flex justify-between items-center font-black">
                  <span className="dark:text-white">الوضع الليلي</span>
                  <div className={`p-2 rounded-xl ${config.darkMode ? 'bg-indigo-600 text-white' : 'bg-amber-100 text-amber-600'}`}>
                    {config.darkMode ? ICONS.Sun : ICONS.Moon}
                  </div>
            </button>
            
            {/* Point 2: Social Links & Rights */}
            <button 
              onClick={() => window.open('https://wa.me/9647715729997')} 
              className="w-full p-5 bg-emerald-50 text-emerald-600 rounded-3xl flex justify-between items-center font-black hover:bg-emerald-100 transition-all"
            >
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-600 text-white p-2 rounded-xl">07715729997</div>
                  <span>واتساب الاستاذ</span>
                </div>
                <div className="text-emerald-500 scale-125">
                   <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                </div>
            </button>
            <button 
              onClick={() => window.open('https://instagram.com/8o7y_')} 
              className="w-full p-5 bg-indigo-50 text-indigo-600 rounded-3xl flex justify-between items-center font-black hover:bg-indigo-100 transition-all"
            >
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-600 text-white p-2 rounded-xl">@8o7y_</div>
                  <span>تواصل مع المطور</span>
                </div>
                <div className="text-indigo-500 scale-125">
                   <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
                </div>
            </button>

            {/* Point 8: Sign out with confirmation */}
            <button onClick={handleSignOut} className="w-full p-5 bg-rose-50 text-rose-600 rounded-3xl flex justify-between items-center font-black mt-8 hover:bg-rose-100 transition-all">
                <span>تسجيل الخروج</span>
                {ICONS.LogOut}
            </button>
         </div>
      </Modal>

      {/* Global Delete Confirmation */}
      <Modal isOpen={isConfirmDeleteOpen} onClose={() => setIsConfirmDeleteOpen(false)} title="تأكيد الحذف">
         <div className="space-y-6 text-center">
            <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto text-3xl">{ICONS.Trash}</div>
            <h4 className="text-xl font-black dark:text-white tracking-tighter">هل أنت متأكد من الحذف؟</h4>
            <div className="flex gap-4">
               <button onClick={() => setIsConfirmDeleteOpen(false)} className="flex-1 py-5 bg-slate-50 dark:bg-slate-800 text-slate-500 rounded-[1.8rem] font-black">إلغاء</button>
               <button onClick={confirmDelete} className="flex-1 py-5 bg-rose-600 text-white rounded-[1.8rem] font-black shadow-lg">تأكيد</button>
            </div>
         </div>
      </Modal>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-8 left-8 right-8 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-100 dark:border-slate-800 p-3 rounded-[3rem] shadow-2xl flex justify-around items-center z-50 transition-all duration-500">
        {config.role === 'teacher' ? (
          <>
            <button onClick={() => setView('dashboard')} className={`flex-1 flex flex-col items-center gap-1 py-4 rounded-[2.5rem] transition-all ${view === 'dashboard' ? 'bg-indigo-600 text-white shadow-xl scale-105' : 'text-slate-400'}`}>
                {ICONS.Users} <span className="text-[10px] font-black uppercase tracking-widest">المجموعات</span>
            </button>
            <button onClick={() => setView('teacher-weekly')} className={`flex-1 flex flex-col items-center gap-1 py-4 rounded-[2.5rem] transition-all ${view === 'teacher-weekly' ? 'bg-indigo-900 text-white shadow-xl scale-105' : 'text-slate-400'}`}>
                {ICONS.Calendar} <span className="text-[10px] font-black uppercase tracking-widest">الجدول</span>
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setView('schedule')} className={`flex-1 flex flex-col items-center gap-1 py-4 rounded-[2.5rem] transition-all ${view === 'schedule' ? 'bg-indigo-600 text-white shadow-xl scale-105' : 'text-slate-400'}`}>
                {ICONS.Calendar} <span className="text-[10px] font-black uppercase tracking-widest">الجدول</span>
            </button>
            <button onClick={() => setView('homework')} className={`flex-1 flex flex-col items-center gap-1 py-4 rounded-[2.5rem] transition-all ${view === 'homework' ? 'bg-emerald-600 text-white shadow-xl scale-105' : 'text-slate-400'}`}>
                {ICONS.CheckSquare} <span className="text-[10px] font-black uppercase tracking-widest">الواجبات</span>
            </button>
            <button onClick={() => setView('student-results')} className={`flex-1 flex flex-col items-center gap-1 py-4 rounded-[2.5rem] transition-all ${view === 'student-results' ? 'bg-amber-600 text-white shadow-xl scale-105' : 'text-slate-400'}`}>
                {ICONS.ClipboardList} <span className="text-[10px] font-black uppercase tracking-widest">النتائج</span>
            </button>
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
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; }
      `}</style>
    </div>
  );
};

export default App;
