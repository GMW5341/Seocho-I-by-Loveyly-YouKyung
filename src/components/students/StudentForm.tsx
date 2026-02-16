import { useState } from 'react';
import type { Student, ClassDuration, ClassLevel, DayOfWeek } from '../../types';
import { DAYS_OF_WEEK } from '../../utils/helpers';

interface StudentFormProps {
  student?: Student;
  onSubmit: (data: Omit<Student, 'id' | 'createdAt' | 'active'>) => void;
  onCancel: () => void;
}

const CLASS_LEVELS: ClassLevel[] = ['유아반', '초등(저학년)', '초등(고학년)'];
const CLASS_DURATIONS: ClassDuration[] = [60, 80, 100];

export default function StudentForm({ student, onSubmit, onCancel }: StudentFormProps) {
  const [name, setName] = useState(student?.name || '');
  const [level, setLevel] = useState<ClassLevel>(student?.level || '유아반');
  const [classDuration, setClassDuration] = useState<ClassDuration>(student?.classDuration || 60);
  const [sessionsPerWeek, setSessionsPerWeek] = useState(student?.sessionsPerWeek || 1);
  const [regularDays, setRegularDays] = useState<DayOfWeek[]>(student?.regularDays || []);
  const [regularStartTimes, setRegularStartTimes] = useState<{ [key in DayOfWeek]?: string }>(
    student?.regularStartTimes || {}
  );
  const [phone, setPhone] = useState(student?.phone || '');
  const [parentPhone, setParentPhone] = useState(student?.parentPhone || '');
  const [memo, setMemo] = useState(student?.memo || '');

  const toggleDay = (day: DayOfWeek) => {
    setRegularDays(prev => {
      if (prev.includes(day)) {
        // 요일 제거 시 해당 요일 시간도 제거
        setRegularStartTimes(times => {
          const updated = { ...times };
          delete updated[day];
          return updated;
        });
        return prev.filter(d => d !== day);
      } else {
        // 요일 추가 시 기본 시간 설정
        setRegularStartTimes(times => ({ ...times, [day]: '14:00' }));
        return [...prev, day];
      }
    });
  };

  const updateTimeForDay = (day: DayOfWeek, time: string) => {
    setRegularStartTimes(prev => ({ ...prev, [day]: time }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      level,
      classDuration,
      sessionsPerWeek,
      regularDays,
      regularStartTimes,
      phone,
      parentPhone,
      memo,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">이름 *</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          placeholder="원생 이름"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">반</label>
          <select
            value={level}
            onChange={e => setLevel(e.target.value as ClassLevel)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            {CLASS_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">수업 시간</label>
          <select
            value={classDuration}
            onChange={e => setClassDuration(Number(e.target.value) as ClassDuration)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            {CLASS_DURATIONS.map(d => <option key={d} value={d}>{d}분</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">주 수업 횟수</label>
        <div className="flex gap-3">
          {[1, 2].map(n => (
            <button
              type="button"
              key={n}
              onClick={() => setSessionsPerWeek(n)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                sessionsPerWeek === n
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              주 {n}회
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">정규 수업 요일</label>
        <div className="flex gap-2">
          {DAYS_OF_WEEK.map(day => (
            <button
              type="button"
              key={day}
              onClick={() => toggleDay(day)}
              className={`w-10 h-10 rounded-lg text-sm font-medium border ${
                regularDays.includes(day)
                  ? 'bg-indigo-500 border-indigo-500 text-white'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {day}
            </button>
          ))}
        </div>
      </div>

      {/* 요일별 수업 시작 시간 */}
      {regularDays.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            정규 수업 시작 시간
            {regularDays.length > 1 && (
              <span className="text-xs text-gray-400 ml-1">(요일별 개별 설정)</span>
            )}
          </label>
          <div className="space-y-2">
            {regularDays
              .sort((a, b) => DAYS_OF_WEEK.indexOf(a) - DAYS_OF_WEEK.indexOf(b))
              .map(day => (
              <div key={day} className="flex items-center gap-3">
                <span className="w-8 text-center text-sm font-medium text-indigo-600 bg-indigo-50 rounded py-1">
                  {day}
                </span>
                <input
                  type="time"
                  value={regularStartTimes[day] || '14:00'}
                  onChange={e => updateTimeForDay(day, e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">원생 연락처</label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="010-0000-0000"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">학부모 연락처</label>
          <input
            type="tel"
            value={parentPhone}
            onChange={e => setParentPhone(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="010-0000-0000"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
        <textarea
          value={memo}
          onChange={e => setMemo(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          rows={2}
          placeholder="특이사항 메모"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          {student ? '수정' : '등록'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
        >
          취소
        </button>
      </div>
    </form>
  );
}
