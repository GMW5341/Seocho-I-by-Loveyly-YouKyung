import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type {
  Student, ScheduleSlot, AttendanceRecord, Payment, Holiday,
  AcademySettings, TabType, TrialStudent, TrialLesson, CurriculumFile, MessageTemplate,
  SpecialClass, SpecialClassStudent
} from '../types';
import { DEFAULT_SETTINGS } from '../utils/helpers';
import { pushToCloud, isSyncEnabled, startRealtimeSync, hasReceivedInitialSnapshot } from '../services/firebaseSync';
import { saveCurriculumImage, deleteCurriculumImage } from '../services/curriculumImageStore';

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
  messageTemplates: 'seocho_message_templates',
  specialClasses: 'seocho_special_classes',
  specialClassStudents: 'seocho_special_class_students',
  logoDataUrl: 'seocho_logo',
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
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error(`localStorage save failed for ${key}:`, e);
  }
}

export function useStore() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [students, setStudents] = useState<Student[]>(() => {
    const loaded = loadFromStorage<Record<string, unknown>[]>(STORAGE_KEYS.students, []);
    // Strip deprecated schedule fields from student records (clean migration)
    return loaded.map(s => {
      const { classDuration: _cd, sessionsPerWeek: _spw, regularSchedule: _rs, regularDays: _rd, regularStartTimes: _rst, regularStartTime: _rst2, ...clean } = s as Record<string, unknown>;
      return clean as unknown as Student;
    });
  });
  // Load payments first (needed for schedule migration)
  const [payments, setPayments] = useState<Payment[]>(() => loadFromStorage(STORAGE_KEYS.payments, []));
  const [schedules, setSchedules] = useState<ScheduleSlot[]>(() => {
    const loaded = loadFromStorage<ScheduleSlot[]>(STORAGE_KEYS.schedules, []);
    // Check if migration from payment-derived to independent schedules is needed
    const hasPaymentLinked = loaded.some(s => s.source === 'payment' || s.source === 'direct');
    if (hasPaymentLinked) return loaded; // Already migrated

    // Migrate: convert Payment.regularSchedule → independent ScheduleSlot records
    const allPayments = loadFromStorage<Payment[]>(STORAGE_KEYS.payments, []);
    const migratedSlots: ScheduleSlot[] = [];

    // For each student with a payment that has regularSchedule, create independent slots
    const processedStudents = new Set<string>();
    // Process active payments first, then completed (for fallback)
    const sortedPayments = [...allPayments].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return b.paidAt.localeCompare(a.paidAt);
    });

    for (const p of sortedPayments) {
      if (processedStudents.has(p.studentId)) continue;
      if (!p.regularSchedule?.length) continue;
      processedStudents.add(p.studentId);
      for (const entry of p.regularSchedule) {
        migratedSlots.push({
          id: uuidv4(),
          studentId: p.studentId,
          dayOfWeek: entry.day,
          startTime: entry.startTime,
          duration: p.classDuration,
          isRegular: true,
          source: 'payment',
          linkedPaymentId: p.id,
        });
      }
    }

    // Also migrate old student-only schedule data (from legacy Student.regularSchedule)
    // by checking loaded schedules that had isRegular=true (old format had them stripped, but some might remain)
    const nonRegular = loaded.filter(s => !s.isRegular);
    // Tag existing non-regular slots with source
    const taggedNonRegular = nonRegular.map(s => ({
      ...s,
      source: (s.isTrial ? 'trial' : 'makeup') as ScheduleSlot['source'],
    }));

    return [...migratedSlots, ...taggedNonRegular];
  });
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(() => loadFromStorage(STORAGE_KEYS.attendance, []));
  const [holidays, setHolidays] = useState<Holiday[]>(() => loadFromStorage(STORAGE_KEYS.holidays, []));
  const [settings, setSettings] = useState<AcademySettings>(() => loadFromStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS));
  const [trialStudents, setTrialStudents] = useState<TrialStudent[]>(() => loadFromStorage(STORAGE_KEYS.trialStudents, []));
  const [trialLessons, setTrialLessons] = useState<TrialLesson[]>(() => loadFromStorage(STORAGE_KEYS.trialLessons, []));
  const [curriculum, setCurriculum] = useState<CurriculumFile[]>(() => {
    const loaded = loadFromStorage<CurriculumFile[]>(STORAGE_KEYS.curriculum, []);
    // Migrate existing dataUrls to IndexedDB (one-time)
    loaded.forEach(f => {
      if (f.dataUrl) {
        saveCurriculumImage(f.id, f.dataUrl).catch(console.error);
      }
    });
    return loaded;
  });
  const [messageTemplates, setMessageTemplates] = useState<MessageTemplate[]>(() => loadFromStorage(STORAGE_KEYS.messageTemplates, []));
  const [specialClasses, setSpecialClasses] = useState<SpecialClass[]>(() => loadFromStorage(STORAGE_KEYS.specialClasses, []));
  const [specialClassStudents, setSpecialClassStudents] = useState<SpecialClassStudent[]>(() => loadFromStorage(STORAGE_KEYS.specialClassStudents, []));
  const [logoDataUrl, setLogoDataUrl] = useState<string>(() => loadFromStorage(STORAGE_KEYS.logoDataUrl, ''));

  // Cloud sync: debounced push (only after initial snapshot received to prevent empty data overwrite)
  const cloudSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleCloudPush = useCallback(() => {
    if (!isSyncEnabled()) return;
    if (cloudSyncTimer.current) clearTimeout(cloudSyncTimer.current);
    cloudSyncTimer.current = setTimeout(() => {
      if (hasReceivedInitialSnapshot()) {
        pushToCloud();
      }
    }, 1000);
  }, []);

  // Start real-time listener for changes from OTHER devices
  // (Initial data was already loaded by CloudDataLoader before React rendered)
  useEffect(() => {
    if (!isSyncEnabled()) return;
    try {
      startRealtimeSync(() => {
        // Another device changed data - reload to pick up changes
        window.location.reload();
      });
    } catch (e) {
      console.error('Realtime sync start failed:', e);
    }
  }, []);

  // One-time data cleanup: remove orphaned data on mount
  const hasCleanedUp = useRef(false);
  useEffect(() => {
    if (hasCleanedUp.current) return;
    hasCleanedUp.current = true;

    // 1. Clean up orphaned schedule entries
    const paymentStudentIds = new Set(payments.map(p => p.studentId));
    const activeStudentIds = new Set(students.filter(s => s.active).map(s => s.id));
    setSchedules(prev => {
      const cleaned = prev.filter(s => {
        if (!s.studentId) return true;
        if (!activeStudentIds.has(s.studentId) && !paymentStudentIds.has(s.studentId)) return false;
        if (s.isOverrideHidden && !paymentStudentIds.has(s.studentId)) return false;
        return true;
      });
      return cleaned.length === prev.length ? prev : cleaned;
    });

    // 2. Clean up stale completed-only payments (students with no active payment
    //    whose completed payment period has long passed → remove to prevent 미결제 fallback)
    const today = new Date().toISOString().slice(0, 10);
    const staleStudentIds = new Set<string>();
    const studentPaymentMap = new Map<string, typeof payments>();
    payments.forEach(p => {
      if (!studentPaymentMap.has(p.studentId)) studentPaymentMap.set(p.studentId, []);
      studentPaymentMap.get(p.studentId)!.push(p);
    });
    studentPaymentMap.forEach((studentPayments, sid) => {
      const hasActive = studentPayments.some(p => !p.completed && p.remainingSessions > 0);
      if (hasActive) return; // has active payment → keep
      // Only completed payments remain → check if stale
      const latest = studentPayments.sort((a, b) => b.paidAt.localeCompare(a.paidAt))[0];
      if (!latest) return;
      const sessionsPerWeek = latest.regularSchedule?.length || latest.sessionsPerWeek || 1; // sessionsPerWeek kept on Payment type
      const estimatedWeeks = Math.ceil(latest.totalSessions / sessionsPerWeek);
      const endDate = new Date(latest.startDate);
      endDate.setDate(endDate.getDate() + estimatedWeeks * 7 + 28); // +4 weeks buffer
      if (endDate.toISOString().slice(0, 10) < today) {
        staleStudentIds.add(sid);
      }
    });
    if (staleStudentIds.size > 0) {
      setPayments(prev => prev.filter(p => !staleStudentIds.has(p.studentId)));
      setSchedules(prev => prev.filter(s => !staleStudentIds.has(s.studentId)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist to localStorage on changes + trigger cloud sync
  useEffect(() => { saveToStorage(STORAGE_KEYS.students, students); scheduleCloudPush(); }, [students, scheduleCloudPush]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.schedules, schedules); scheduleCloudPush(); }, [schedules, scheduleCloudPush]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.attendance, attendance); scheduleCloudPush(); }, [attendance, scheduleCloudPush]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.payments, payments); scheduleCloudPush(); }, [payments, scheduleCloudPush]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.holidays, holidays); scheduleCloudPush(); }, [holidays, scheduleCloudPush]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.settings, settings); scheduleCloudPush(); }, [settings, scheduleCloudPush]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.trialStudents, trialStudents); scheduleCloudPush(); }, [trialStudents, scheduleCloudPush]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.trialLessons, trialLessons); scheduleCloudPush(); }, [trialLessons, scheduleCloudPush]);
  useEffect(() => {
    // Save new images to IndexedDB, then store only metadata in localStorage
    curriculum.forEach(f => {
      if (f.dataUrl) {
        saveCurriculumImage(f.id, f.dataUrl).catch(console.error);
      }
    });
    const metadata = curriculum.map(({ dataUrl: _du, ...rest }) => ({ ...rest, dataUrl: '' }));
    saveToStorage(STORAGE_KEYS.curriculum, metadata);
    scheduleCloudPush();
  }, [curriculum, scheduleCloudPush]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.messageTemplates, messageTemplates); scheduleCloudPush(); }, [messageTemplates, scheduleCloudPush]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.specialClasses, specialClasses); scheduleCloudPush(); }, [specialClasses, scheduleCloudPush]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.specialClassStudents, specialClassStudents); scheduleCloudPush(); }, [specialClassStudents, scheduleCloudPush]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.logoDataUrl, logoDataUrl); scheduleCloudPush(); }, [logoDataUrl, scheduleCloudPush]);

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
    // Clean up schedule entries for withdrawn student
    setSchedules(prev => prev.filter(s => s.studentId !== id));
  }, []);

  const permanentDeleteStudent = useCallback((id: string) => {
    setStudents(prev => prev.filter(s => s.id !== id));
    setSchedules(prev => prev.filter(s => s.studentId !== id));
    setAttendance(prev => prev.filter(a => a.studentId !== id));
    setPayments(prev => prev.filter(p => p.studentId !== id));
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

  const restoreSchedule = useCallback((slot: ScheduleSlot) => {
    setSchedules(prev => [...prev, slot]);
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
            ) || p.find(pay =>
              pay.studentId === existing.studentId && pay.completed && pay.remainingSessions === 0
            );
            if (activePayment) {
              const newRemaining = Math.min(activePayment.remainingSessions + 1, activePayment.totalSessions);
              return p.map(pay => pay.id === activePayment.id ? {
                ...pay,
                usedSessions: Math.max(0, pay.usedSessions - 1),
                remainingSessions: newRemaining,
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
            const newRemaining = Math.min(activePayment.remainingSessions + 1, activePayment.totalSessions);
            return p.map(pay => pay.id === activePayment.id ? {
              ...pay,
              usedSessions: Math.max(0, pay.usedSessions - 1),
              remainingSessions: newRemaining,
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
    const paymentId = uuidv4();
    const newPayment: Payment = {
      ...payment,
      id: paymentId,
      usedSessions: 0,
      remainingSessions: payment.totalSessions,
      completed: false,
    };
    setPayments(prev => [...prev, newPayment]);

    // If payment has regularSchedule, link existing schedule slots or create new ones
    if (payment.regularSchedule?.length) {
      setSchedules(prev => {
        // Remove old overrides and unlinked payment slots for this student
        const cleaned = prev.filter(s => !(s.isOverrideHidden && s.studentId === payment.studentId));

        // Link existing direct/payment regular slots to this new payment,
        // or create new slots if schedule entries are new
        const existingRegular = cleaned.filter(s =>
          s.studentId === payment.studentId && s.isRegular && !s.isOverrideHidden
        );
        const newSlots: ScheduleSlot[] = [];
        const updatedIds = new Set<string>();

        for (const entry of payment.regularSchedule!) {
          const existing = existingRegular.find(s =>
            s.dayOfWeek === entry.day && s.startTime === entry.startTime && !updatedIds.has(s.id)
          );
          if (existing) {
            updatedIds.add(existing.id);
          } else {
            newSlots.push({
              id: uuidv4(),
              studentId: payment.studentId,
              dayOfWeek: entry.day,
              startTime: entry.startTime,
              duration: payment.classDuration,
              isRegular: true,
              source: 'payment',
              linkedPaymentId: paymentId,
            });
          }
        }

        // Update linked payment on existing matched slots
        const result = cleaned.map(s =>
          updatedIds.has(s.id) ? { ...s, linkedPaymentId: paymentId, source: 'payment' as const, duration: payment.classDuration } : s
        );

        return [...result, ...newSlots];
      });
    }

    return newPayment;
  }, []);

  const updatePayment = useCallback((id: string, updates: Partial<Payment>) => {
    setPayments(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  }, []);

  const deletePayment = useCallback((id: string) => {
    setPayments(prev => {
      const payment = prev.find(p => p.id === id);
      if (payment) {
        const sid = payment.studentId;
        // Cascade: delete attendance records from this payment's start date
        setAttendance(att => att.filter(a =>
          !(a.studentId === sid && a.date >= payment.startDate)
        ));
        // Unlink schedules from this payment (keep slots, just remove linkage)
        setSchedules(sch => sch.map(s =>
          s.linkedPaymentId === id ? { ...s, linkedPaymentId: undefined, source: 'direct' as const } : s
        ));
      }
      return prev.filter(p => p.id !== id);
    });
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
    setCurriculum(prev => {
      const maxOrder = prev.reduce((max, f) => Math.max(max, f.order ?? 0), 0);
      const newFile: CurriculumFile = { ...data, id: uuidv4(), order: maxOrder + 1, createdAt: new Date().toISOString() };
      return [...prev, newFile];
    });
  }, []);

  const updateCurriculumFile = useCallback((id: string, updates: Partial<CurriculumFile>) => {
    setCurriculum(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  }, []);

  const reorderCurriculum = useCallback((orderedIds: string[]) => {
    setCurriculum(prev => {
      const updated = [...prev];
      orderedIds.forEach((id, index) => {
        const file = updated.find(f => f.id === id);
        if (file) file.order = orderedIds.length - index;
      });
      return updated;
    });
  }, []);

  const deleteCurriculumFile = useCallback((id: string) => {
    setCurriculum(prev => prev.filter(f => f.id !== id));
    deleteCurriculumImage(id).catch(console.error);
  }, []);

  // Message Template CRUD
  const addMessageTemplate = useCallback((data: Omit<MessageTemplate, 'id' | 'createdAt'>) => {
    const newTemplate: MessageTemplate = { ...data, id: uuidv4(), createdAt: new Date().toISOString() };
    setMessageTemplates(prev => [...prev, newTemplate]);
    return newTemplate;
  }, []);

  const updateMessageTemplate = useCallback((id: string, updates: Partial<MessageTemplate>) => {
    setMessageTemplates(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  const deleteMessageTemplate = useCallback((id: string) => {
    setMessageTemplates(prev => prev.filter(t => t.id !== id));
  }, []);

  // Special Class CRUD
  const addSpecialClass = useCallback((data: Omit<SpecialClass, 'id' | 'createdAt' | 'active'>) => {
    const newClass: SpecialClass = { ...data, id: uuidv4(), active: true, createdAt: new Date().toISOString() };
    setSpecialClasses(prev => [...prev, newClass]);
    return newClass;
  }, []);

  const updateSpecialClass = useCallback((id: string, updates: Partial<SpecialClass>) => {
    setSpecialClasses(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, []);

  const deleteSpecialClass = useCallback((id: string) => {
    setSpecialClasses(prev => prev.filter(c => c.id !== id));
    setSpecialClassStudents(prev => prev.filter(s => s.specialClassId !== id));
  }, []);

  const addSpecialClassStudent = useCallback((data: Omit<SpecialClassStudent, 'id' | 'createdAt'>) => {
    const newStudent: SpecialClassStudent = { ...data, id: uuidv4(), createdAt: new Date().toISOString() };
    setSpecialClassStudents(prev => [...prev, newStudent]);
    return newStudent;
  }, []);

  const updateSpecialClassStudent = useCallback((id: string, updates: Partial<SpecialClassStudent>) => {
    setSpecialClassStudents(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, []);

  const deleteSpecialClassStudent = useCallback((id: string) => {
    setSpecialClassStudents(prev => prev.filter(s => s.id !== id));
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
    students, addStudent, updateStudent, deleteStudent, permanentDeleteStudent,
    schedules, addSchedule, updateSchedule, removeSchedule, restoreSchedule, moveSchedule,
    attendance, addAttendance, updateAttendance, deleteAttendance,
    payments, addPayment, updatePayment, deletePayment,
    holidays, addHoliday, removeHoliday,
    settings, updateSettings,
    trialStudents, addTrialStudent, updateTrialStudent, deleteTrialStudent,
    trialLessons, addTrialLesson, updateTrialLesson, deleteTrialLesson,
    curriculum, addCurriculumFile, updateCurriculumFile, reorderCurriculum, deleteCurriculumFile,
    messageTemplates, addMessageTemplate, updateMessageTemplate, deleteMessageTemplate,
    specialClasses, addSpecialClass, updateSpecialClass, deleteSpecialClass,
    specialClassStudents, addSpecialClassStudent, updateSpecialClassStudent, deleteSpecialClassStudent,
    logoDataUrl, setLogoDataUrl,
    getActivePayment, getAttendanceByDateRange,
  };
}

export type StoreType = ReturnType<typeof useStore>;
