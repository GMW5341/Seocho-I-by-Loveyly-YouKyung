import { useState, useMemo, useRef, useCallback } from 'react';
import { useAppStore } from '../../store/StoreContext';
import type { DayOfWeek, ScheduleSlot } from '../../types';
import { DAYS_OF_WEEK, generateTimeSlots, getOperatingHours, getEndTime, isTimeOverlapping, getDurationColor } from '../../utils/helpers';
import Modal from '../common/Modal';
import MakeupForm from './MakeupForm';

export default function ScheduleGrid() {
  const { students, schedules, settings, moveSchedule, removeSchedule, addSchedule } = useAppStore();
  const [showMakeupForm, setShowMakeupForm] = useState(false);
  const [draggedSlot, setDraggedSlot] = useState<ScheduleSlot | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ day: DayOfWeek; time: string } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const activeStudents = useMemo(() => students.filter(s => s.active), [students]);

  const getStudentById = useCallback((id: string) => {
    return activeStudents.find(s => s.id === id);
  }, [activeStudents]);

  // Get all time slots for the current season
  const allTimeSlots = useMemo(() => {
    const allTimes = new Set<string>();
    DAYS_OF_WEEK.forEach(day => {
      const hours = getOperatingHours(settings, day);
      if (hours) {
        generateTimeSlots(hours.start, hours.end, 30).forEach(t => allTimes.add(t));
      }
    });
    return Array.from(allTimes).sort();
  }, [settings]);

  // Get slots for a specific day and time
  const getSlotsAt = useCallback((day: DayOfWeek, time: string): ScheduleSlot[] => {
    return schedules.filter(s => {
      if (s.dayOfWeek !== day) return false;
      return isTimeOverlapping(s.startTime, s.duration, time, 30);
    });
  }, [schedules]);

  // Check if drop is valid
  const isDropValid = useCallback((day: DayOfWeek, time: string, slot: ScheduleSlot): boolean => {
    const hours = getOperatingHours(settings, day);
    if (!hours) return false;

    // Check operating hours
    if (time < hours.start || getEndTime(time, slot.duration) > hours.end) return false;

    // Check capacity (exclude the dragged slot itself)
    const existingSlots = schedules.filter(s => {
      if (s.id === slot.id) return false;
      if (s.dayOfWeek !== day) return false;
      return isTimeOverlapping(s.startTime, s.duration, time, slot.duration);
    });

    return existingSlots.length < settings.maxStudentsPerSlot;
  }, [settings, schedules]);

  const handleDragStart = (slot: ScheduleSlot) => {
    setDraggedSlot(slot);
  };

  const handleDragOver = (e: React.DragEvent, day: DayOfWeek, time: string) => {
    e.preventDefault();
    setHoveredCell({ day, time });
  };

  const handleDrop = (e: React.DragEvent, day: DayOfWeek, time: string) => {
    e.preventDefault();
    if (draggedSlot && isDropValid(day, time, draggedSlot)) {
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

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-800">주간 스케줄</h3>
          <p className="text-sm text-gray-500">
            {settings.currentSeason} | 동시간대 최대 {settings.maxStudentsPerSlot}명
          </p>
        </div>
        <button
          onClick={() => setShowMakeupForm(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          + 보강 추가
        </button>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mb-4 text-xs">
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
      </div>

      {/* Schedule Grid */}
      <div ref={gridRef} className="bg-white rounded-xl border border-gray-200 overflow-auto">
        <table className="w-full border-collapse min-w-[800px]">
          <thead>
            <tr className="bg-gray-50">
              <th className="border-b border-r border-gray-200 px-3 py-2 text-xs font-medium text-gray-500 w-20 sticky left-0 bg-gray-50 z-10">시간</th>
              {DAYS_OF_WEEK.map(day => {
                const hours = getOperatingHours(settings, day);
                return (
                  <th key={day} className="border-b border-r border-gray-200 px-3 py-2 text-sm font-medium text-gray-700">
                    {day}요일
                    {hours && <span className="block text-xs font-normal text-gray-400">{hours.start}-{hours.end}</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {allTimeSlots.map(time => (
              <tr key={time} className="group">
                <td className="border-b border-r border-gray-100 px-3 py-1 text-xs text-gray-500 font-mono sticky left-0 bg-white z-10">
                  {time}
                </td>
                {DAYS_OF_WEEK.map(day => {
                  const hours = getOperatingHours(settings, day);
                  const isOperating = hours && time >= hours.start && time < hours.end;
                  const slots = getSlotsAt(day, time);
                  const count = slots.length;
                  const isFull = count >= settings.maxStudentsPerSlot;
                  const isHovered = hoveredCell?.day === day && hoveredCell?.time === time;
                  const isValidDrop = draggedSlot ? isDropValid(day, time, draggedSlot) : false;

                  // Only show the slot card at its start time
                  const startingSlots = schedules.filter(s => s.dayOfWeek === day && s.startTime === time);

                  return (
                    <td
                      key={day}
                      className={`border-b border-r border-gray-100 px-1 py-1 align-top transition-colors relative ${
                        !isOperating ? 'bg-gray-100' :
                        isHovered && isValidDrop ? 'bg-green-50' :
                        isHovered && !isValidDrop ? 'bg-red-50' :
                        isFull ? 'bg-red-50/30' : ''
                      }`}
                      onDragOver={e => isOperating ? handleDragOver(e, day, time) : undefined}
                      onDrop={e => isOperating ? handleDrop(e, day, time) : undefined}
                      style={{ minHeight: '40px', height: '40px' }}
                    >
                      {isOperating && (
                        <div className="flex flex-wrap gap-1">
                          {startingSlots.map(slot => {
                            const student = getStudentById(slot.studentId);
                            if (!student) return null;
                            return (
                              <div
                                key={slot.id}
                                draggable
                                onDragStart={() => handleDragStart(slot)}
                                onDragEnd={handleDragEnd}
                                className={`
                                  text-xs px-1.5 py-0.5 rounded cursor-grab active:cursor-grabbing
                                  border select-none relative group/card
                                  ${getDurationColor(slot.duration)}
                                  ${!slot.isRegular ? 'border-dashed border-orange-400' : ''}
                                  ${draggedSlot?.id === slot.id ? 'opacity-40' : ''}
                                `}
                                title={`${student.name} (${student.level}) - ${slot.duration}분 [${slot.startTime}~${getEndTime(slot.startTime, slot.duration)}]`}
                              >
                                <div className="font-medium truncate max-w-[80px]">{student.name}</div>
                                <div className="text-[10px] text-gray-500">{slot.duration}분</div>
                                {!slot.isRegular && <div className="text-[10px] text-orange-600">보강</div>}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm(`${student.name} 스케줄을 삭제하시겠습니까?`)) removeSchedule(slot.id);
                                  }}
                                  className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] leading-none items-center justify-center hidden group-hover/card:flex"
                                >
                                  &times;
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {/* Capacity indicator */}
                      {isOperating && count > 0 && time === allTimeSlots.find(t => getSlotsAt(day, t).length > 0 && schedules.some(s => s.dayOfWeek === day && s.startTime === t)) && (
                        <div className={`absolute top-0 right-0 text-[9px] px-1 rounded-bl ${
                          isFull ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-600'
                        }`}>
                          {count}/{settings.maxStudentsPerSlot}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showMakeupForm} onClose={() => setShowMakeupForm(false)} title="보강 수업 추가">
        <MakeupForm
          students={activeStudents}
          onSubmit={handleAddMakeup}
          onCancel={() => setShowMakeupForm(false)}
        />
      </Modal>
    </div>
  );
}
