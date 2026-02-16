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

const PX_PER_MINUTE = 2.5;

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  '출석': 'ring-2 ring-green-500',
  '결석': 'ring-2 ring-red-500 bg-red-50',
  '보강': 'ring-2 ring-blue-500',
  '예정': '',
};

export default function ScheduleGrid() {
  const {
    students, schedules, settings, trialStudents, attendance,
    moveSchedule, removeSchedule, addSchedule,
    addTrialStudent, addTrialLesson,
    addAttendance, updateAttendance, deleteAttendance,
  } = useAppStore();
  const [showMakeupForm, setShowMakeupForm] = useState(false);
  const [showTrialForm, setShowTrialForm] = useState(false);
  const [draggedSlot, setDraggedSlot] = useState<ScheduleSlot | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ day: DayOfWeek; time: string } | null>(null);
  const [memoSlot, setMemoSlot] = useState<{ slotId: string; studentId: string; date: string; memo: string } | null>(null);
  const dayColumnRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Week navigation
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
  const goToPrevWeek = () => setCurrentWeekStart(prev => subWeeks(prev, 1));
  const goToNextWeek = () => setCurrentWeekStart(prev => addWeeks(prev, 1));
  const goToThisWeek = () => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  // Get specific date for a day-of-week in the current viewed week
  const getDateForDay = useCallback((day: DayOfWeek): string => {
    const dayMap: Record<DayOfWeek, number> = { '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6 };
    const offset = dayMap[day];
    const date = new Date(currentWeekStart);
    date.setDate(date.getDate() + offset);
    return format(date, 'yyyy-MM-dd');
  }, [currentWeekStart]);

  const activeStudents = useMemo(() => students.filter(s => s.active), [students]);

  const getStudentById = useCallback((id: string) => {
    return activeStudents.find(s => s.id === id);
  }, [activeStudents]);

  const getTrialStudentById = useCallback((id: string) => {
    return trialStudents.find(s => s.id === id);
  }, [trialStudents]);

  // Get attendance record for student on a specific date
  const getAttendanceRecord = useCallback((studentId: string, date: string) => {
    return attendance.find(r => r.studentId === studentId && r.date === date);
  }, [attendance]);

  // Toggle attendance from schedule block
  const handleScheduleAttendance = (studentId: string, day: DayOfWeek, status: AttendanceStatus) => {
    const date = getDateForDay(day);
    const student = getStudentById(studentId);
    if (!student) return;

    const existing = getAttendanceRecord(studentId, date);
    if (existing) {
      if (existing.status === status) {
        deleteAttendance(existing.id);
      } else {
        updateAttendance(existing.id, { status });
      }
    } else {
      addAttendance({
        studentId,
        date,
        status,
        startTime: (student.regularSchedule || []).find(e => e.day === day)?.startTime || '14:00',
        duration: student.classDuration,
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

  // Filter schedules: regular always shown, non-regular only if matching week
  const filteredSchedules = useMemo(() => {
    return schedules.filter(s => {
      if (s.isRegular) return true;
      // Non-regular: if it has a date, check if it's in current week
      if (s.date) {
        return s.date >= format(currentWeekStart, 'yyyy-MM-dd') && s.date <= format(weekEnd, 'yyyy-MM-dd');
      }
      return true; // Legacy non-regular without date
    });
  }, [schedules, currentWeekStart, weekEnd]);

  // Schedules grouped by day with layout info
  const daySchedules = useMemo(() => {
    const result: Record<string, Array<ScheduleSlot & { column: number; numColumns: number }>> = {};
    DAYS_OF_WEEK.forEach(day => {
      const daySlots = filteredSchedules.filter(s => s.dayOfWeek === day);
      const layout = layoutSlotsForDay(daySlots);
      result[day] = daySlots.map(slot => {
        const pos = layout.get(slot.id) || { column: 0, numColumns: 1 };
        return { ...slot, column: pos.column, numColumns: pos.numColumns };
      });
    });
    return result;
  }, [filteredSchedules]);

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

  // Drag handlers
  const handleDragStart = (slot: ScheduleSlot) => setDraggedSlot(slot);

  const computeTimeFromY = (e: React.DragEvent, day: DayOfWeek): string | null => {
    const col = dayColumnRefs.current[day];
    if (!col) return null;
    const rect = col.getBoundingClientRect();
    const y = e.clientY - rect.top;
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
      moveSchedule(draggedSlot.id, day, time);
    }
    setDraggedSlot(null);
    setHoveredCell(null);
  };

  const handleDragEnd = () => {
    setDraggedSlot(null);
    setHoveredCell(null);
  };

  const handleAddMakeup = (data: { studentId: string; dayOfWeek: DayOfWeek; startTime: string; duration: number }) => {
    addSchedule({
      studentId: data.studentId,
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      duration: data.duration as 60 | 80 | 100,
      isRegular: false,
      date: getDateForDay(data.dayOfWeek),
    });
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
    const existing = getAttendanceRecord(memoSlot.studentId, memoSlot.date);
    if (existing) {
      updateAttendance(existing.id, { memo: memoSlot.memo });
    }
    setMemoSlot(null);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-800">주간 스케줄</h3>
          <p className="text-sm text-gray-500">
            {settings.currentSeason} | 동시간대 최대 {settings.maxStudentsPerSlot}명
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowTrialForm(true)}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            + 체험 수업
          </button>
          <button
            onClick={() => setShowMakeupForm(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            + 보강 추가
          </button>
        </div>
      </div>

      {/* Week Navigation */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={goToPrevWeek} className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-lg text-sm hover:bg-gray-50 text-gray-600">&lsaquo;</button>
        <button onClick={goToThisWeek} className="px-3 py-1.5 bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-medium">이번주</button>
        <button onClick={goToNextWeek} className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-lg text-sm hover:bg-gray-50 text-gray-600">&rsaquo;</button>
        <span className="text-sm font-medium text-gray-700 ml-1">
          {format(currentWeekStart, 'yyyy년 MM월 dd일', { locale: ko })} ~ {format(weekEnd, 'MM월 dd일', { locale: ko })}
        </span>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mb-4 text-xs flex-wrap">
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-amber-200 border border-amber-300" /> 60분</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-sky-200 border border-sky-300" /> 80분</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-violet-200 border border-violet-300" /> 100분</div>
        <div className="flex items-center gap-1 ml-4"><div className="w-3 h-3 rounded border-2 border-dashed border-orange-400" /> 보강</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-emerald-200 border-2 border-emerald-400" /> 체험</div>
        <div className="flex items-center gap-1 ml-4"><div className="w-3 h-3 rounded ring-2 ring-green-500 bg-white" /> 출석</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded ring-2 ring-red-500 bg-red-50" /> 결석</div>
      </div>

      {/* Schedule Grid */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
        <div className="min-w-[800px]">
          {/* Header */}
          <div className="flex bg-gray-50 border-b border-gray-200">
            <div className="w-16 shrink-0 px-2 py-2 text-xs font-medium text-gray-500 text-center border-r border-gray-200">
              시간
            </div>
            {DAYS_OF_WEEK.map(day => {
              const hours = getOperatingHours(settings, day);
              const dateStr = getDateForDay(day);
              return (
                <div key={day} className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 text-center border-r border-gray-200 last:border-r-0">
                  {day}요일
                  <span className="block text-[10px] font-normal text-gray-400">{format(new Date(dateStr + 'T00:00:00'), 'M/d')}</span>
                  {hours && <span className="block text-[10px] font-normal text-gray-400">{hours.start}-{hours.end}</span>}
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
            {DAYS_OF_WEEK.map(day => {
              const hours = getOperatingHours(settings, day);
              const isOperating = !!hours;
              const daySlots = daySchedules[day] || [];
              const dateStr = getDateForDay(day);
              const opStart = hours ? timeToMinutes(hours.start) : timeRange.earliest;
              const opEnd = hours ? timeToMinutes(hours.end) : timeRange.latest;

              return (
                <div
                  key={day}
                  ref={el => { dayColumnRefs.current[day] = el; }}
                  className={`flex-1 relative border-r border-gray-200 last:border-r-0 ${!isOperating ? 'bg-gray-100' : ''}`}
                  style={{ height: totalHeight }}
                  onDragOver={e => isOperating ? handleDayDragOver(e, day) : undefined}
                  onDrop={e => isOperating ? handleDayDrop(e, day) : undefined}
                >
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
                    const isTrial = slot.isTrial;
                    const student = isTrial ? null : getStudentById(slot.studentId);
                    const trialStudent = isTrial && slot.trialStudentId ? getTrialStudentById(slot.trialStudentId) : null;
                    const displayName = isTrial ? (trialStudent?.name || '체험') : (student?.name || '');

                    if (!isTrial && !student) return null;

                    const top = (timeToMinutes(slot.startTime) - timeRange.earliest) * PX_PER_MINUTE;
                    const height = slot.duration * PX_PER_MINUTE;
                    const widthPercent = 100 / slot.numColumns;
                    const leftPercent = slot.column * widthPercent;
                    const endTime = getEndTime(slot.startTime, slot.duration);

                    // Attendance status for this block
                    const attendanceRecord = !isTrial && student ? getAttendanceRecord(student.id, dateStr) : null;
                    const attendanceClass = attendanceRecord ? STATUS_COLORS[attendanceRecord.status] || '' : '';
                    const isAbsent = attendanceRecord?.status === '결석';

                    return (
                      <div
                        key={slot.id}
                        draggable
                        onDragStart={() => handleDragStart(slot)}
                        onDragEnd={handleDragEnd}
                        className={`
                          absolute z-10 px-1.5 py-1 rounded cursor-grab active:cursor-grabbing
                          border select-none group/card overflow-hidden
                          transition-all
                          ${isTrial
                            ? 'bg-emerald-100 border-emerald-400 border-2'
                            : isAbsent
                            ? 'bg-red-100 border-red-300'
                            : getDurationColor(slot.duration)
                          }
                          ${!slot.isRegular && !isTrial ? 'border-dashed border-orange-400 border-2' : ''}
                          ${draggedSlot?.id === slot.id ? 'opacity-40' : 'opacity-95 hover:opacity-100'}
                          ${attendanceClass}
                        `}
                        style={{
                          top: top + 1,
                          height: height - 2,
                          left: `calc(${leftPercent}% + 2px)`,
                          width: `calc(${widthPercent}% - 4px)`,
                        }}
                      >
                        <div className={`font-semibold text-xs truncate ${isAbsent ? 'text-red-700 line-through' : 'text-gray-800'}`}>
                          {displayName}
                        </div>
                        <div className="text-[10px] text-gray-500 tabular-nums">{slot.startTime}-{endTime}</div>
                        <div className="text-[10px] text-gray-500">{slot.duration}분</div>
                        {isTrial && <div className="text-[10px] text-emerald-700 font-medium">체험</div>}
                        {!slot.isRegular && !isTrial && <div className="text-[10px] text-orange-600 font-medium">보강</div>}
                        {attendanceRecord && (
                          <div className={`text-[9px] font-bold mt-0.5 ${
                            attendanceRecord.status === '출석' ? 'text-green-700' : attendanceRecord.status === '결석' ? 'text-red-600' : 'text-blue-700'
                          }`}>
                            {attendanceRecord.status}
                            {attendanceRecord.memo && ' *'}
                          </div>
                        )}

                        {/* Attendance buttons - shown on hover for regular students */}
                        {!isTrial && student && (
                          <div className="absolute bottom-0 left-0 right-0 bg-white/90 border-t border-gray-200 hidden group-hover/card:flex items-center justify-center gap-0.5 py-0.5">
                            {(['출석', '결석', '보강'] as AttendanceStatus[]).map(status => (
                              <button
                                key={status}
                                onClick={(e) => { e.stopPropagation(); handleScheduleAttendance(student.id, day, status); }}
                                className={`w-5 h-5 rounded-full text-[8px] font-bold transition-all ${
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
                                  memo: attendanceRecord?.memo || '',
                                });
                              }}
                              className="w-5 h-5 rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 text-[8px] font-bold"
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
                            if (confirm(`${displayName} 스케줄을 삭제하시겠습니까?`)) removeSchedule(slot.id);
                          }}
                          className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] leading-none items-center justify-center hidden group-hover/card:flex"
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
