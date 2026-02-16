import { useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type {
  Student, ScheduleSlot, AttendanceRecord, Payment, Holiday,
  AcademySettings, TabType, TrialStudent, TrialLesson, CurriculumFile
} from '../types';
import { DEFAULT_SETTINGS } from '../utils/helpers';

const STORAGE_KEYS = {
  students: 'seocho_students',
  schedules: 'seocho_schedules',
  attendance: 'seocho_attendance',
  payments: 'seocho_payments',
  holidays: 'seocho_holidays',
  settings: 'seocho_settings',
  trialStudents: 'seocho_trial_students',
  trialLessons: 'seocho_trial_lessons',
  curriculum: 'seocho_curriculum',
};

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, data: T): void {
  localStorage.setItem(key, JSON.stringify(data));
}

export function useStore() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [students, setStudents] = useState<Student[]>(() => {
    const loaded = loadFromStorage<Record<string, unknown>[]>(STORAGE_KEYS.students, []);
    return loaded.map(s => {
      const student = s as unknown as Student & { regularStartTime?: string };
      // regularSchedule이 이미 있으면 그대로 사용
      if (student.regularSchedule && Array.isArray(student.regularSchedule) && student.regularSchedule.length > 0) {
        return student as Student;
      }
      // regularStartTimes에서 마이그레이션
      if (student.regularStartTimes && student.regularDays) {
        const schedule = student.regularDays.map(day => ({
          day,
          startTime: student.regularStartTimes![day] || '14:00',
        }));
        return { ...student, regularSchedule: schedule } as Student;
      }
      // regularStartTime (단일)에서 마이그레이션
      if (student.regularStartTime && student.regularDays) {
        const schedule = student.regularDays.map(day => ({
          day,
          startTime: student.regularStartTime!,
        }));
        return { ...student, regularSchedule: schedule } as Student;
      }
      return { ...student, regularSchedule: [] } as Student;
    });
  });
  const [schedules, setSchedules] = useState<ScheduleSlot[]>(() => loadFromStorage(STORAGE_KEYS.schedules, []));
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(() => loadFromStorage(STORAGE_KEYS.attendance, []));
  const [payments, setPayments] = useState<Payment[]>(() => loadFromStorage(STORAGE_KEYS.payments, []));
  const [holidays, setHolidays] = useState<Holiday[]>(() => loadFromStorage(STORAGE_KEYS.holidays, []));
  const [settings, setSettings] = useState<AcademySettings>(() => loadFromStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS));
  const [trialStudents, setTrialStudents] = useState<TrialStudent[]>(() => loadFromStorage(STORAGE_KEYS.trialStudents, []));
  const [trialLessons, setTrialLessons] = useState<TrialLesson[]>(() => loadFromStorage(STORAGE_KEYS.trialLessons, []));
  const [curriculum, setCurriculum] = useState<CurriculumFile[]>(() => loadFromStorage(STORAGE_KEYS.curriculum, []));

  // Persist to localStorage on changes
  useEffect(() => { saveToStorage(STORAGE_KEYS.students, students); }, [students]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.schedules, schedules); }, [schedules]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.attendance, attendance); }, [attendance]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.payments, payments); }, [payments]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.holidays, holidays); }, [holidays]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.settings, settings); }, [settings]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.trialStudents, trialStudents); }, [trialStudents]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.trialLessons, trialLessons); }, [trialLessons]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.curriculum, curriculum); }, [curriculum]);

  // Student CRUD
  const addStudent = useCallback((student: Omit<Student, 'id' | 'createdAt' | 'active'>) => {
    const newStudent: Student = {
      ...student,
      id: uuidv4(),
      active: true,
      createdAt: new Date().toISOString(),
    };
    setStudents(prev => [...prev, newStudent]);
    return newStudent;
  }, []);

  const updateStudent = useCallback((id: string, updates: Partial<Student>) => {
    setStudents(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, []);

  const deleteStudent = useCallback((id: string) => {
    setStudents(prev => prev.map(s => s.id === id ? { ...s, active: false } : s));
  }, []);

  // Schedule CRUD
  const addSchedule = useCallback((slot: Omit<ScheduleSlot, 'id'>) => {
    const newSlot: ScheduleSlot = { ...slot, id: uuidv4() };
    setSchedules(prev => [...prev, newSlot]);
    return newSlot;
  }, []);

  const updateSchedule = useCallback((id: string, updates: Partial<ScheduleSlot>) => {
    setSchedules(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, []);

  const removeSchedule = useCallback((id: string) => {
    setSchedules(prev => prev.filter(s => s.id !== id));
  }, []);

  const moveSchedule = useCallback((id: string, newDay: ScheduleSlot['dayOfWeek'], newTime: string) => {
    setSchedules(prev => prev.map(s =>
      s.id === id ? { ...s, dayOfWeek: newDay, startTime: newTime } : s
    ));
  }, []);

  // Attendance CRUD
  const addAttendance = useCallback((record: Omit<AttendanceRecord, 'id'>) => {
    const newRecord: AttendanceRecord = { ...record, id: uuidv4() };
    setAttendance(prev => [...prev, newRecord]);

    // Update payment sessions used
    if (record.status === '출석' || record.status === '보강') {
      setPayments(prev => {
        const activePayment = prev.find(p =>
          p.studentId === record.studentId && !p.completed && p.remainingSessions > 0
        );
        if (activePayment) {
          return prev.map(p => p.id === activePayment.id ? {
            ...p,
            usedSessions: p.usedSessions + 1,
            remainingSessions: p.remainingSessions - 1,
            completed: p.remainingSessions - 1 <= 0,
          } : p);
        }
        return prev;
      });
    }
    return newRecord;
  }, []);

  const updateAttendance = useCallback((id: string, updates: Partial<AttendanceRecord>) => {
    setAttendance(prev => {
      const existing = prev.find(r => r.id === id);
      if (existing && updates.status && updates.status !== existing.status) {
        const wasCountable = existing.status === '출석' || existing.status === '보강';
        const willBeCountable = updates.status === '출석' || updates.status === '보강';

        if (wasCountable && !willBeCountable) {
          // Was counted, now not (e.g. 출석→결석): restore session
          setPayments(p => {
            const activePayment = p.find(pay =>
              pay.studentId === existing.studentId && !pay.completed
            );
            if (activePayment) {
              return p.map(pay => pay.id === activePayment.id ? {
                ...pay,
                usedSessions: Math.max(0, pay.usedSessions - 1),
                remainingSessions: pay.remainingSessions + 1,
                completed: false,
              } : pay);
            }
            return p;
          });
        } else if (!wasCountable && willBeCountable) {
          // Was not counted, now counted (e.g. 결석→출석): consume session
          setPayments(p => {
            const activePayment = p.find(pay =>
              pay.studentId === existing.studentId && !pay.completed && pay.remainingSessions > 0
            );
            if (activePayment) {
              return p.map(pay => pay.id === activePayment.id ? {
                ...pay,
                usedSessions: pay.usedSessions + 1,
                remainingSessions: pay.remainingSessions - 1,
                completed: pay.remainingSessions - 1 <= 0,
              } : pay);
            }
            return p;
          });
        }
      }
      return prev.map(r => r.id === id ? { ...r, ...updates } : r);
    });
  }, []);

  const deleteAttendance = useCallback((id: string) => {
    setAttendance(prev => {
      const existing = prev.find(r => r.id === id);
      // If deleting a counted attendance record, restore the session
      if (existing && (existing.status === '출석' || existing.status === '보강')) {
        setPayments(p => {
          const activePayment = p.find(pay =>
            pay.studentId === existing.studentId && !pay.completed
          ) || p.find(pay =>
            pay.studentId === existing.studentId && pay.completed && pay.remainingSessions === 0
          );
          if (activePayment) {
            return p.map(pay => pay.id === activePayment.id ? {
              ...pay,
              usedSessions: Math.max(0, pay.usedSessions - 1),
              remainingSessions: pay.remainingSessions + 1,
              completed: false,
            } : pay);
          }
          return p;
        });
      }
      return prev.filter(r => r.id !== id);
    });
  }, []);

  // Payment CRUD
  const addPayment = useCallback((payment: Omit<Payment, 'id' | 'usedSessions' | 'remainingSessions' | 'completed'>) => {
    const newPayment: Payment = {
      ...payment,
      id: uuidv4(),
      usedSessions: 0,
      remainingSessions: payment.totalSessions,
      completed: false,
    };
    setPayments(prev => [...prev, newPayment]);
    return newPayment;
  }, []);

  const updatePayment = useCallback((id: string, updates: Partial<Payment>) => {
    setPayments(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  }, []);

  const deletePayment = useCallback((id: string) => {
    setPayments(prev => prev.filter(p => p.id !== id));
  }, []);

  // Holiday CRUD
  const addHoliday = useCallback((holiday: Omit<Holiday, 'id'>) => {
    const newHoliday: Holiday = { ...holiday, id: uuidv4() };
    setHolidays(prev => [...prev, newHoliday]);
    return newHoliday;
  }, []);

  const removeHoliday = useCallback((id: string) => {
    setHolidays(prev => prev.filter(h => h.id !== id));
  }, []);

  // Settings
  const updateSettings = useCallback((updates: Partial<AcademySettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);

  // Trial Student CRUD
  const addTrialStudent = useCallback((data: Omit<TrialStudent, 'id' | 'createdAt'>) => {
    const newTrialStudent: TrialStudent = {
      ...data,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
    };
    setTrialStudents(prev => [...prev, newTrialStudent]);
    return newTrialStudent;
  }, []);

  const updateTrialStudent = useCallback((id: string, updates: Partial<TrialStudent>) => {
    setTrialStudents(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, []);

  const deleteTrialStudent = useCallback((id: string) => {
    setTrialStudents(prev => prev.filter(s => s.id !== id));
    setTrialLessons(prev => prev.filter(l => l.trialStudentId !== id));
  }, []);

  // Trial Lesson CRUD
  const addTrialLesson = useCallback((data: Omit<TrialLesson, 'id'>) => {
    const newLesson: TrialLesson = { ...data, id: uuidv4() };
    setTrialLessons(prev => [...prev, newLesson]);
    return newLesson;
  }, []);

  const updateTrialLesson = useCallback((id: string, updates: Partial<TrialLesson>) => {
    setTrialLessons(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
  }, []);

  const deleteTrialLesson = useCallback((id: string) => {
    setTrialLessons(prev => prev.filter(l => l.id !== id));
  }, []);

  // Curriculum CRUD
  const addCurriculumFile = useCallback((data: Omit<CurriculumFile, 'id' | 'createdAt'>) => {
    const newFile: CurriculumFile = { ...data, id: uuidv4(), createdAt: new Date().toISOString() };
    setCurriculum(prev => [...prev, newFile]);
    return newFile;
  }, []);

  const deleteCurriculumFile = useCallback((id: string) => {
    setCurriculum(prev => prev.filter(f => f.id !== id));
  }, []);

  // Helper: get student's active payment
  const getActivePayment = useCallback((studentId: string): Payment | undefined => {
    return payments.find(p => p.studentId === studentId && !p.completed && p.remainingSessions > 0);
  }, [payments]);

  // Helper: get student's attendance for a date range
  const getAttendanceByDateRange = useCallback((studentId: string, startDate: string, endDate: string) => {
    return attendance.filter(r =>
      r.studentId === studentId && r.date >= startDate && r.date <= endDate
    );
  }, [attendance]);

  return {
    activeTab, setActiveTab,
    students, addStudent, updateStudent, deleteStudent,
    schedules, addSchedule, updateSchedule, removeSchedule, moveSchedule,
    attendance, addAttendance, updateAttendance, deleteAttendance,
    payments, addPayment, updatePayment, deletePayment,
    holidays, addHoliday, removeHoliday,
    settings, updateSettings,
    trialStudents, addTrialStudent, updateTrialStudent, deleteTrialStudent,
    trialLessons, addTrialLesson, updateTrialLesson, deleteTrialLesson,
    curriculum, addCurriculumFile, deleteCurriculumFile,
    getActivePayment, getAttendanceByDateRange,
  };
}

export type StoreType = ReturnType<typeof useStore>;
