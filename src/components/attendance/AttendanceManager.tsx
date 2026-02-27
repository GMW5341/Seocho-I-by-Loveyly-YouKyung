import { useState, useMemo, useRef, useEffect } from 'react';
import {
  format, startOfWeek, endOfWeek, addWeeks, subWeeks,
  eachDayOfInterval, isSameDay, startOfMonth, endOfMonth,
  getDay, subMonths, addMonths
} from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAppStore } from '../../store/StoreContext';
import type { AttendanceStatus, DayOfWeek } from '../../types';
import { getDayOfWeekFromDate } from '../../utils/helpers';
import Badge from '../common/Badge';

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; color: string }[] = [
  { value: '출석', label: '출석', color: 'bg-green-500' },
  { value: '결석', label: '결석', color: 'bg-red-500' },
  { value: '보강', label: '보강', color: 'bg-blue-500' },
];

export default function AttendanceManager() {
  const { students, attendance, addAttendance, updateAttendance, deleteAttendance, payments, schedules } = useAppStore();
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [selectedStudent, setSelectedStudent] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const calendarRef = useRef<HTMLDivElement>(null);

  const activeStudents = useMemo(() => students.filter(s => s.active), [students]);

  const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: currentWeekStart, end: weekEnd })
    .filter(d => d.getDay() >= 2 && d.getDay() <= 6); // 화~토

  const goToPrevWeek = () => setCurrentWeekStart(prev => subWeeks(prev, 1));
  const goToNextWeek = () => setCurrentWeekStart(prev => addWeeks(prev, 1));

  // Close calendar on outside click
  useEffect(() => {
    if (!showCalendar) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setShowCalendar(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCalendar]);

  // Get scheduled times for a student on a day - from independent schedule slots
  const getScheduledTimes = (studentId: string, dayOfWeek: DayOfWeek | null) => {
    if (!dayOfWeek) return [];
    return schedules
      .filter(s => s.studentId === studentId && s.isRegular && s.dayOfWeek === dayOfWeek && !s.isOverrideHidden)
      .map(s => ({ day: s.dayOfWeek, startTime: s.startTime }));
  };

  // Get attendance record for a student on a specific date + startTime
  const getRecord = (studentId: string, date: string, startTime: string) => {
    return attendance.find(r => r.studentId === studentId && r.date === date && r.startTime === startTime);
  };

  // Toggle attendance status per schedule slot
  const handleStatusChange = (studentId: string, date: string, status: AttendanceStatus, startTime: string) => {
    const existing = getRecord(studentId, date, startTime);
    const student = activeStudents.find(s => s.id === studentId);
    if (!student) return;

    if (existing) {
      if (existing.status === status) {
        deleteAttendance(existing.id);
      } else {
        updateAttendance(existing.id, { status });
      }
    } else {
      const activePayment = payments.find(p => p.studentId === studentId && !p.completed && p.remainingSessions > 0);
      addAttendance({
        studentId,
        date,
        status,
        startTime,
        duration: activePayment?.classDuration || 60,
        isMakeup: status === '보강',
        memo: '',
      });
    }
  };

  // Student attendance summary
  const getStudentSummary = (studentId: string) => {
    const activePayment = payments.find(p => p.studentId === studentId && !p.completed);
    return {
      activePayment,
      remaining: activePayment ? activePayment.remainingSessions : 0,
    };
  };

  const filteredStudents = useMemo(() => {
    let result = activeStudents;
    if (selectedStudent !== 'all') {
      result = result.filter(s => s.id === selectedStudent);
    }
    if (searchQuery) {
      result = result.filter(s => s.name.includes(searchQuery));
    }
    return result;
  }, [activeStudents, selectedStudent, searchQuery]);

  // Calendar generation
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(calendarMonth);
    const monthEnd = endOfMonth(calendarMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const startDayOfWeek = getDay(monthStart);
    const paddingDays: (Date | null)[] = Array(startDayOfWeek).fill(null);
    return [...paddingDays, ...days];
  }, [calendarMonth]);

  return (
    <div className="p-3 md:p-6">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h3 className="text-lg font-bold text-gray-800">출결 관리</h3>
      </div>

      {/* Week Navigation - date range only + calendar */}
      <div className="flex items-center gap-3 mb-4 relative">
        <button onClick={goToPrevWeek} className="px-3 py-1 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">&lsaquo;</button>

        {/* Clickable date range → opens calendar */}
        <div className="relative" ref={calendarRef}>
          <button
            onClick={() => {
              setCalendarMonth(currentWeekStart);
              setShowCalendar(!showCalendar);
            }}
            className="text-sm font-semibold text-gray-800 hover:text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded transition-colors cursor-pointer"
          >
            {format(currentWeekStart, 'yyyy년 M월 d일', { locale: ko })} ~ {format(weekEnd, 'M월 d일', { locale: ko })}
          </button>

          {/* Calendar Popup */}
          {showCalendar && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-4 z-50 w-[280px]">
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => setCalendarMonth(prev => subMonths(prev, 1))}
                  className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-600"
                >
                  &lsaquo;
                </button>
                <span className="text-sm font-semibold text-gray-800">
                  {format(calendarMonth, 'yyyy년 M월', { locale: ko })}
                </span>
                <button
                  onClick={() => setCalendarMonth(prev => addMonths(prev, 1))}
                  className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-600"
                >
                  &rsaquo;
                </button>
              </div>
              <div className="grid grid-cols-7 gap-0.5 text-xs mb-1">
                {['일', '월', '화', '수', '목', '금', '토'].map(d => (
                  <div key={d} className="text-center text-gray-400 font-medium py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5 text-xs">
                {calendarDays.map((day, i) => {
                  if (!day) return <div key={`pad-${i}`} className="w-8 h-8" />;
                  const dayWeekStart = startOfWeek(day, { weekStartsOn: 1 });
                  const isSelectedWeek = dayWeekStart.getTime() === currentWeekStart.getTime();
                  const isToday = isSameDay(day, new Date());
                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => {
                        setCurrentWeekStart(dayWeekStart);
                        setShowCalendar(false);
                      }}
                      className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
                        isSelectedWeek
                          ? 'bg-indigo-100 text-indigo-700 font-bold'
                          : isToday
                          ? 'bg-amber-50 text-amber-700 font-semibold ring-1 ring-amber-300'
                          : 'hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      {format(day, 'd')}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 pt-2 border-t border-gray-100 flex justify-center">
                <button
                  onClick={() => {
                    setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
                    setShowCalendar(false);
                  }}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  오늘로 이동
                </button>
              </div>
            </div>
          )}
        </div>

        <button onClick={goToNextWeek} className="px-3 py-1 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">&rsaquo;</button>
      </div>

      {/* Student filter */}
      <div className="flex gap-2 mb-4">
        <div className="relative">
          <input
            type="text"
            placeholder="이름 검색..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setSelectedStudent('all'); }}
            autoComplete="off"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-36 md:w-44 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
        <select
          value={selectedStudent}
          onChange={e => { setSelectedStudent(e.target.value); setSearchQuery(''); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="all">전체 원생</option>
          {activeStudents.map(s => (
            <option key={s.id} value={s.id}>{s.name} ({s.level})</option>
          ))}
        </select>
      </div>

      {/* Attendance Grid */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="border-b border-r border-gray-200 px-4 py-3 text-xs font-medium text-gray-500 text-left sticky left-0 bg-gray-50 z-10 min-w-[120px]">
                원생
              </th>
              <th className="border-b border-r border-gray-200 px-3 py-3 text-xs font-medium text-gray-500 text-center min-w-[60px]">
                잔여
              </th>
              {weekDays.map(day => (
                <th key={day.toISOString()} className={`border-b border-r border-gray-200 px-3 py-3 text-xs font-medium text-gray-500 text-center min-w-[100px] ${
                  isSameDay(day, new Date()) ? 'bg-indigo-50' : ''
                }`}>
                  <div>{format(day, 'EEE', { locale: ko })}</div>
                  <div className="text-gray-400">{format(day, 'MM/dd')}</div>
                </th>
              ))}
              <th className="border-b border-gray-200 px-3 py-3 text-xs font-medium text-gray-500 text-center min-w-[80px]">
                주간 요약
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredStudents.map(student => {
              const summary = getStudentSummary(student.id);
              const weekRecords = weekDays.map(day => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const dayOfWeek = getDayOfWeekFromDate(dateStr);
                const scheduledTimes = getScheduledTimes(student.id, dayOfWeek);
                const records = scheduledTimes.map(entry => ({
                  startTime: entry.startTime,
                  record: getRecord(student.id, dateStr, entry.startTime),
                }));
                return { date: dateStr, dayOfWeek, scheduledTimes, records };
              });
              const weekPresent = weekRecords.reduce((acc, r) =>
                acc + r.records.filter(rec => rec.record?.status === '출석' || rec.record?.status === '보강').length, 0
              );
              const weekAbsent = weekRecords.reduce((acc, r) =>
                acc + r.records.filter(rec => rec.record?.status === '결석').length, 0
              );

              return (
                <tr key={student.id} className="hover:bg-gray-50/50">
                  <td className="border-r border-gray-100 px-4 py-2 sticky left-0 bg-white z-10">
                    <div className="text-sm font-medium text-gray-900">{student.name}</div>
                    <div className="text-xs text-gray-500">{student.level} | {(payments.find(p => p.studentId === student.id && !p.completed && p.remainingSessions > 0)?.classDuration || 60)}분</div>
                  </td>
                  <td className="border-r border-gray-100 px-3 py-2 text-center">
                    <Badge variant={summary.remaining <= 1 ? 'danger' : summary.remaining <= 2 ? 'warning' : 'success'}>
                      {summary.remaining}회
                    </Badge>
                  </td>
                  {weekDays.map(day => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const dayOfWeek = getDayOfWeekFromDate(dateStr);
                    const scheduledTimes = getScheduledTimes(student.id, dayOfWeek);
                    const isToday = isSameDay(day, new Date());

                    return (
                      <td key={dateStr} className={`border-r border-gray-100 px-2 py-2 text-center ${
                        scheduledTimes.length > 0 ? 'bg-indigo-50/30' : ''
                      } ${isToday ? 'bg-indigo-50/50' : ''}`}>
                        {scheduledTimes.length > 0 ? (
                          <div className={`flex flex-col ${scheduledTimes.length > 1 ? 'gap-1.5' : 'gap-0'}`}>
                            {scheduledTimes.map(entry => {
                              const record = getRecord(student.id, dateStr, entry.startTime);
                              return (
                                <div key={entry.startTime}>
                                  {/* Always show time for all students */}
                                  <div className="text-[9px] text-gray-400 mb-0.5">{entry.startTime}</div>
                                  <div className="flex gap-1 justify-center">
                                    {STATUS_OPTIONS.map(opt => (
                                      <button
                                        key={opt.value}
                                        onClick={() => handleStatusChange(student.id, dateStr, opt.value, entry.startTime)}
                                        className={`w-7 h-7 rounded-full text-[10px] font-medium transition-all ${
                                          record?.status === opt.value
                                            ? `${opt.color} text-white shadow-sm scale-110`
                                            : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                        }`}
                                        title={opt.label}
                                      >
                                        {opt.label[0]}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">-</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-center">
                    <div className="text-xs">
                      <span className="text-green-600 font-medium">{weekPresent}출</span>
                      {weekAbsent > 0 && <span className="text-red-600 font-medium ml-1">{weekAbsent}결</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredStudents.length === 0 && (
              <tr>
                <td colSpan={weekDays.length + 3} className="px-4 py-12 text-center text-sm text-gray-400">
                  원생 데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Attendance Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="text-sm font-medium text-gray-500 mb-2">
            {format(currentWeekStart, 'M/d', { locale: ko })}주 출석률
          </h4>
          {(() => {
            const weekDateStrs = weekDays.map(d => format(d, 'yyyy-MM-dd'));
            const weekAttendance = attendance.filter(r => weekDateStrs.includes(r.date));
            const present = weekAttendance.filter(r => r.status === '출석' || r.status === '보강').length;
            const total = weekAttendance.length;
            const rate = total > 0 ? Math.round((present / total) * 100) : 0;
            return (
              <div className="text-2xl font-bold text-gray-900">{rate}%</div>
            );
          })()}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="text-sm font-medium text-gray-500 mb-2">보강 필요</h4>
          <div className="text-2xl font-bold text-amber-600">
            {activeStudents.filter(s => {
              const absences = attendance.filter(r => r.studentId === s.id && r.status === '결석');
              const makeups = attendance.filter(r => r.studentId === s.id && r.status === '보강');
              return absences.length > makeups.length;
            }).length}명
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="text-sm font-medium text-gray-500 mb-2">수업 잔여 1회 이하</h4>
          <div className="text-2xl font-bold text-red-600">
            {activeStudents.filter(s => {
              const payment = payments.find(p => p.studentId === s.id && !p.completed);
              return !payment || payment.remainingSessions <= 1;
            }).length}명
          </div>
        </div>
      </div>
    </div>
  );
}
