
export type DayOfWeek = 'الأحد' | 'الاثنين' | 'الثلاثاء' | 'الأربعاء' | 'الخميس' | 'الجمعة' | 'السبت';
export type UserRole = 'teacher' | 'student';

export interface Student {
  id: string;
  name: string;
  username: string; 
  paid: boolean;
  notes?: string;
  starred?: boolean;
  phone?: string;
}

export interface ExamResult {
  studentId: string;
  grade: number;
  status: 'present' | 'absent' | 'excused';
  notified?: boolean; 
}

export interface Exam {
  id: string;
  title: string;
  date: string;
  maxGrade: number;
  type: 'daily' | 'semester';
  results: Record<string, ExamResult>;
}

export interface GroupSchedule {
  id: string;
  day: DayOfWeek;
  time: string;
}

export interface Group {
  id: string;
  name: string;
  location: string;
  phone?: string;
  schedule: GroupSchedule[];
  students: Student[];
  exams: Exam[];
  studentUsernames: string[];
  teacherUid?: string;
}

export const DAYS: DayOfWeek[] = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const SUBJECTS = ['كيمياء', 'فيزياء', 'أحياء', 'اللغة العربية', 'اللغة الانكليزية', 'رياضيات', 'التربية الاسلامية'];

export interface UserConfig {
  name: string;
  username: string;
  role: UserRole | null;
  profileImage: string | null;
  darkMode: boolean;
  onboarded: boolean;
}

export interface StudentHomework {
  id: string;
  subject: string;
  task: string;
  completed: boolean;
  createdAt: string;
}

export interface StudentLecture {
  id: string;
  subject: string;
  day: DayOfWeek;
  time: string;
  type: 'online' | 'physical';
  location?: string;
  postponed: boolean;
}
