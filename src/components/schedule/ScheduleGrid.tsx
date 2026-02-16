import { useState, useMemo, useRef, useCallback } from 'react';
import { useAppStore } from '../../store/StoreContext';
import type { DayOfWeek, ScheduleSlot, ClassDuration, StudentGrade } from '../../types';
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

export default function ScheduleGrid() {
  const {
    students, schedules, settings, trialStudents,
    moveSchedule, removeSchedule, addSchedule,
    addTrialStudent, addTrialLesson,
  } = useAppStore();
  const [showMakeupForm, setShowMakeupForm] = useState(false);
  const [showTrialForm, setShowTrialForm] = useState(false);
  const [draggedSlot, setDraggedSlot] = useState<ScheduleSlot | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ day: DayOfWeek; time: string } | null>(null);
  const dayColumnRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const activeStudents = useMemo(() => students.filter(s => s.active), [students]);

  const getStudentById = useCallback((id: string) => {
    return activeStudents.find(s => s.id === id);
  }, [activeStudents]);

  const getTrialStudentById = useCallback((id: string) => {
    return trialStudents.find(s => s.id === id);
  }, [trialStudents]);

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

  // Schedules grouped by day with layout info
  const daySchedules = useMemo(() => {
    const result: Record<string, Array<ScheduleSlot & { column: number; numColumns: number }>> = {};
    DAYS_OF_WEEK.forEach(day => {
      const daySlots = schedules.filter(s => s.dayOfWeek === day);
      const layout = layoutSlotsForDay(daySlots);
      result[day] = daySlots.map(slot => {
        const pos = layout.get(slot.id) || { column: 0, numColumns: 1 };
        return { ...slot, column: pos.column, numColumns: pos.numColumns };
      });
    });
    return result;
  }, [schedules]);

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
  const handleDragStart = (slot: ScheduleSlot) => {
    setDraggedSlot(slot);
  };

  const computeTimeFromY = (e: React.DragEvent, day: DayOfWeek): string | null => {
    const col = dayColumnRefs.current[day];
    if (!col) return null;
    const rect = col.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const rawMinutes = Math.floor(y / PX_PER_MINUTE) + timeRange.earliest;
    // Snap to 10-minute intervals
    const snapped = Math.round(rawMinutes / 10) * 10;
    const clamped = Math.max(timeRange.earliest, Math.min(snapped, timeRange.latest));
    return minutesToTime(clamped);
  };

  const handleDayDragOver = (e: React.DragEvent, day: DayOfWeek) => {
    e.preventDefault();
    const hours = getOperatingHours(settings, day);
    if (!hours) return;
    const time = computeTimeFromY(e, day);
    if (time) {
      setHoveredCell({ day, time });
    }
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
    });
    setShowTrialForm(false);
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

      {/* Legend */}
      <div className="flex gap-4 mb-4 text-xs flex-wrap">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-amber-200 border border-amber-300" /> 60분
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-sky-200 border border-sky-300" /> 80분
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-violet-200 border border-violet-300" /> 100분
        </div>
        <div className="flex items-center gap-1 ml-4">
          <div className="w-3 h-3 rounded border-2 border-dashed border-orange-400" /> 보강
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-emerald-200 border-2 border-emerald-400" /> 체험
        </div>
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
              return (
                <div key={day} className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 text-center border-r border-gray-200 last:border-r-0">
                  {day}요일
                  {hours && <span className="block text-xs font-normal text-gray-400">{hours.start}-{hours.end}</span>}
                </div>
              );
            })}
          </div>

          {/* Body: Time labels + Day columns */}
          <div className="flex">
            {/* Time labels */}
            <div className="w-16 shrink-0 relative border-r border-gray-200" style={{ height: totalHeight }}>
              {timeMarkers.map(time => {
                const top = (timeToMinutes(time) - timeRange.earliest) * PX_PER_MINUTE;
                return (
                  <div
                    key={time}
                    className="absolute left-0 right-0 text-[11px] text-gray-500 font-mono px-1 -translate-y-1/2"
                    style={{ top }}
                  >
                    {time}
                  </div>
                );
              })}
            </div>

            {/* Day columns */}
            {DAYS_OF_WEEK.map(day => {
              const hours = getOperatingHours(settings, day);
              const isOperating = !!hours;
              const daySlots = daySchedules[day] || [];

              // Operating range for this day
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
                  {/* Non-operating overlay (before hours) */}
                  {hours && timeToMinutes(hours.start) > timeRange.earliest && (
                    <div
                      className="absolute left-0 right-0 bg-gray-100/70"
                      style={{
                        top: 0,
                        height: (timeToMinutes(hours.start) - timeRange.earliest) * PX_PER_MINUTE,
                      }}
                    />
                  )}
                  {/* Non-operating overlay (after hours) */}
                  {hours && timeToMinutes(hours.end) < timeRange.latest && (
                    <div
                      className="absolute left-0 right-0 bg-gray-100/70"
                      style={{
                        top: (timeToMinutes(hours.end) - timeRange.earliest) * PX_PER_MINUTE,
                        height: (timeRange.latest - timeToMinutes(hours.end)) * PX_PER_MINUTE,
                      }}
                    />
                  )}

                  {/* 30-minute grid lines */}
                  {timeMarkers.map(time => {
                    const top = (timeToMinutes(time) - timeRange.earliest) * PX_PER_MINUTE;
                    const min = timeToMinutes(time);
                    if (min < opStart || min >= opEnd) return null;
                    return (
                      <div
                        key={time}
                        className="absolute left-0 right-0 border-t border-gray-100"
                        style={{ top }}
                      />
                    );
                  })}

                  {/* Drop hover indicator */}
                  {hoveredCell?.day === day && draggedSlot && (
                    <div
                      className={`absolute left-1 right-1 rounded border-2 z-20 pointer-events-none ${
                        isDropValid(day, hoveredCell.time, draggedSlot)
                          ? 'border-green-400 bg-green-50/60'
                          : 'border-red-400 bg-red-50/60'
                      }`}
                      style={{
                        top: (timeToMinutes(hoveredCell.time) - timeRange.earliest) * PX_PER_MINUTE,
                        height: draggedSlot.duration * PX_PER_MINUTE,
                      }}
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

                    return (
                      <div
                        key={slot.id}
                        draggable
                        onDragStart={() => handleDragStart(slot)}
                        onDragEnd={handleDragEnd}
                        className={`
                          absolute z-10 px-1.5 py-1 rounded cursor-grab active:cursor-grabbing
                          border select-none group/card overflow-hidden
                          transition-opacity
                          ${isTrial
                            ? 'bg-emerald-100 border-emerald-400 border-2'
                            : getDurationColor(slot.duration)
                          }
                          ${!slot.isRegular && !isTrial ? 'border-dashed border-orange-400 border-2' : ''}
                          ${draggedSlot?.id === slot.id ? 'opacity-40' : 'opacity-95 hover:opacity-100'}
                        `}
                        style={{
                          top: top + 1,
                          height: height - 2,
                          left: `calc(${leftPercent}% + 2px)`,
                          width: `calc(${widthPercent}% - 4px)`,
                        }}
                        title={isTrial
                          ? `[체험] ${displayName} - ${slot.duration}분 [${slot.startTime}~${endTime}]`
                          : `${displayName} (${student?.level}) - ${slot.duration}분 [${slot.startTime}~${endTime}]`
                        }
                      >
                        <div className="font-semibold text-xs truncate text-gray-800">{displayName}</div>
                        <div className="text-[10px] text-gray-500">{slot.startTime}-{endTime}</div>
                        <div className="text-[10px] text-gray-500">{slot.duration}분</div>
                        {isTrial && <div className="text-[10px] text-emerald-700 font-medium">체험</div>}
                        {!slot.isRegular && !isTrial && <div className="text-[10px] text-orange-600 font-medium">보강</div>}

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

      <Modal isOpen={showMakeupForm} onClose={() => setShowMakeupForm(false)} title="보강 수업 추가">
        <MakeupForm
          students={activeStudents}
          onSubmit={handleAddMakeup}
          onCancel={() => setShowMakeupForm(false)}
        />
      </Modal>

      <Modal isOpen={showTrialForm} onClose={() => setShowTrialForm(false)} title="체험 수업 추가">
        <TrialForm
          onSubmit={handleAddTrial}
          onCancel={() => setShowTrialForm(false)}
        />
      </Modal>
    </div>
  );
}
