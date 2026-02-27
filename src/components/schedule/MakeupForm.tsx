import { useState } from 'react';
import type { Student, DayOfWeek, ClassDuration } from '../../types';
import { DAYS_OF_WEEK } from '../../utils/helpers';

interface MakeupFormProps {
  students: Student[];
  onSubmit: (data: { studentId: string; dayOfWeek: DayOfWeek; startTime: string; duration: number; autoAttend: boolean }) => void;
  onCancel: () => void;
}

export default function MakeupForm({ students, onSubmit, onCancel }: MakeupFormProps) {
  const [studentId, setStudentId] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>('화');
  const [startTime, setStartTime] = useState('14:00');
  const [duration, setDuration] = useState<ClassDuration>(60);
  const [autoAttend, setAutoAttend] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const selectedStudent = students.find(s => s.id === studentId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId) return;
    onSubmit({ studentId, dayOfWeek, startTime, duration, autoAttend });
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
          onChange={e => {
            setStudentId(e.target.value);
          }}
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

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">요일</label>
          <select
            value={dayOfWeek}
            onChange={e => setDayOfWeek(e.target.value as DayOfWeek)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            {DAYS_OF_WEEK.map(d => <option key={d} value={d}>{d}요일</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">시작 시간</label>
          <input
            type="time"
            value={startTime}
            onChange={e => setStartTime(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
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

      {selectedStudent && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
          {selectedStudent.name} ({selectedStudent.level})
        </div>
      )}

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={autoAttend}
          onChange={e => setAutoAttend(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
        <span className="text-sm text-gray-700">추가 시 자동으로 보강 출석 처리</span>
      </label>

      <div className="flex gap-3 pt-2">
        <button type="submit" className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
          보강 추가
        </button>
        <button type="button" onClick={onCancel} className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-200">
          취소
        </button>
      </div>
    </form>
  );
}
