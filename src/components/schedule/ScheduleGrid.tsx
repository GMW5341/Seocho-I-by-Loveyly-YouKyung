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
  timeToMinutes,
  minutesToTime,
  layoutSlotsForDay,
} from '../../utils/helpers';
import Modal from '../common/Modal';
import MakeupForm from './MakeupForm';
import TrialForm from './TrialForm';

const PX_PER_MINUTE_WEEK = 2.5;
const PX_PER_MINUTE_DAY = 4;

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
    specialClasses, specialClassStudents,
  } = useAppStore();
  const [showMakeupForm, setShowMakeupForm] = useState(false);
  const [showTrialForm, setShowTrialForm] = useState(false);
  const [draggedSlot, setDraggedSlot] = useState<ScheduleSlot | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ day: DayOfWeek; time: string } | null>(null);
  const [memoSlot, setMemoSlot] = useState<{ slotId: string; studentId: string; date: string; startTime: string; memo: string } | null>(null);
  const [deletedSlot, setDeletedSlot] = useState<ScheduleSlot | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDay, setSelectedDay] = useState<DayOfWeek | null>(null);
  const PX_PER_MINUTE = selectedDay ? PX_PER_MINUTE_DAY : PX_PER_MINUTE_WEEK;
  const dayColumnRefs = useRef<Record<string, HTMLDivElement | null>>({});
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

  // Compute unified time range across all days
  const timeRange = useMemo(() => {
    let earliest = 24 * 60;
    let latest = 0;
    DAYS_OF_WEEK.forEach(day => {
      const hours = getOperatingHours(settings, day);
      if (hours) {
        earliest = Math.min(earliest, timeToMinutes(hours.start));
        latest = Math.max(latest, timeToMinutes(hours.end));
      }
    });
    if (earliest >= latest) {
      earliest = 10 * 60;
      latest = 19 * 60;
    }
    return { earliest, latest, totalMinutes: latest - earliest };
  }, [settings]);

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

  // Track unpaid student IDs (payment exhausted but still showing schedule)
  const unpaidStudentIds = useMemo(() => {
    const ids = new Set<string>();
    activeStudents.forEach(student => {
      const hasActive = payments.some(p => p.studentId === student.id && !p.completed && p.remainingSessions > 0);
      if (!hasActive) {
        // 활성 결제 없음 → 가장 최근 완료된 결제에 스케줄이 있으면 미결제
        const lastCompleted = payments
          .filter(p => p.studentId === student.id && p.completed && p.regularSchedule?.length)
          .sort((a, b) => b.paidAt.localeCompare(a.paidAt))[0];
        if (lastCompleted) ids.add(student.id);
      }
    });
    return ids;
  }, [activeStudents, payments]);

  // Derive regular schedule slots from active payments (no longer stored in schedules)
  const filteredSchedules = useMemo(() => {
    const wkStart = format(currentWeekStart, 'yyyy-MM-dd');
    const wkEnd = format(weekEnd, 'yyyy-MM-dd');

    // 이번 주에 숨김 처리된 정규 슬롯 목록 수집
    const hiddenOverrides = schedules.filter(s =>
      s.isOverrideHidden && s.date && s.date >= wkStart && s.date <= wkEnd
    );

    // 1. 활성 결제 또는 최근 완료 결제에서 정규 스케줄 슬롯 파생
    const paymentDerivedSlots: ScheduleSlot[] = [];
    activeStudents.forEach(student => {
      const activePayment = payments.find(p => p.studentId === student.id && !p.completed && p.remainingSessions > 0);
      // 활성 결제 우선, 없으면 최근 완료 결제 fallback (미결제 상태 표시용)
      const payment = activePayment || payments
        .filter(p => p.studentId === student.id && p.completed && p.regularSchedule?.length)
        .sort((a, b) => b.paidAt.localeCompare(a.paidAt))[0];

      if (payment?.regularSchedule?.length) {
        payment.regularSchedule.forEach((entry, i) => {
          const isHiddenThisWeek = hiddenOverrides.some(h =>
            h.studentId === student.id &&
            h.dayOfWeek === entry.day &&
            h.startTime === entry.startTime
          );
          if (!isHiddenThisWeek) {
            paymentDerivedSlots.push({
              id: `pay-${payment.id}-${i}`,
              studentId: student.id,
              dayOfWeek: entry.day,
              startTime: entry.startTime,
              duration: payment.classDuration,
              isRegular: true,
            });
          }
        });
      }
    });

    // 2. 비정규 슬롯 (보강, 체험, 임시 이동 등) - store에서 가져옴
    const nonRegularSlots = schedules.filter(s => {
      if (s.isOverrideHidden) return false;
      if (s.isRegular) return false; // 기존에 남아있을 수 있는 regular 슬롯 무시
      if (s.date) {
        return s.date >= wkStart && s.date <= wkEnd;
      }
      return true;
    });

    return [...paymentDerivedSlots, ...nonRegularSlots];
  }, [schedules, currentWeekStart, weekEnd, payments, activeStudents]);

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

  // Drop validation
  const isDropValid = useCallback((day: DayOfWeek, time: string, slot: ScheduleSlot): boolean => {
    const hours = getOperatingHours(settings, day);
    if (!hours) return false;
    const startMin = timeToMinutes(time);
    const endMin = startMin + slot.duration;
    if (startMin < timeToMinutes(hours.start) || endMin > timeToMinutes(hours.end)) return false;
    const existingSlots = schedules.filter(s => {
      if (s.id === slot.id) return false;
      if (s.dayOfWeek !== day) return false;
      return isTimeOverlapping(s.startTime, s.duration, time, slot.duration);
    });
    return existingSlots.length < settings.maxStudentsPerSlot;
  }, [settings, schedules]);

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

  const handleDayDrop = (e: React.DragEvent, day: DayOfWeek) => {
    e.preventDefault();
    const time = computeTimeFromY(e, day);
    if (time && draggedSlot && isDropValid(day, time, draggedSlot)) {
      const oldDate = getDateForDay(draggedSlot.dayOfWeek);
      const newDate = getDateForDay(day);
      const existingRecord = attendance.find(r =>
        r.studentId === draggedSlot.studentId &&
        r.date === oldDate &&
        r.startTime === draggedSlot.startTime
      );
      if (existingRecord) {
        updateAttendance(existingRecord.id, { date: newDate, startTime: time });
      }

      if (draggedSlot.isRegular) {
        // 정규 스케줄: 원본은 유지하고, 이번 주에만 적용되는 임시 슬롯 생성
        // 원래 날짜에 대한 "숨김" 마커 추가 (date 필드에 해당 주 날짜 기록)
        addSchedule({
          studentId: draggedSlot.studentId,
          dayOfWeek: draggedSlot.dayOfWeek,
          startTime: draggedSlot.startTime,
          duration: draggedSlot.duration,
          isRegular: false,
          date: oldDate,
          isOverrideHidden: true, // 이번 주 원래 슬롯 숨김용
        } as Omit<ScheduleSlot, 'id'>);
        // 새 위치에 임시 슬롯 생성
        addSchedule({
          studentId: draggedSlot.studentId,
          dayOfWeek: day,
          startTime: time,
          duration: draggedSlot.duration,
          isRegular: false,
          date: newDate,
        });
      } else {
        // 비정규 슬롯: 원래 정규 위치로 되돌리는 경우인지 확인
        const matchingHidden = schedules.find(s =>
          s.isOverrideHidden &&
          s.studentId === draggedSlot.studentId &&
          s.dayOfWeek === day &&
          s.startTime === time
        );
        if (matchingHidden) {
          // 원래 자리로 복원: 숨김 마커 제거 + 임시 슬롯 제거 → 정규 슬롯 자동 복원
          removeSchedule(matchingHidden.id);
          removeSchedule(draggedSlot.id);
        } else {
          // 일반 이동
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

  // Delete with undo
  const handleDeleteSlot = (slot: ScheduleSlot, displayName: string) => {
    if (!confirm(`${displayName} 스케줄을 삭제하시겠습니까?`)) return;
    if (slot.isRegular) {
      // 결제 기반 정규 슬롯: 이번 주에만 숨김 처리 (override hidden 마커 생성)
      const dateStr = getDateForDay(slot.dayOfWeek);
      addSchedule({
        studentId: slot.studentId,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        duration: slot.duration,
        isRegular: false,
        date: dateStr,
        isOverrideHidden: true,
      } as Omit<ScheduleSlot, 'id'>);
    } else {
      removeSchedule(slot.id);
    }
    setDeletedSlot(slot);
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    undoTimeoutRef.current = setTimeout(() => setDeletedSlot(null), 5000);
  };

  const handleUndo = () => {
    if (deletedSlot) {
      if (deletedSlot.isRegular) {
        // 정규 슬롯 삭제 취소: override hidden 마커 제거
        const dateStr = getDateForDay(deletedSlot.dayOfWeek);
        const hiddenMarker = schedules.find(s =>
          s.isOverrideHidden &&
          s.studentId === deletedSlot.studentId &&
          s.dayOfWeek === deletedSlot.dayOfWeek &&
          s.startTime === deletedSlot.startTime &&
          s.date === dateStr
        );
        if (hiddenMarker) removeSchedule(hiddenMarker.id);
      } else {
        restoreSchedule(deletedSlot);
      }
      setDeletedSlot(null);
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

  return (
    <div className="p-3 md:p-6">
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
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-[#00FFFF] border border-[#00FFFF]" /> 60분</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-[#FFD4F9] border border-[#FFD4F9]" /> 80분</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-[#FFF200] border border-[#FFF200]" /> 100분</div>
        <div className="flex items-center gap-1 ml-4"><div className="w-3 h-3 rounded border-2 border-dashed border-orange-400" /> 보강</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-emerald-200 border-2 border-emerald-400" /> 체험</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-rose-200 border-2 border-rose-400" /> 특강</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-100 border-2 border-red-400 border-dashed" /> 미결제</div>
        <div className="flex items-center gap-1 ml-4"><div className="w-3 h-3 rounded ring-2 ring-green-500 bg-white" /> 출석</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded ring-2 ring-red-500 bg-red-50" /> 결석</div>
      </div>

      {/* Day tabs for detail view */}
      {selectedDay && (
        <div className="flex items-center gap-2 mb-4">
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
        </div>
      )}

      {/* Schedule Grid */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-auto -mx-3 md:mx-0 rounded-none md:rounded-xl border-x-0 md:border-x" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className={selectedDay ? '' : 'min-w-[800px]'}>
          {/* Header */}
          <div className="flex bg-gray-50 border-b border-gray-200">
            <div className="w-16 shrink-0 px-2 py-2 text-xs font-medium text-gray-500 text-center border-r border-gray-200">
              시간
            </div>
            {(selectedDay ? [selectedDay] : DAYS_OF_WEEK).map(day => {
              const hours = getOperatingHours(settings, day);
              const dateStr = getDateForDay(day);
              const slotCount = (daySchedules[day] || []).length;
              const holidayName = getHolidayName(dateStr);
              return (
                <div
                  key={day}
                  onClick={() => !selectedDay && hours && setSelectedDay(day)}
                  className={`flex-1 px-3 py-2 text-sm font-medium text-center border-r border-gray-200 last:border-r-0 ${
                    holidayName ? 'bg-red-50 text-red-600' : 'text-gray-700'
                  } ${!selectedDay && hours ? 'cursor-pointer hover:bg-indigo-50 transition-colors' : ''}`}
                >
                  {day}요일
                  <span className="block text-[10px] font-normal text-gray-400">{format(new Date(dateStr + 'T00:00:00'), 'M/d')}</span>
                  {holidayName && (
                    <span className="block text-[10px] font-semibold text-red-500">{holidayName}</span>
                  )}
                  {!holidayName && hours && <span className="block text-[10px] font-normal text-gray-400">{hours.start}-{hours.end}</span>}
                  {selectedDay && <span className="block text-[10px] font-medium text-indigo-500 mt-0.5">{slotCount}개 수업</span>}
                </div>
              );
            })}
          </div>

          {/* Body */}
          <div className="flex">
            {/* Time labels */}
            <div className="w-16 shrink-0 relative border-r border-gray-200" style={{ height: totalHeight }}>
              {timeMarkers.map(time => {
                const top = (timeToMinutes(time) - timeRange.earliest) * PX_PER_MINUTE;
                const [h, m] = time.split(':');
                return (
                  <div
                    key={time}
                    className="absolute left-0 right-0 px-1.5 -translate-y-1/2 flex items-baseline gap-0.5"
                    style={{ top }}
                  >
                    <span className="text-[12px] font-semibold text-gray-600 tabular-nums tracking-tight">{h}</span>
                    <span className="text-[10px] text-gray-400">:{m}</span>
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
                      className={`absolute left-1 right-1 rounded border-2 z-20 pointer-events-none ${
                        isDropValid(day, hoveredCell.time, draggedSlot) ? 'border-green-400 bg-green-50/60' : 'border-red-400 bg-red-50/60'
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
                            absolute z-10 rounded border-2 select-none overflow-hidden
                            bg-rose-100 border-rose-400
                            ${!isSearchMatch ? 'opacity-20' : 'opacity-95'}
                            ${isDayView ? 'px-3 py-2' : 'px-1.5 py-1'}
                          `}
                          style={{
                            top: top + 1,
                            height: height - 2,
                            left: `calc(${leftPercent}% + 2px)`,
                            width: `calc(${widthPercent}% - 4px)`,
                          }}
                        >
                          <div className={`font-semibold truncate text-rose-800 ${isDayView ? 'text-sm' : 'text-xs'}`}>
                            {displayName}
                          </div>
                          <div className={`text-rose-600 tabular-nums ${isDayView ? 'text-xs' : 'text-[10px]'}`}>{slot.startTime}-{endTime}</div>
                          <div className={`text-rose-600 ${isDayView ? 'text-xs' : 'text-[10px]'}`}>{slot.duration}분</div>
                          <div className={`text-rose-700 font-medium ${isDayView ? 'text-xs' : 'text-[10px]'}`}>
                            특강 ({slot.specialClassStudentCount || 0}명)
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={slot.id}
                        draggable
                        onDragStart={(e) => handleDragStart(slot as ScheduleSlot, e)}
                        onDragEnd={handleDragEnd}
                        className={`
                          absolute z-10 rounded cursor-grab active:cursor-grabbing
                          border select-none group/card overflow-hidden
                          transition-all
                          ${isDayView ? 'px-3 py-2' : 'px-1.5 py-1'}
                          ${slot.isUnpaid
                            ? 'bg-red-50 border-red-400 border-2 border-dashed'
                            : isTrial
                            ? 'bg-emerald-100 border-emerald-400 border-2'
                            : isAbsent
                            ? 'bg-red-100 border-red-300'
                            : getDurationColor(slot.duration)
                          }
                          ${!slot.isRegular && !isTrial && !slot.isUnpaid ? 'border-dashed border-orange-400 border-2' : ''}
                          ${draggedSlot?.id === slot.id ? 'opacity-40' : !isSearchMatch ? 'opacity-20' : 'opacity-95 hover:opacity-100'}
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
                        <div className={`font-semibold truncate ${isDayView ? 'text-sm' : 'text-xs'} ${isAbsent ? 'text-red-700 line-through' : 'text-gray-800'}`}>
                          {displayName}
                          {isDayView && student && <span className="font-normal text-gray-500 ml-1">({student.grade})</span>}
                        </div>
                        <div className={`text-gray-500 tabular-nums ${isDayView ? 'text-xs' : 'text-[10px]'}`}>{slot.startTime}-{endTime}</div>
                        <div className={`text-gray-500 ${isDayView ? 'text-xs' : 'text-[10px]'}`}>{slot.duration}분{isDayView && student ? ` | ${student.level}` : ''}</div>
                        {isTrial && <div className={`text-emerald-700 font-medium ${isDayView ? 'text-xs' : 'text-[10px]'}`}>체험</div>}
                        {!slot.isRegular && !isTrial && <div className={`text-orange-600 font-medium ${isDayView ? 'text-xs' : 'text-[10px]'}`}>보강</div>}
                        {slot.isUnpaid && <div className={`text-red-600 font-bold ${isDayView ? 'text-xs' : 'text-[10px]'}`}>미결제</div>}
                        {isRestorable && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRestoreSlot(slot); }}
                            className={`mt-0.5 text-blue-600 hover:text-blue-800 font-medium ${isDayView ? 'text-xs' : 'text-[9px]'}`}
                          >
                            ↩ 돌아가기
                          </button>
                        )}
                        {attendanceRecord && (
                          <div className={`font-bold mt-0.5 ${isDayView ? 'text-xs' : 'text-[9px]'} ${
                            attendanceRecord.status === '출석' ? 'text-green-700' : attendanceRecord.status === '결석' ? 'text-red-600' : 'text-blue-700'
                          }`}>
                            {attendanceRecord.status}
                          </div>
                        )}

                        {/* Memo callout */}
                        {attendanceRecord?.memo && (
                          <div className={`mt-0.5 bg-yellow-50 border-l-2 border-yellow-400 rounded-r ${isDayView ? 'px-2 py-1' : 'px-1 py-0.5'}`} title={attendanceRecord.memo}>
                            <div className={`text-yellow-600 font-bold leading-none mb-px ${isDayView ? 'text-[10px]' : 'text-[8px]'}`}>메모</div>
                            <div className={`text-gray-600 leading-tight ${isDayView ? 'text-xs whitespace-pre-wrap' : 'text-[9px] truncate'}`}>
                              {attendanceRecord.memo}
                            </div>
                          </div>
                        )}

                        {/* Attendance buttons on hover */}
                        {!isTrial && student && (
                          <div className={`absolute bottom-0 left-0 right-0 bg-white/90 border-t border-gray-200 hidden group-hover/card:flex items-center justify-center py-0.5 ${isDayView ? 'gap-1.5' : 'gap-0.5'}`}>
                            {(['출석', '결석', '보강'] as AttendanceStatus[]).map(status => (
                              <button
                                key={status}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleScheduleAttendance(student.id, day, status, slot.startTime, slot.duration as ClassDuration);
                                }}
                                className={`rounded-full font-bold transition-all ${
                                  isDayView ? 'w-7 h-7 text-[10px]' : 'w-5 h-5 text-[8px]'
                                } ${
                                  attendanceRecord?.status === status
                                    ? status === '출석' ? 'bg-green-500 text-white' : status === '결석' ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'
                                    : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
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
                                isDayView ? 'w-7 h-7 text-[10px]' : 'w-5 h-5 text-[8px]'
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
                          className={`absolute top-0 right-0 bg-red-500 text-white rounded-full leading-none items-center justify-center hidden group-hover/card:flex ${
                            isDayView ? 'w-5 h-5 text-xs' : 'w-4 h-4 text-[10px]'
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
    </div>
  );
}
