import { useState, useMemo, useRef, useCallback } from 'react';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAppStore } from '../../store/StoreContext';
import type { DayOfWeek, ScheduleSlot, ClassDuration, StudentGrade, AttendanceStatus } from '../../types';
import { TRIAL_PRICING } from '../../types';
import {
  DAYS_OF_WEEK,
  getOperatingHours,
  getEndTime,
  isTimeOverlapping,
  getDurationColor,
  getDurationAccent,
  getDurationTextColor,
  timeToMinutes,
  minutesToTime,
  layoutSlotsForDay,
  formatCurrency,
  calculateLastClassDate,
  expandHolidayDates,
} from '../../utils/helpers';
import Modal from '../common/Modal';
import MakeupForm from './MakeupForm';
import TrialForm from './TrialForm';
import DirectScheduleForm from './DirectScheduleForm';

const PX_PER_MINUTE_WEEK = 2.5;
const PX_PER_MINUTE_DAY = 6.5;

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  '출석': 'ring-2 ring-green-500',
  '결석': 'ring-2 ring-red-500 bg-red-50',
  '보강': 'ring-2 ring-blue-500',
  '예정': '',
};

interface DisplaySlot {
  id: string;
  studentId: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  duration: number;
  isRegular: boolean;
  isTrial?: boolean;
  trialStudentId?: string;
  date?: string;
  isSpecialClass?: boolean;
  specialClassName?: string;
  specialClassStudentCount?: number;
  isUnpaid?: boolean;
  column: number;
  numColumns: number;
}

