import { useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type {
  Student, ScheduleSlot, AttendanceRecord, Payment, Holiday,
  AcademySettings, TabType
} from '../types';
import { DEFAULT_SETTINGS } from '../utils/helpers';

const STORAGE_KEYS = {
  students: 'seocho_students',
  schedules: 'seocho_schedules',
  attendance: 'seocho_attendance',
  payments: 'seocho_payments',
  holidays: 'seocho_holidays',
  settings: 'seocho_settings',
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
  const [students, setStudents] = useState<Student[]>(() => loadFromStorage(STORAGE_KEYS.students, []));
  const [schedules, setSchedules] = useState<ScheduleSlot[]>(() => loadFromStorage(STORAGE_KEYS.schedules, []));
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(() => loadFromStorage(STORAGE_KEYS.attendance, []));
  const [payments, setPayments] = useState<Payment[]>(() => loadFromStorage(STORAGE_KEYS.payments, []));
  const [holidays, setHolidays] = useState<Holiday[]>(() => loadFromStorage(STORAGE_KEYS.holidays, []));
  const [settings, setSettings] = useState<AcademySettings>(() => loadFromStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS));

  // Persist to localStorage on changes
  useEffect(() => { saveToStorage(STORAGE_KEYS.students, students); }, [students]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.schedules, schedules); }, [schedules]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.attendance, attendance); }, [attendance]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.payments, payments); }, [payments]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.holidays, holidays); }, [holidays]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.settings, settings); }, [settings]);

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
    setAttendance(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  }, []);

  const deleteAttendance = useCallback((id: string) => {
    setAttendance(prev => prev.filter(r => r.id !== id));
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
    getActivePayment, getAttendanceByDateRange,
  };
}

export type StoreType = ReturnType<typeof useStore>;
