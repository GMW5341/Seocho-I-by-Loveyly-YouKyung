import { useState, useMemo } from 'react';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval } from 'date-fns';
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
  const { students, attendance, addAttendance, updateAttendance, deleteAttendance, payments } = useAppStore();
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [selectedStudent, setSelectedStudent] = useState<string>('all');

  const activeStudents = useMemo(() => students.filter(s => s.active), [students]);

  const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: currentWeekStart, end: weekEnd })
    .filter(d => d.getDay() >= 2 && d.getDay() <= 6); // 화~토

  const goToPrevWeek = () => setCurrentWeekStart(prev => subWeeks(prev, 1));
  const goToNextWeek = () => setCurrentWeekStart(prev => addWeeks(prev, 1));
  const goToThisWeek = () => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  // Get attendance record for a student on a specific date
  const getRecord = (studentId: string, date: string) => {
    return attendance.find(r => r.studentId === studentId && r.date === date);
  };

  // Check if student is scheduled for a given day of week
  const isScheduledDay = (studentId: string, dayOfWeek: DayOfWeek | null) => {
    if (!dayOfWeek) return false;
    const student = activeStudents.find(s => s.id === studentId);
    return student?.regularDays.includes(dayOfWeek) || false;
  };

  // Toggle attendance status
  const handleStatusChange = (studentId: string, date: string, status: AttendanceStatus) => {
    const existing = getRecord(studentId, date);
    const student = activeStudents.find(s => s.id === studentId);
    if (!student) return;

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
        startTime: student.regularStartTime,
        duration: student.classDuration,
        isMakeup: status === '보강',
        memo: '',
      });
    }
  };

  // Student attendance summary
  const getStudentSummary = (studentId: string) => {
    const activePayment = payments.find(p => p.studentId === studentId && !p.completed);
    const totalPresent = attendance.filter(r => r.studentId === studentId && (r.status === '출석' || r.status === '보강')).length;
    const totalAbsent = attendance.filter(r => r.studentId === studentId && r.status === '결석').length;

    return {
      activePayment,
      totalPresent,
      totalAbsent,
      remaining: activePayment ? activePayment.remainingSessions : 0,
    };
  };

  const filteredStudents = selectedStudent === 'all'
    ? activeStudents
    : activeStudents.filter(s => s.id === selectedStudent);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-gray-800">출결 관리</h3>
      </div>

      {/* Week Navigation */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={goToPrevWeek} className="px-3 py-1 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">&lsaquo; 이전주</button>
        <button onClick={goToThisWeek} className="px-3 py-1 bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-sm font-medium">이번주</button>
        <button onClick={goToNextWeek} className="px-3 py-1 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">다음주 &rsaquo;</button>
        <span className="text-sm font-medium text-gray-700 ml-2">
          {format(currentWeekStart, 'yyyy년 MM월 dd일', { locale: ko })} ~ {format(weekEnd, 'MM월 dd일', { locale: ko })}
        </span>
      </div>

      {/* Student filter */}
      <div className="mb-4">
        <select
          value={selectedStudent}
          onChange={e => setSelectedStudent(e.target.value)}
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
                <th key={day.toISOString()} className="border-b border-r border-gray-200 px-3 py-3 text-xs font-medium text-gray-500 text-center min-w-[100px]">
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
                return { date: dateStr, record: getRecord(student.id, dateStr), dayOfWeek: getDayOfWeekFromDate(dateStr) };
              });
              const weekPresent = weekRecords.filter(r => r.record?.status === '출석' || r.record?.status === '보강').length;
              const weekAbsent = weekRecords.filter(r => r.record?.status === '결석').length;

              return (
                <tr key={student.id} className="hover:bg-gray-50/50">
                  <td className="border-r border-gray-100 px-4 py-2 sticky left-0 bg-white z-10">
                    <div className="text-sm font-medium text-gray-900">{student.name}</div>
                    <div className="text-xs text-gray-500">{student.level} | {student.classDuration}분</div>
                  </td>
                  <td className="border-r border-gray-100 px-3 py-2 text-center">
                    <Badge variant={summary.remaining <= 1 ? 'danger' : summary.remaining <= 2 ? 'warning' : 'success'}>
                      {summary.remaining}회
                    </Badge>
                  </td>
                  {weekDays.map(day => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const dayOfWeek = getDayOfWeekFromDate(dateStr);
                    const isScheduled = isScheduledDay(student.id, dayOfWeek);
                    const record = getRecord(student.id, dateStr);

                    return (
                      <td key={dateStr} className={`border-r border-gray-100 px-2 py-2 text-center ${
                        isScheduled ? 'bg-indigo-50/30' : ''
                      }`}>
                        {(isScheduled || record) ? (
                          <div className="flex gap-1 justify-center">
                            {STATUS_OPTIONS.map(opt => (
                              <button
                                key={opt.value}
                                onClick={() => handleStatusChange(student.id, dateStr, opt.value)}
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
          <h4 className="text-sm font-medium text-gray-500 mb-2">이번주 출석률</h4>
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