export default function ScheduleGrid() {
  const {
    students, schedules, settings, trialStudents, attendance, payments, holidays,
    moveSchedule, updateSchedule, removeSchedule, restoreSchedule, addSchedule,
    addTrialStudent, addTrialLesson,
    addAttendance, updateAttendance, deleteAttendance,
    addPayment, updatePayment, deleteStudent,
    specialClasses, specialClassStudents,
  } = useAppStore();
  const [showMakeupForm, setShowMakeupForm] = useState(false);
  const [showTrialForm, setShowTrialForm] = useState(false);
  const [showDirectForm, setShowDirectForm] = useState(false);
  const [draggedSlot, setDraggedSlot] = useState<ScheduleSlot | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ day: DayOfWeek; time: string } | null>(null);
  const [memoSlot, setMemoSlot] = useState<{ slotId: string; studentId: string; date: string; startTime: string; memo: string } | null>(null);
  const [deletedSlot, setDeletedSlot] = useState<ScheduleSlot | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDay, setSelectedDay] = useState<DayOfWeek | null>(null);
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const PX_PER_MINUTE = selectedDay ? PX_PER_MINUTE_DAY : PX_PER_MINUTE_WEEK;
  const dayColumnRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scheduleGridRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef(0);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Week navigation
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
  const weekStartStr = format(currentWeekStart, 'yyyy-MM-dd');
  const weekEndStr = format(weekEnd, 'yyyy-MM-dd');
  const goToPrevWeek = () => setCurrentWeekStart(prev => subWeeks(prev, 1));
  const goToNextWeek = () => setCurrentWeekStart(prev => addWeeks(prev, 1));

  // Get specific date for a day-of-week in the current viewed week
  const getDateForDay = useCallback((day: DayOfWeek): string => {
    const dayMap: Record<DayOfWeek, number> = { '월': 0, '화': 1, '수': 2, '목': 3, '금': 4, '토': 5 };
    const offset = dayMap[day];
    const date = new Date(currentWeekStart);
    date.setDate(date.getDate() + offset);
    return format(date, 'yyyy-MM-dd');
  }, [currentWeekStart]);

  // 이번 주 공휴일/휴원일 계산
  const getHolidayName = useCallback((dateStr: string): string | null => {
    for (const h of holidays) {
      if (h.endDate) {
        if (dateStr >= h.date && dateStr <= h.endDate) return h.name;
      } else if (h.date === dateStr) {
        return h.name;
      }
    }
    return null;
  }, [holidays]);

  const activeStudents = useMemo(() => students.filter(s => s.active), [students]);

  const getStudentById = useCallback((id: string) => {
    return activeStudents.find(s => s.id === id);
  }, [activeStudents]);

  const getTrialStudentById = useCallback((id: string) => {
    return trialStudents.find(s => s.id === id);
  }, [trialStudents]);

  // Get attendance record for student on a specific date + startTime
  const getAttendanceRecord = useCallback((studentId: string, date: string, startTime?: string) => {
    if (startTime) {
      return attendance.find(r => r.studentId === studentId && r.date === date && r.startTime === startTime);
    }
    return attendance.find(r => r.studentId === studentId && r.date === date);
  }, [attendance]);

  // Toggle attendance from schedule block - per slot
  const handleScheduleAttendance = (studentId: string, day: DayOfWeek, status: AttendanceStatus, slotStartTime: string, slotDuration: ClassDuration) => {
    const date = getDateForDay(day);
    const student = getStudentById(studentId);
    if (!student) return;

    const existing = attendance.find(r =>
      r.studentId === studentId && r.date === date && r.startTime === slotStartTime
    );

    if (existing) {
      if (existing.status === status) {
        // Toggle off: if memo exists, keep the record but preserve memo
        if (existing.memo) {
          // Don't delete - just keep as-is to preserve memo
          return;
        }
        deleteAttendance(existing.id);
      } else {
        // Change status - memo is preserved automatically
        updateAttendance(existing.id, { status });
      }
    } else {
      addAttendance({
        studentId,
        date,
        status,
        startTime: slotStartTime,
        duration: slotDuration,
        isMakeup: status === '보강',
        memo: '',
      });
    }
  };

  // PDF Export: clone schedule into a standalone container outside #root,
  // then use CSS zoom (affects real layout) to fit A4 single page.
  const handleExportPdf = useCallback(() => {
    const el = scheduleGridRef.current;
    if (!el || !selectedDay) return;
    setIsPdfExporting(true);

    // 1. Clone the schedule grid (React DOM untouched)
    const clone = el.cloneNode(true) as HTMLElement;
    clone.style.cssText = 'overflow:visible; max-height:none; height:auto; margin:0; border:none; border-radius:0; background:white;';
    const innerClone = clone.firstElementChild as HTMLElement | null;
    if (innerClone) innerClone.style.cssText = 'overflow:visible; min-width:0;';

    // 2. Create a wrapper in normal document flow (NOT position:absolute)
    const wrapper = document.createElement('div');
    wrapper.id = 'schedule-print-wrapper';
    wrapper.style.cssText = 'background:white; width:100%;';
    wrapper.appendChild(clone);

    // 3. Hide #root, add wrapper to body as the sole visible content
    const root = document.getElementById('root');
    if (root) root.style.display = 'none';
    document.body.appendChild(wrapper);

    // 4. Double-rAF for layout recalc, then measure & zoom
    requestAnimationFrame(() => requestAnimationFrame(() => {
      // A4 portrait at 96dpi ≈ 1123px, minus ~10mm margins each side ≈ 1040px usable
      const A4_USABLE = 1040;
      const fullHeight = clone.scrollHeight;
      if (fullHeight > A4_USABLE) {
        // zoom (unlike transform) changes actual layout size → browser paginates correctly
        wrapper.style.setProperty('zoom', String(A4_USABLE / fullHeight));
      }

      window.print();

      // 5. Cleanup: remove wrapper, restore #root
      document.body.removeChild(wrapper);
      if (root) root.style.display = '';
      setIsPdfExporting(false);
    }));
  }, [selectedDay]);

  // Compute time range — per-day when in day view, unified when in week view
  const timeRange = useMemo(() => {
    let earliest = 24 * 60;
    let latest = 0;

    if (selectedDay) {
      // 일별 보기: 해당 요일의 운영 시간만 사용
      const hours = getOperatingHours(settings, selectedDay);
      if (hours) {
        earliest = timeToMinutes(hours.start);
        latest = timeToMinutes(hours.end);
      }
    } else {
      // 주간 보기: 모든 요일의 운영 시간 통합
      DAYS_OF_WEEK.forEach(day => {
        const hours = getOperatingHours(settings, day);
        if (hours) {
          earliest = Math.min(earliest, timeToMinutes(hours.start));
          latest = Math.max(latest, timeToMinutes(hours.end));
        }
      });
    }

    if (earliest >= latest) {
      earliest = 10 * 60;
      latest = 19 * 60;
    }
    return { earliest, latest, totalMinutes: latest - earliest };
  }, [settings, selectedDay]);

  const totalHeight = timeRange.totalMinutes * PX_PER_MINUTE;

  // Time markers at 30-minute intervals
  const timeMarkers = useMemo(() => {
    const markers: string[] = [];
    const startMin = Math.ceil(timeRange.earliest / 30) * 30;
    for (let m = startMin; m <= timeRange.latest; m += 30) {
      markers.push(minutesToTime(m));
    }
    return markers;
  }, [timeRange]);

  // Track unpaid student IDs (has regular schedule but no active payment)
  const unpaidStudentIds = useMemo(() => {
    const ids = new Set<string>();
    // Students with regular schedule slots but no active payment
    const studentsWithSchedule = new Set(
      schedules.filter(s => s.isRegular && !s.isOverrideHidden).map(s => s.studentId)
    );
    studentsWithSchedule.forEach(sid => {
      const hasActive = payments.some(p => p.studentId === sid && !p.completed && p.remainingSessions > 0);
      if (!hasActive) ids.add(sid);
    });
    return ids;
  }, [schedules, payments]);

  // Compute projected end dates for payments (for date-range filtering)
  const holidayDates = useMemo(() => expandHolidayDates(holidays), [holidays]);

  const paymentEndDateMap = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const p of payments) {
      if (p.completed) {
        map.set(p.id, null);
      } else if (p.startDate && p.regularSchedule?.length) {
        const endDate = calculateLastClassDate(
          p.startDate,
          p.totalSessions,
          p.regularSchedule,
          holidayDates,
          attendance.filter(a => a.studentId === p.studentId)
        );
        map.set(p.id, endDate);
      }
    }
    return map;
  }, [payments, holidayDates, attendance]);

  // Compute end dates for direct (unlinked) schedule slots with totalSessions
  const directEndDateMap = useMemo(() => {
    const map = new Map<string, string | null>();
    // Group direct slots by studentId to build regularSchedule
    const directSlotsByStudent = new Map<string, typeof schedules>();
    for (const s of schedules) {
      if (s.isRegular && !s.linkedPaymentId && s.source === 'direct' && s.startDate && s.totalSessions) {
        if (!directSlotsByStudent.has(s.studentId)) directSlotsByStudent.set(s.studentId, []);
        directSlotsByStudent.get(s.studentId)!.push(s);
      }
    }
    directSlotsByStudent.forEach((slots, studentId) => {
      const regularSchedule = slots.map(s => ({ day: s.dayOfWeek, startTime: s.startTime }));
      const startDate = slots[0].startDate!;
      const totalSessions = slots[0].totalSessions!;
      const endDate = calculateLastClassDate(
        startDate,
        totalSessions,
        regularSchedule,
        holidayDates,
        attendance.filter(a => a.studentId === studentId)
      );
      for (const s of slots) {
        map.set(s.id, endDate);
      }
    });
    return map;
  }, [schedules, holidayDates, attendance]);

  // Read independent schedule slots directly (no longer derived from payments)
  const filteredSchedules = useMemo(() => {
    const wkStart = format(currentWeekStart, 'yyyy-MM-dd');
    const wkEnd = format(weekEnd, 'yyyy-MM-dd');

    // 이번 주에 숨김 처리된 슬롯 제외
    const hiddenOverrides = schedules.filter(s =>
      s.isOverrideHidden && s.date && s.date >= wkStart && s.date <= wkEnd
    );

    return schedules.filter(s => {
      if (s.isOverrideHidden) return false;

      // 정규 슬롯: 이번 주 숨김 처리 확인
      if (s.isRegular) {
        const isHiddenThisWeek = hiddenOverrides.some(h =>
          h.studentId === s.studentId &&
          h.dayOfWeek === s.dayOfWeek &&
          h.startTime === s.startTime
        );
        if (isHiddenThisWeek) return false;
        // 활성 학생만 표시
        if (!activeStudents.some(st => st.id === s.studentId)) return false;

        // 날짜 범위 필터링: startDate ~ 마지막 수업일
        if (s.startDate && s.startDate > wkEnd) return false; // 시작일이 아직 안 됨

        if (s.linkedPaymentId) {
          const endDate = paymentEndDateMap.get(s.linkedPaymentId);
          if (endDate === null) return false; // 완료된 결제 → 표시 안 함
          if (endDate && endDate < wkStart) return false; // 이미 끝남
        } else if (s.source === 'direct' && s.totalSessions) {
          // 직접 입력 슬롯도 기간 제한 적용
          const endDate = directEndDateMap.get(s.id);
          if (endDate && endDate < wkStart) return false;
        }

        return true;
      }

      // 날짜 지정 슬롯 (보강, 체험 등): 이번 주에 해당하는 것만
      if (s.date) {
        return s.date >= wkStart && s.date <= wkEnd;
      }

      return true;
    });
  }, [schedules, currentWeekStart, weekEnd, activeStudents, paymentEndDateMap, directEndDateMap]);

  // Generate virtual slots for active special classes
  const specialClassSlots = useMemo(() => {
    const weekStartStr = format(currentWeekStart, 'yyyy-MM-dd');
    const weekEndStr = format(weekEnd, 'yyyy-MM-dd');
    const virtualSlots: Array<{
      id: string; studentId: string; dayOfWeek: DayOfWeek; startTime: string;
      duration: number; isRegular: boolean; isSpecialClass: boolean;
      specialClassName: string; specialClassStudentCount: number;
    }> = [];
    specialClasses.filter(c => c.active && (!c.startDate || c.startDate <= weekEndStr) && (!c.endDate || c.endDate >= weekStartStr)).forEach(cls => {
      const count = specialClassStudents.filter(s => s.specialClassId === cls.id).length;
      cls.schedule.forEach((entry, i) => {
        virtualSlots.push({
          id: `special-${cls.id}-${i}`,
          studentId: '',
          dayOfWeek: entry.day,
          startTime: entry.startTime,
          duration: cls.duration,
          isRegular: false,
          isSpecialClass: true,
          specialClassName: cls.name,
          specialClassStudentCount: count,
        });
      });
    });
    return virtualSlots;
  }, [specialClasses, specialClassStudents, currentWeekStart, weekEnd]);

  // Schedules grouped by day with layout info
  const daySchedules = useMemo(() => {
    const result: Record<string, DisplaySlot[]> = {};
    DAYS_OF_WEEK.forEach(day => {
      const regularSlots = filteredSchedules.filter(s => s.dayOfWeek === day);
      const specSlots = specialClassSlots.filter(s => s.dayOfWeek === day);
      const allSlots = [...regularSlots, ...specSlots];
      const layout = layoutSlotsForDay(allSlots);
      result[day] = allSlots.map(slot => {
        const pos = layout.get(slot.id) || { column: 0, numColumns: 1 };
        return {
          ...slot,
          column: pos.column,
          numColumns: pos.numColumns,
          isUnpaid: unpaidStudentIds.has(slot.studentId),
        } as DisplaySlot;
      });
    });
    return result;
  }, [filteredSchedules, specialClassSlots, unpaidStudentIds]);

  // 전체 스케줄 삭제: 결제의 regularSchedule + store의 schedules 모두 초기화
  const handleClearAllSchedules = useCallback(() => {
    const visibleCount = filteredSchedules.length + specialClassSlots.length;
    if (visibleCount === 0) return;
    if (!confirm(`현재 표시된 스케줄 ${visibleCount}개를 모두 삭제하시겠습니까?\n(결제 정보의 정규 스케줄도 함께 제거됩니다)`)) return;

    // 1. 모든 결제의 regularSchedule 초기화
    payments.forEach(p => {
      if (p.regularSchedule?.length) {
        updatePayment(p.id, { regularSchedule: [] });
      }
    });

    // 2. store의 비정규 스케줄 전부 삭제
    schedules.forEach(s => removeSchedule(s.id));
  }, [filteredSchedules, specialClassSlots, payments, schedules, updatePayment, removeSchedule]);

  // Drop validation
  const isDropValid = useCallback((day: DayOfWeek, time: string, slot: ScheduleSlot): boolean => {
    const hours = getOperatingHours(settings, day);
    if (!hours) return false;
    const startMin = timeToMinutes(time);
    const endMin = startMin + slot.duration;
    if (startMin < timeToMinutes(hours.start) || endMin > timeToMinutes(hours.end)) return false;
    // Use filteredSchedules (visible slots only) for accurate capacity count
    const existingSlots = filteredSchedules.filter(s => {
      if (s.id === slot.id) return false;
      if (s.dayOfWeek !== day) return false;
      return isTimeOverlapping(s.startTime, s.duration, time, slot.duration);
    });
    return existingSlots.length < settings.maxStudentsPerSlot;
  }, [settings, filteredSchedules]);

  // 직접 스케줄 입력 핸들러
  const [directScheduleToast, setDirectScheduleToast] = useState<string | null>(null);

  const handleAddDirectSchedule = (data: { studentId: string; dayOfWeek: DayOfWeek; startTime: string; duration: ClassDuration; sessionsPerWeek: number; entries: { day: DayOfWeek; startTime: string }[]; startDate?: string; totalSessions?: number }) => {
    // 기존 스케줄 슬롯 추가
    const newSlotIds: string[] = [];
    for (const entry of data.entries) {
      const slot = addSchedule({
        studentId: data.studentId,
        dayOfWeek: entry.day,
        startTime: entry.startTime,
        duration: data.duration,
        isRegular: true,
        source: 'direct',
        startDate: data.startDate,
        totalSessions: data.totalSessions,
      });
      newSlotIds.push(slot.id);
    }

    // Issue 2: 결제 자동 연동 - 같은 학생의 활성 결제 찾기
    const activePayment = payments.find(p =>
      p.studentId === data.studentId && !p.completed && p.remainingSessions > 0
    );

    if (activePayment) {
      // 결제가 있으면: 결제의 regularSchedule/startDate 업데이트 + 슬롯에 linkedPaymentId 연결
      updatePayment(activePayment.id, {
        regularSchedule: data.entries.map(e => ({ day: e.day, startTime: e.startTime })),
        startDate: data.startDate || activePayment.startDate,
        totalSessions: data.totalSessions || activePayment.totalSessions,
        classDuration: data.duration,
        sessionsPerWeek: data.sessionsPerWeek,
      });
      // 새로 추가한 슬롯들에 linkedPaymentId 설정
      for (const slotId of newSlotIds) {
        updateSchedule(slotId, {
          linkedPaymentId: activePayment.id,
          source: 'payment',
        });
      }
    } else {
      // 결제가 없으면: 미결제 알림
      const student = students.find(s => s.id === data.studentId);
      setDirectScheduleToast(`${student?.name || '원생'}의 스케줄이 등록되었습니다. (미결제 상태)`);
      setTimeout(() => setDirectScheduleToast(null), 4000);
    }

    setShowDirectForm(false);
  };

  // Drag handlers - store the offset from block top where user grabbed
  const handleDragStart = (slot: ScheduleSlot, e: React.DragEvent) => {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    dragOffsetRef.current = e.clientY - rect.top;
    setDraggedSlot(slot);
  };

  const computeTimeFromY = (e: React.DragEvent, day: DayOfWeek): string | null => {
    const col = dayColumnRefs.current[day];
    if (!col) return null;
    const rect = col.getBoundingClientRect();
    // Subtract dragOffset so block top aligns with the grab point
    const y = e.clientY - rect.top - dragOffsetRef.current;
    const rawMinutes = Math.floor(y / PX_PER_MINUTE) + timeRange.earliest;
    const snapped = Math.round(rawMinutes / 10) * 10;
    const clamped = Math.max(timeRange.earliest, Math.min(snapped, timeRange.latest));
    return minutesToTime(clamped);
  };

  const handleDayDragOver = (e: React.DragEvent, day: DayOfWeek) => {
    e.preventDefault();
    const hours = getOperatingHours(settings, day);
    if (!hours) return;
    const time = computeTimeFromY(e, day);
    if (time) setHoveredCell({ day, time });
  };

  // Pending drop for regular schedules: show choice modal (보강 vs 시간표 수정)
  const [pendingDrop, setPendingDrop] = useState<{
    slot: ScheduleSlot; day: DayOfWeek; time: string; oldDate: string; newDate: string;
  } | null>(null);

  const executeDrop = (mode: 'makeup' | 'permanent') => {
    if (!pendingDrop) return;
    const { slot, day, time, oldDate, newDate } = pendingDrop;

    // Move attendance record if exists
    const existingRecord = attendance.find(r =>
      r.studentId === slot.studentId && r.date === oldDate && r.startTime === slot.startTime
    );
    if (existingRecord) {
      updateAttendance(existingRecord.id, { date: newDate, startTime: time });
    }

    if (mode === 'makeup') {
      // 보강 (이번 주만): 원본 유지, 임시 슬롯 생성
      addSchedule({
        studentId: slot.studentId,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        duration: slot.duration,
        isRegular: false,
        date: oldDate,
        isOverrideHidden: true,
      } as Omit<ScheduleSlot, 'id'>);
      addSchedule({
        studentId: slot.studentId,
        dayOfWeek: day,
        startTime: time,
        duration: slot.duration,
        isRegular: false,
        date: newDate,
      });
    } else {
      // 시간표 수정 (영구): 정규 슬롯 자체를 변경
      moveSchedule(slot.id, day, time);
      // 연결된 결제의 regularSchedule도 업데이트
      const payment = payments.find(p =>
        p.studentId === slot.studentId &&
        p.regularSchedule?.some(e => e.day === slot.dayOfWeek && e.startTime === slot.startTime)
      );
      if (payment) {
        updatePayment(payment.id, {
          regularSchedule: (payment.regularSchedule || []).map(e =>
            e.day === slot.dayOfWeek && e.startTime === slot.startTime
              ? { day, startTime: time }
              : e
          ),
        });
      }
    }
    setPendingDrop(null);
  };

  const handleDayDrop = (e: React.DragEvent, day: DayOfWeek) => {
    e.preventDefault();
    const time = computeTimeFromY(e, day);
    if (time && draggedSlot && isDropValid(day, time, draggedSlot)) {
      const oldDate = getDateForDay(draggedSlot.dayOfWeek);
      const newDate = getDateForDay(day);

      if (draggedSlot.isRegular) {
        // 정규 스케줄: 보강/시간표수정 선택 모달 표시
        setPendingDrop({ slot: draggedSlot, day, time, oldDate, newDate });
      } else {
        // 비정규 슬롯 처리
        const existingRecord = attendance.find(r =>
          r.studentId === draggedSlot.studentId && r.date === oldDate && r.startTime === draggedSlot.startTime
        );
        if (existingRecord) {
          updateAttendance(existingRecord.id, { date: newDate, startTime: time });
        }

        const matchingHidden = schedules.find(s =>
          s.isOverrideHidden &&
          s.studentId === draggedSlot.studentId &&
          s.dayOfWeek === day &&
          s.startTime === time
        );
        if (matchingHidden) {
          removeSchedule(matchingHidden.id);
          removeSchedule(draggedSlot.id);
        } else {
          moveSchedule(draggedSlot.id, day, time);
          if (draggedSlot.date) {
            updateSchedule(draggedSlot.id, { date: newDate });
          }
        }
      }
    }
    setDraggedSlot(null);
    setHoveredCell(null);
  };

  const handleDragEnd = () => {
    setDraggedSlot(null);
    setHoveredCell(null);
  };

  // Delete with undo — remove schedule slot and payment's regularSchedule entry
  const [deletedPaymentInfo, setDeletedPaymentInfo] = useState<{ paymentId: string; entry: { day: DayOfWeek; startTime: string } } | null>(null);

  const handleDeleteSlot = (slot: ScheduleSlot, displayName: string) => {
    // 정규 슬롯: 퇴원 처리
    if (slot.isRegular && slot.studentId) {
      if (!confirm(`${displayName} 원생을 퇴원 처리하시겠습니까?\n지금까지의 수업 내역은 이전 스케줄표에 남아 있게 됩니다.`)) return;
      deleteStudent(slot.studentId);
      return;
    }

    // 비정규 슬롯 (보강, 체험 등): 개별 삭제
    if (!confirm(`${displayName} 스케줄을 삭제하시겠습니까?`)) return;
    setDeletedPaymentInfo(null);

    // 항상 스케줄 배열에서 제거
    removeSchedule(slot.id);
    setDeletedSlot(slot);
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    undoTimeoutRef.current = setTimeout(() => { setDeletedSlot(null); setDeletedPaymentInfo(null); }, 5000);
  };

  const handleUndo = () => {
    if (deletedSlot) {
      // 스케줄 배열에 복원
      restoreSchedule(deletedSlot);

      // 정규 슬롯이면 결제의 regularSchedule도 복원
      if (deletedSlot.isRegular && deletedPaymentInfo) {
        const payment = payments.find(p => p.id === deletedPaymentInfo.paymentId);
        if (payment) {
          updatePayment(payment.id, {
            regularSchedule: [
              ...(payment.regularSchedule || []),
              deletedPaymentInfo.entry,
            ],
          });
        }
      }

      setDeletedSlot(null);
      setDeletedPaymentInfo(null);
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    }
  };

  // Restore a dragged slot back to its original regular position
  const handleRestoreSlot = (slot: DisplaySlot) => {
    const matchingHidden = schedules.find(s =>
      s.isOverrideHidden &&
      s.studentId === slot.studentId &&
      s.date && s.date >= weekStartStr && s.date <= weekEndStr
    );
    if (matchingHidden) {
      removeSchedule(matchingHidden.id);
      removeSchedule(slot.id);
    }
  };

  const handleAddMakeup = (data: { studentId: string; dayOfWeek: DayOfWeek; startTime: string; duration: number; autoAttend: boolean }) => {
    const date = getDateForDay(data.dayOfWeek);
    addSchedule({
      studentId: data.studentId,
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      duration: data.duration as 60 | 80 | 100,
      isRegular: false,
      date,
    });
    if (data.autoAttend) {
      addAttendance({
        studentId: data.studentId,
        date,
        status: '보강',
        startTime: data.startTime,
        duration: data.duration as ClassDuration,
        isMakeup: true,
        memo: '',
      });
    }
    setShowMakeupForm(false);
  };

  const handleAddTrial = (data: {
    name: string;
    grade: StudentGrade;
    parentPhone: string;
    memo: string;
    dayOfWeek: DayOfWeek;
    startTime: string;
    duration: ClassDuration;
  }) => {
    const trialStudent = addTrialStudent({
      name: data.name,
      grade: data.grade,
      parentPhone: data.parentPhone,
      memo: data.memo,
    });
    addTrialLesson({
      trialStudentId: trialStudent.id,
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      duration: data.duration,
      paid: false,
      amount: TRIAL_PRICING[data.duration],
    });
    addSchedule({
      studentId: '',
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      duration: data.duration,
      isRegular: false,
      isTrial: true,
      trialStudentId: trialStudent.id,
      date: getDateForDay(data.dayOfWeek),
    });
    setShowTrialForm(false);
  };

  // Save memo
  const handleSaveMemo = () => {
    if (!memoSlot) return;
    const existing = attendance.find(r =>
      r.studentId === memoSlot.studentId &&
      r.date === memoSlot.date &&
      r.startTime === memoSlot.startTime
    );
    if (existing) {
      updateAttendance(existing.id, { memo: memoSlot.memo });
    } else if (memoSlot.memo.trim()) {
      // Create a new attendance record with memo (status: 예정)
      const student = getStudentById(memoSlot.studentId);
      // Find slot from filtered (includes payment-derived) or store
      const slot = filteredSchedules.find(s => s.id === memoSlot.slotId) || schedules.find(s => s.id === memoSlot.slotId);
      if (student && slot) {
        addAttendance({
          studentId: memoSlot.studentId,
          date: memoSlot.date,
          status: '예정',
          startTime: memoSlot.startTime,
          duration: slot.duration,
          isMakeup: false,
          memo: memoSlot.memo,
        });
      }
    }
    setMemoSlot(null);
  };

  // Unpaid students with past payment data (for renewal feature)
  const unpaidStudentData = useMemo(() => {
    return activeStudents
      .filter(s => unpaidStudentIds.has(s.id))
      .map(student => {
        const lastCompleted = payments
          .filter(p => p.studentId === student.id && p.completed)
          .sort((a, b) => b.paidAt.localeCompare(a.paidAt))[0];
        return { student, lastPayment: lastCompleted };
      })
      .filter(d => d.lastPayment);
  }, [activeStudents, unpaidStudentIds, payments]);

  // Students approaching payment exhaustion (remainingSessions <= 2)
  const expiringStudents = useMemo(() => {
    return activeStudents
      .map(student => {
        const activePay = payments.find(p => p.studentId === student.id && !p.completed && p.remainingSessions > 0);
        if (!activePay || activePay.remainingSessions > 2) return null;
        return { student, payment: activePay };
      })
      .filter(Boolean) as Array<{ student: typeof activeStudents[0]; payment: typeof payments[0] }>;
  }, [activeStudents, payments]);

  const [showUnpaidPanel, setShowUnpaidPanel] = useState(false);

  return (
    <div className="p-3 md:p-6">
      {/* Payment exhaustion alert banner */}
      {(expiringStudents.length > 0 || unpaidStudentData.length > 0) && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-start gap-2">
            <span className="text-lg mt-0.5">&#9888;&#65039;</span>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold text-amber-800">결제 알림</h4>
              {expiringStudents.length > 0 && (
                <p className="text-xs text-amber-700 mt-1">
                  <span className="font-semibold">수업 잔여 2회 이하:</span>{' '}
                  {expiringStudents.map((d, i) => (
                    <span key={d.student.id}>
                      {i > 0 && ', '}{d.student.name}
                      <span className="text-red-600 font-bold">({d.payment.remainingSessions}회)</span>
                    </span>
                  ))}
                </p>
              )}
              {unpaidStudentData.length > 0 && (
                <p className="text-xs text-amber-700 mt-1">
                  <span className="font-semibold">미결제(수업 소진):</span>{' '}
                  {unpaidStudentData.map((d, i) => (
                    <span key={d.student.id}>{i > 0 && ', '}{d.student.name}</span>
                  ))}
                  <button
                    onClick={() => setShowUnpaidPanel(true)}
                    className="ml-2 text-indigo-600 hover:text-indigo-800 font-semibold underline"
                  >
                    과거 결제에서 갱신
                  </button>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-800">주간 스케줄</h3>
          <p className="text-sm text-gray-500">
            {settings.currentSeason} | 동시간대 최대 {settings.maxStudentsPerSlot}명
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="relative">
            <input
              type="text"
              placeholder="원생 검색..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoComplete="off"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-32 md:w-40 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
              >
                &times;
              </button>
            )}
          </div>
          <button
            onClick={() => setShowDirectForm(true)}
            className="bg-blue-600 text-white px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            + 정규 스케줄
          </button>
          <button
            onClick={() => setShowTrialForm(true)}
            className="bg-emerald-600 text-white px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-medium hover:bg-emerald-700 transition-colors whitespace-nowrap"
          >
            + 체험 수업
          </button>
          <button
            onClick={() => setShowMakeupForm(true)}
            className="bg-indigo-600 text-white px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-medium hover:bg-indigo-700 transition-colors whitespace-nowrap"
          >
            + 보강 추가
          </button>
        </div>
      </div>

      {/* Week Navigation - date range only */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={goToPrevWeek} className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-lg text-sm hover:bg-gray-50 text-gray-600">&lsaquo;</button>
        <span className="text-sm font-semibold text-gray-800 px-2">
          {format(currentWeekStart, 'yyyy년 M월 d일', { locale: ko })} ~ {format(weekEnd, 'M월 d일', { locale: ko })}
        </span>
        <button onClick={goToNextWeek} className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-lg text-sm hover:bg-gray-50 text-gray-600">&rsaquo;</button>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mb-4 text-xs flex-wrap">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-cyan-400" /> 60분</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-pink-400" /> 80분</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-amber-400" /> 100분</div>
        <div className="flex items-center gap-1.5 ml-4"><div className="w-3 h-3 rounded-sm border-2 border-dashed border-orange-400" /> 보강</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-emerald-400" /> 체험</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-rose-400" /> 특강</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-red-100 border-2 border-red-400 border-dashed" /> 미결제</div>
        <div className="flex items-center gap-1.5 ml-4"><div className="w-3 h-3 rounded-sm ring-2 ring-green-500 bg-white" /> 출석</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm ring-2 ring-red-500 bg-red-50" /> 결석</div>
      </div>

      {/* Day tabs for detail view */}
      {selectedDay && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <button
            onClick={() => setSelectedDay(null)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
          >
            ← 주간 보기
          </button>
          <div className="flex gap-1 ml-2">
            {DAYS_OF_WEEK.map(day => {
              const hours = getOperatingHours(settings, day);
              if (!hours) return null;
              return (
                <button
                  key={day}
                  onClick={() => setSelectedDay(day)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    selectedDay === day
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleClearAllSchedules}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-500 text-white hover:bg-gray-600 transition-colors"
          >
            전체 삭제
          </button>
          <button
            onClick={handleExportPdf}
            disabled={isPdfExporting}
            className="px-4 py-1.5 rounded-lg text-sm font-medium bg-rose-600 text-white hover:bg-rose-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {isPdfExporting ? '준비 중...' : '인쇄 / PDF 저장'}
          </button>
          </div>
        </div>
      )}

      {/* Schedule Grid */}
      <div ref={scheduleGridRef} className="bg-white rounded-xl border border-gray-200 overflow-auto -mx-3 md:mx-0 rounded-none md:rounded-xl border-x-0 md:border-x" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className={selectedDay ? '' : 'min-w-[800px]'}>
          {/* Header */}
          <div className={`flex bg-gray-50 border-b border-gray-200 ${selectedDay ? 'py-1' : ''}`}>
            <div className={`shrink-0 px-2 py-2 font-medium text-gray-500 text-center border-r border-gray-200 ${selectedDay ? 'w-20 text-base' : 'w-16 text-xs'}`}>
              시간
            </div>
            {(selectedDay ? [selectedDay] : DAYS_OF_WEEK).map(day => {
              const hours = getOperatingHours(settings, day);
              const dateStr = getDateForDay(day);
              const slotCount = (daySchedules[day] || []).length;
              const holidayName = getHolidayName(dateStr);
              const isDayView = !!selectedDay;
              return (
                <div
                  key={day}
                  onClick={() => !selectedDay && hours && setSelectedDay(day)}
                  className={`flex-1 px-3 font-medium text-center border-r border-gray-200 last:border-r-0 ${
                    isDayView ? 'py-3 text-lg' : 'py-2 text-sm'
                  } ${
                    holidayName ? 'bg-red-50 text-red-600' : 'text-gray-700'
                  } ${!selectedDay && hours ? 'cursor-pointer hover:bg-indigo-50 transition-colors' : ''}`}
                >
                  {day}요일
                  <span className={`block font-normal text-gray-400 ${isDayView ? 'text-sm mt-0.5' : 'text-[10px]'}`}>{format(new Date(dateStr + 'T00:00:00'), 'M/d')}</span>
                  {holidayName && (
                    <span className={`block font-semibold text-red-500 ${isDayView ? 'text-sm' : 'text-[10px]'}`}>{holidayName}</span>
                  )}
                  {!holidayName && hours && <span className={`block font-normal text-gray-400 ${isDayView ? 'text-sm' : 'text-[10px]'}`}>{hours.start}-{hours.end}</span>}
                  {selectedDay && <span className={`block font-medium text-indigo-500 mt-0.5 ${isDayView ? 'text-sm' : 'text-[10px]'}`}>{slotCount}개 수업</span>}
                </div>
              );
            })}
          </div>

          {/* Body */}
          <div className="flex">
            {/* Time labels */}
            <div className={`shrink-0 relative border-r border-gray-200 ${selectedDay ? 'w-20' : 'w-16'}`} style={{ height: totalHeight }}>
              {timeMarkers.map(time => {
                const top = (timeToMinutes(time) - timeRange.earliest) * PX_PER_MINUTE;
                const [h, m] = time.split(':');
                return (
                  <div
                    key={time}
                    className="absolute left-0 right-0 px-1.5 -translate-y-1/2 flex items-baseline gap-0.5"
                    style={{ top }}
                  >
                    <span className={`font-bold text-gray-600 tabular-nums tracking-tight ${selectedDay ? 'text-lg' : 'text-[12px]'}`}>{h}</span>
                    <span className={`text-gray-400 ${selectedDay ? 'text-base' : 'text-[10px]'}`}>:{m}</span>
                  </div>
                );
              })}
            </div>

            {/* Day columns */}
            {(selectedDay ? [selectedDay] : DAYS_OF_WEEK).map(day => {
              const hours = getOperatingHours(settings, day);
              const isOperating = !!hours;
              const daySlots = daySchedules[day] || [];
              const dateStr = getDateForDay(day);
              const opStart = hours ? timeToMinutes(hours.start) : timeRange.earliest;
              const opEnd = hours ? timeToMinutes(hours.end) : timeRange.latest;
              const isDayView = !!selectedDay;
              const dayHolidayName = getHolidayName(dateStr);
              const isDayHoliday = !!dayHolidayName;

              return (
                <div
                  key={day}
                  ref={el => { dayColumnRefs.current[day] = el; }}
                  className={`flex-1 relative border-r border-gray-200 last:border-r-0 ${!isOperating ? 'bg-gray-100' : ''}`}
                  style={{ height: totalHeight }}
                  onDragOver={e => isOperating && !isDayHoliday ? handleDayDragOver(e, day) : undefined}
                  onDrop={e => isOperating && !isDayHoliday ? handleDayDrop(e, day) : undefined}
                >
                  {/* Holiday overlay */}
                  {isDayHoliday && (
                    <div className="absolute inset-0 bg-red-50/80 z-30 flex items-center justify-center pointer-events-none">
                      <div className="text-center">
                        <div className="text-red-400 text-2xl mb-1">&#10005;</div>
                        <div className="text-sm font-semibold text-red-500">{dayHolidayName}</div>
                        <div className="text-xs text-red-400">휴원</div>
                      </div>
                    </div>
                  )}

                  {/* Non-operating overlays */}
                  {hours && timeToMinutes(hours.start) > timeRange.earliest && (
                    <div className="absolute left-0 right-0 bg-gray-100/70" style={{ top: 0, height: (timeToMinutes(hours.start) - timeRange.earliest) * PX_PER_MINUTE }} />
                  )}
                  {hours && timeToMinutes(hours.end) < timeRange.latest && (
                    <div className="absolute left-0 right-0 bg-gray-100/70" style={{ top: (timeToMinutes(hours.end) - timeRange.earliest) * PX_PER_MINUTE, height: (timeRange.latest - timeToMinutes(hours.end)) * PX_PER_MINUTE }} />
                  )}

                  {/* 30-minute grid lines */}
                  {timeMarkers.map(time => {
                    const top = (timeToMinutes(time) - timeRange.earliest) * PX_PER_MINUTE;
                    const min = timeToMinutes(time);
                    if (min < opStart || min >= opEnd) return null;
                    return <div key={time} className="absolute left-0 right-0 border-t border-gray-100" style={{ top }} />;
                  })}

                  {/* Drop hover indicator */}
                  {hoveredCell?.day === day && draggedSlot && (
                    <div
                      className={`drop-indicator absolute left-1 right-1 rounded-lg border-2 z-20 pointer-events-none ${
                        isDropValid(day, hoveredCell.time, draggedSlot)
                          ? 'border-green-400 bg-green-50/60 shadow-md shadow-green-200/40'
                          : 'border-red-400 bg-red-50/60 shadow-md shadow-red-200/40'
                      }`}
                      style={{ top: (timeToMinutes(hoveredCell.time) - timeRange.earliest) * PX_PER_MINUTE, height: draggedSlot.duration * PX_PER_MINUTE }}
                    />
                  )}

                  {/* Schedule blocks */}
                  {daySlots.map(slot => {
                    const isSpecial = slot.isSpecialClass;
                    const isTrial = slot.isTrial;
                    const student = !isSpecial && !isTrial ? getStudentById(slot.studentId) : null;
                    const trialStudent = isTrial && slot.trialStudentId ? getTrialStudentById(slot.trialStudentId) : null;
                    const displayName = isSpecial
                      ? (slot.specialClassName || '특강')
                      : isTrial
                      ? (trialStudent?.name || '체험')
                      : (student?.name || '');

                    if (!isSpecial && !isTrial && !student) return null;

                    const isRestorable = !slot.isRegular && !isTrial && !isSpecial && schedules.some(s =>
                      s.isOverrideHidden &&
                      s.studentId === slot.studentId &&
                      s.date && s.date >= weekStartStr && s.date <= weekEndStr
                    );

                    const isSearchMatch = !searchQuery || displayName.includes(searchQuery);

                    const top = (timeToMinutes(slot.startTime) - timeRange.earliest) * PX_PER_MINUTE;
                    const height = slot.duration * PX_PER_MINUTE;
                    const widthPercent = 100 / slot.numColumns;
                    const leftPercent = slot.column * widthPercent;
                    const endTime = getEndTime(slot.startTime, slot.duration);

                    const attendanceRecord = !isSpecial && !isTrial && student ? getAttendanceRecord(student.id, dateStr, slot.startTime) : null;
                    const attendanceClass = attendanceRecord ? STATUS_COLORS[attendanceRecord.status] || '' : '';
                    const isAbsent = attendanceRecord?.status === '결석';

                    // Special class block
                    if (isSpecial) {
                      return (
                        <div
                          key={slot.id}
                          className={`
                            schedule-block
                            absolute z-10 rounded-lg border select-none overflow-hidden
                            bg-rose-50 border-rose-300
                            ${!isSearchMatch ? 'opacity-20' : ''}
                          `}
                          style={{
                            top: top + 1,
                            height: height - 2,
                            left: `calc(${leftPercent}% + 2px)`,
                            width: `calc(${widthPercent}% - 4px)`,
                          }}
                        >
                          <div className={`absolute left-0 top-0 bottom-0 ${isDayView ? 'w-2' : 'w-0.5'} bg-rose-500`} />
                          <div className={isDayView ? 'pl-4 pr-2 py-2' : 'pl-2 pr-1 py-1'}>
                            <div className={`font-bold truncate text-rose-800 ${isDayView ? 'text-2xl leading-snug' : 'text-[11px] leading-tight'}`}>
                              {displayName}
                            </div>
                            <div className={`text-rose-600 tabular-nums font-semibold ${isDayView ? 'text-xl mt-1 leading-snug' : 'text-[10px] leading-tight'}`}>{slot.startTime}~{endTime}</div>
                            <div className={`flex items-center gap-1 ${isDayView ? 'text-base mt-1 leading-snug' : 'text-[10px] leading-tight'}`}>
                              <span className="text-rose-500 font-medium">{slot.duration}분</span>
                            </div>
                            <div className={isDayView ? 'mt-1.5' : 'mt-0.5'}>
                              <span className={`inline-block bg-rose-500 text-white font-bold rounded-full leading-none ${isDayView ? 'px-3 py-1.5 text-sm' : 'px-1 py-px text-[8px]'}`}>
                                특강 {slot.specialClassStudentCount || 0}명
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // Accent bar color (미결제도 수업 시간별 컬러 유지)
                    const accentColor = isTrial
                      ? 'bg-emerald-500'
                      : !slot.isRegular && !isTrial
                      ? 'bg-orange-400'
                      : getDurationAccent(slot.duration);

                    const durationText = getDurationTextColor(slot.duration);

                    return (
                      <div
                        key={slot.id}
                        draggable
                        onDragStart={(e) => handleDragStart(slot as ScheduleSlot, e)}
                        onDragEnd={handleDragEnd}
                        className={`
                          schedule-block
                          absolute z-10 rounded-lg cursor-grab active:cursor-grabbing
                          border select-none group/card overflow-hidden
                          ${isTrial
                            ? 'bg-emerald-50 border-emerald-300'
                            : isAbsent
                            ? 'bg-red-50 border-red-300'
                            : getDurationColor(slot.duration)
                          }
                          ${!slot.isRegular && !isTrial && !slot.isUnpaid ? 'border-dashed border-orange-300' : ''}
                          ${draggedSlot?.id === slot.id ? 'drag-ghost' : !isSearchMatch ? 'opacity-20' : ''}
                          ${isSearchMatch && searchQuery ? 'ring-2 ring-indigo-500 z-20' : ''}
                          ${attendanceClass}
                        `}
                        style={{
                          top: top + 1,
                          height: height - 2,
                          left: `calc(${leftPercent}% + 2px)`,
                          width: `calc(${widthPercent}% - 4px)`,
                        }}
                      >
                        {/* Left accent bar */}
                        <div className={`absolute left-0 top-0 bottom-0 ${isDayView ? 'w-2' : 'w-0.5'} ${accentColor}`} />

                        {/* Content area */}
                        <div className={isDayView ? 'pl-4 pr-2 py-1.5' : 'pl-1.5'}>
                          {/* Name row */}
                          <div className={`font-bold truncate ${isDayView ? 'text-2xl leading-snug' : 'text-[11px] leading-tight'} ${isAbsent ? 'text-red-600 line-through' : 'text-gray-900'}`}>
                            {displayName}
                            {isDayView && student && <span className="font-normal text-gray-400 ml-1.5 text-base">({student.grade})</span>}
                          </div>

                          {/* Time row */}
                          <div className={`tabular-nums font-semibold ${isDayView ? 'text-xl mt-1 leading-snug' : 'text-[10px] leading-tight'} ${isTrial ? 'text-emerald-600' : durationText}`}>
                            {slot.startTime}~{endTime}
                          </div>

                          {/* Info row */}
                          <div className={`flex items-center gap-1.5 ${isDayView ? 'text-base mt-1 leading-snug' : 'text-[10px] leading-tight'}`}>
                            <span className="text-gray-500 font-medium">{slot.duration}분</span>
                            {isDayView && student && <span className="text-gray-400">|</span>}
                            {isDayView && student && <span className="text-gray-500 font-medium">{student.level}</span>}
                          </div>

                          {/* Status badges */}
                          {(isTrial || (!slot.isRegular && !isTrial && !slot.isUnpaid)) && (
                            <div className={`flex items-center gap-1.5 ${isDayView ? 'mt-1.5' : 'mt-0.5'}`}>
                              {isTrial && (
                                <span className={`inline-block bg-emerald-500 text-white font-bold rounded-full leading-none ${isDayView ? 'px-3 py-1.5 text-sm' : 'px-1 py-px text-[8px]'}`}>
                                  체험
                                </span>
                              )}
                              {!slot.isRegular && !isTrial && !slot.isUnpaid && (
                                <span className={`inline-block bg-orange-400 text-white font-bold rounded-full leading-none ${isDayView ? 'px-3 py-1.5 text-sm' : 'px-1 py-px text-[8px]'}`}>
                                  보강
                                </span>
                              )}
                            </div>
                          )}

                          {/* 미결제 뱃지 - 오른쪽에 세로 표시 */}
                          {slot.isUnpaid && (
                            <div className={`absolute right-0 top-0 bottom-0 flex items-center ${isDayView ? 'pr-2' : 'pr-1'}`}>
                              <span className={`bg-red-500 text-white font-bold rounded-sm leading-none ${isDayView ? 'px-2 py-2 text-sm' : 'px-0.5 py-0.5 text-[7px]'}`} style={{ writingMode: 'vertical-rl' }}>
                                미결제
                              </span>
                            </div>
                          )}

                          {isRestorable && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRestoreSlot(slot); }}
                              className={`mt-0.5 text-blue-600 hover:text-blue-800 font-medium ${isDayView ? 'text-sm' : 'text-[9px]'}`}
                            >
                              ↩ 돌아가기
                            </button>
                          )}

                          {/* Attendance status badge */}
                          {attendanceRecord && (
                            <div className={`${isDayView ? 'mt-1.5' : 'mt-0.5'}`}>
                              <span className={`inline-block font-bold rounded-full leading-none ${isDayView ? 'px-3 py-1.5 text-sm' : 'px-1 py-px text-[8px]'} ${
                                attendanceRecord.status === '출석' ? 'bg-green-100 text-green-700'
                                : attendanceRecord.status === '결석' ? 'bg-red-100 text-red-600'
                                : 'bg-blue-100 text-blue-700'
                              }`}>
                                {attendanceRecord.status}
                              </span>
                            </div>
                          )}

                          {/* Memo callout */}
                          {attendanceRecord?.memo && (
                            <div className={`mt-1 bg-yellow-50/80 border-l-2 border-yellow-400 rounded-r ${isDayView ? 'px-3 py-1.5' : 'px-1 py-0.5'}`} title={attendanceRecord.memo}>
                              <div className={`text-gray-600 ${isDayView ? 'text-sm leading-snug whitespace-pre-wrap' : 'text-[9px] leading-tight truncate'}`}>
                                {attendanceRecord.memo}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Attendance buttons on hover */}
                        {!isTrial && student && (
                          <div className={`absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-200/60 hidden group-hover/card:flex items-center justify-center ${isDayView ? 'py-1 gap-2' : 'py-0.5 gap-0.5'}`}>
                            {(['출석', '결석', '보강'] as AttendanceStatus[]).map(status => (
                              <button
                                key={status}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleScheduleAttendance(student.id, day, status, slot.startTime, slot.duration as ClassDuration);
                                }}
                                className={`rounded-full font-bold transition-all ${
                                  isDayView ? 'w-9 h-9 text-sm' : 'w-5 h-5 text-[8px]'
                                } ${
                                  attendanceRecord?.status === status
                                    ? status === '출석' ? 'bg-green-500 text-white shadow-sm' : status === '결석' ? 'bg-red-500 text-white shadow-sm' : 'bg-blue-500 text-white shadow-sm'
                                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                }`}
                                title={status}
                              >
                                {status[0]}
                              </button>
                            ))}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setMemoSlot({
                                  slotId: slot.id,
                                  studentId: student.id,
                                  date: dateStr,
                                  startTime: slot.startTime,
                                  memo: attendanceRecord?.memo || '',
                                });
                              }}
                              className={`rounded-full bg-yellow-100 text-yellow-600 hover:bg-yellow-200 font-bold ${
                                isDayView ? 'w-9 h-9 text-sm' : 'w-5 h-5 text-[8px]'
                              }`}
                              title="메모"
                            >
                              M
                            </button>
                          </div>
                        )}

                        {/* Delete button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSlot(slot as ScheduleSlot, displayName);
                          }}
                          className={`absolute top-0 right-0 bg-red-500 text-white rounded-full leading-none items-center justify-center hidden group-hover/card:flex shadow-sm ${
                            isDayView ? 'w-7 h-7 text-base' : 'w-4 h-4 text-[10px]'
                          }`}
                        >
                          &times;
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Direct Schedule Toast (미결제 알림) */}
      {directScheduleToast && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 bg-amber-600 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 z-50 animate-fade-in">
          <span className="text-lg">&#9888;&#65039;</span>
          <span className="text-sm">{directScheduleToast}</span>
          <button onClick={() => setDirectScheduleToast(null)} className="text-amber-200 hover:text-white text-xs ml-1">&times;</button>
        </div>
      )}

      {/* Undo Toast */}
      {deletedSlot && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-4 z-50 animate-fade-in">
          <span className="text-sm">스케줄이 삭제되었습니다</span>
          <button
            onClick={handleUndo}
            className="text-sm font-bold text-indigo-300 hover:text-indigo-200 underline underline-offset-2"
          >
            되돌리기
          </button>
          <button
            onClick={() => setDeletedSlot(null)}
            className="text-gray-400 hover:text-white text-xs ml-1"
          >
            &times;
          </button>
        </div>
      )}

      {/* Makeup Modal */}
      <Modal isOpen={showMakeupForm} onClose={() => setShowMakeupForm(false)} title="보강 수업 추가">
        <MakeupForm
          students={activeStudents}
          onSubmit={handleAddMakeup}
          onCancel={() => setShowMakeupForm(false)}
        />
      </Modal>

      {/* Trial Modal */}
      <Modal isOpen={showTrialForm} onClose={() => setShowTrialForm(false)} title="체험 수업 추가">
        <TrialForm
          onSubmit={handleAddTrial}
          onCancel={() => setShowTrialForm(false)}
        />
      </Modal>

      {/* Direct Schedule Modal */}
      <Modal isOpen={showDirectForm} onClose={() => setShowDirectForm(false)} title="정규 스케줄 직접 입력" size="lg">
        <DirectScheduleForm
          students={activeStudents}
          onSubmit={handleAddDirectSchedule}
          onCancel={() => setShowDirectForm(false)}
        />
      </Modal>

      {/* Memo Modal */}
      <Modal isOpen={!!memoSlot} onClose={() => setMemoSlot(null)} title="메모" size="sm">
        {memoSlot && (
          <div className="space-y-3">
            <textarea
              value={memoSlot.memo}
              onChange={e => setMemoSlot({ ...memoSlot, memo: e.target.value })}
              placeholder="메모를 입력하세요..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none h-24 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSaveMemo}
                className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
              >
                저장
              </button>
              <button
                onClick={() => setMemoSlot(null)}
                className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-200"
              >
                취소
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Drag Drop Choice Modal: 보강 vs 시간표 수정 */}
      <Modal isOpen={!!pendingDrop} onClose={() => setPendingDrop(null)} title="스케줄 변경 방식 선택" size="sm">
        {pendingDrop && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              <span className="font-semibold">{students.find(s => s.id === pendingDrop.slot.studentId)?.name}</span> 원생의 스케줄을 이동합니다.
            </p>
            <button
              onClick={() => executeDrop('makeup')}
              className="w-full py-3 bg-blue-50 border border-blue-300 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100"
            >
              보강 (이번 주만 변경)
            </button>
            <button
              onClick={() => executeDrop('permanent')}
              className="w-full py-3 bg-indigo-50 border border-indigo-300 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-100"
            >
              시간표 수정 (영구 변경)
            </button>
            <button
              onClick={() => setPendingDrop(null)}
              className="w-full py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200"
            >
              취소
            </button>
          </div>
        )}
      </Modal>

      {/* Unpaid Students - Renew from Past Payment */}
      <Modal isOpen={showUnpaidPanel} onClose={() => setShowUnpaidPanel(false)} title="과거 결제에서 스케줄 갱신" size="lg">
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            수업 횟수가 소진된 학생입니다. 과거 결제 정보를 기반으로 새 결제를 등록하면 스케줄이 자동으로 활성화됩니다.
          </p>
          {unpaidStudentData.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">미결제 학생이 없습니다.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {unpaidStudentData.map(({ student, lastPayment }) => (
                <div key={student.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900">{student.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {student.level} | {lastPayment.classDuration}분 | {lastPayment.totalSessions}회
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      마지막 결제: {lastPayment.paidAt.slice(0, 10)} | {formatCurrency(lastPayment.amount)}
                    </div>
                    {lastPayment.regularSchedule?.length ? (
                      <div className="text-xs text-indigo-500 mt-0.5">
                        스케줄: {lastPayment.regularSchedule.map(e => `${e.day} ${e.startTime}`).join(', ')}
                      </div>
                    ) : null}
                  </div>
                  <button
                    onClick={() => {
                      const today = format(new Date(), 'yyyy-MM-dd');
                      addPayment({
                        studentId: student.id,
                        amount: lastPayment.amount,
                        originalAmount: lastPayment.originalAmount,
                        discountRate: lastPayment.discountRate,
                        extraDiscounts: lastPayment.extraDiscounts,
                        totalSessions: lastPayment.totalSessions,
                        method: lastPayment.method,
                        splitPayments: lastPayment.splitPayments,
                        startDate: today,
                        paidAt: today,
                        classDuration: lastPayment.classDuration,
                        memo: `${lastPayment.paidAt.slice(0,10)} 결제 갱신`,
                        sessionsPerWeek: lastPayment.sessionsPerWeek,
                        regularSchedule: lastPayment.regularSchedule,
                      });
                      // Schedule slots are now independent; addPayment will link them automatically
                    }}
                    className="shrink-0 px-4 py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap"
                  >
                    동일 조건 갱신
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="pt-2 border-t border-gray-100">
            <button
              onClick={() => setShowUnpaidPanel(false)}
              className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
            >
              닫기
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
