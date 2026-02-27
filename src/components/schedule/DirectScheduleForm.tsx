import { useState } from 'react';
import type { Student, DayOfWeek, ClassDuration, RegularScheduleEntry } from '../../types';

const DAYS: DayOfWeek[] = ['월', '화', '수', '목', '금', '토'];

interface DirectScheduleFormProps {
  students: Student[];
  onSubmit: (data: {
    studentId: string;
    dayOfWeek: DayOfWeek;
    startTime: string;
    duration: ClassDuration;
    sessionsPerWeek: number;
    entries: { day: DayOfWeek; startTime: string }[];
  }) => void;
  onCancel: () => void;
}

export default function DirectScheduleForm({ students, onSubmit, onCancel }: DirectScheduleFormProps) {
  const [studentId, setStudentId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [duration, setDuration] = useState<ClassDuration>(60);
  const [sessionsPerWeek, setSessionsPerWeek] = useState(0);
  const [entries, setEntries] = useState<RegularScheduleEntry[]>([]);

  const handleSessionsChange = (n: number) => {
    setSessionsPerWeek(n);
    if (n > entries.length) {
      const newEntries = [...entries];
      const usedDays = newEntries.map(e => e.day);
      const available = DAYS.filter(d => !usedDays.includes(d));
      for (let i = entries.length; i < n; i++) {
        newEntries.push({ day: available[i - entries.length] || '월', startTime: '14:00' });
      }
      setEntries(newEntries);
    } else {
      setEntries(entries.slice(0, n));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || entries.length === 0) return;
    onSubmit({
      studentId,
      dayOfWeek: entries[0].day,
      startTime: entries[0].startTime,
      duration,
      sessionsPerWeek,
      entries,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">원생 선택</label>
        <input
          type="text"
          placeholder="이름 검색..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-1"
        />
        <select
          value={studentId}
          onChange={e => setStudentId(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          required
          size={searchQuery ? Math.min(6, students.filter(s => s.name.includes(searchQuery)).length + 1) : 1}
        >
          <option value="">원생을 선택하세요</option>
          {students
            .filter(s => !searchQuery || s.name.includes(searchQuery))
            .map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.level})</option>
            ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">수업 시간</label>
        <div className="flex gap-3">
          {([60, 80, 100] as ClassDuration[]).map(d => (
            <button
              type="button"
              key={d}
              onClick={() => setDuration(d)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                duration === d ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {d}분
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">주당 수업 횟수</label>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              type="button"
              key={n}
              onClick={() => handleSessionsChange(n)}
              className={`flex-1 px-2 py-1.5 rounded-lg text-sm font-medium border ${
                sessionsPerWeek === n
                  ? 'bg-blue-500 border-blue-500 text-white'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              주{n}회
            </button>
          ))}
        </div>
      </div>

      {sessionsPerWeek > 0 && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">요일 및 시간</label>
          {entries.map((entry, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-6">{i + 1}.</span>
              <div className="flex gap-1">
                {DAYS.map(d => (
                  <button
                    type="button"
                    key={d}
                    onClick={() => {
                      const updated = [...entries];
                      updated[i] = { ...updated[i], day: d };
                      setEntries(updated);
                    }}
                    className={`w-8 h-8 rounded-full text-xs font-medium border ${
                      entry.day === d
                        ? 'bg-blue-500 border-blue-500 text-white'
                        : 'border-gray-300 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <input
                type="time"
                value={entry.startTime}
                onChange={e => {
                  const updated = [...entries];
                  updated[i] = { ...updated[i], startTime: e.target.value };
                  setEntries(updated);
                }}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm flex-1"
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={!studentId || entries.length === 0}
          className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          스케줄 등록
        </button>
        <button type="button" onClick={onCancel} className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-200">
          취소
        </button>
      </div>
    </form>
  );
}
