import { useState } from 'react';
import type { Student, ClassDuration, ClassLevel, StudentGrade, Gender, DayOfWeek, RegularScheduleEntry } from '../../types';
import { DAYS_OF_WEEK } from '../../utils/helpers';

interface StudentFormProps {
  student?: Student;
  onSubmit: (data: Omit<Student, 'id' | 'createdAt' | 'active'>) => void;
  onCancel: () => void;
}

const STUDENT_GRADES: StudentGrade[] = ['6세', '7세', '초등1', '초등2', '초등3', '초등4', '초등5', '초등6'];
const CLASS_LEVELS: ClassLevel[] = ['유아반', '초등(저학년)', '초등(고학년)'];
const CLASS_DURATIONS: ClassDuration[] = [60, 80, 100];

function getInitialSchedule(student?: Student): RegularScheduleEntry[] {
  if (student?.regularSchedule && student.regularSchedule.length > 0) {
    return student.regularSchedule;
  }
  return [{ day: '화' as DayOfWeek, startTime: '14:00' }];
}

export default function StudentForm({ student, onSubmit, onCancel }: StudentFormProps) {
  const [name, setName] = useState(student?.name || '');
  const [gender, setGender] = useState<Gender | undefined>(student?.gender);
  const [grade, setGrade] = useState<StudentGrade>(student?.grade || '6세');
  const [level, setLevel] = useState<ClassLevel>(student?.level || '유아반');
  const [classDuration, setClassDuration] = useState<ClassDuration>(student?.classDuration || 60);
  const [sessionsPerWeek, setSessionsPerWeek] = useState(student?.sessionsPerWeek || 1);
  const [regularSchedule, setRegularSchedule] = useState<RegularScheduleEntry[]>(
    getInitialSchedule(student)
  );
  const [phone, setPhone] = useState(student?.phone || '');
  const [parentPhone, setParentPhone] = useState(student?.parentPhone || '');
  const [memo, setMemo] = useState(student?.memo || '');

  const handleSessionsChange = (n: number) => {
    setSessionsPerWeek(n);
    setRegularSchedule(prev => {
      if (n > prev.length) {
        const added = Array.from({ length: n - prev.length }, () => ({ day: '화' as DayOfWeek, startTime: '14:00' }));
        return [...prev, ...added];
      }
      return prev.slice(0, n);
    });
  };

  const updateScheduleEntry = (index: number, field: 'day' | 'startTime', value: string) => {
    setRegularSchedule(prev =>
      prev.map((entry, i) => i === index ? { ...entry, [field]: value } : entry)
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      gender,
      grade,
      level,
      classDuration,
      sessionsPerWeek,
      regularSchedule,
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

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">성별</label>
        <div className="flex gap-2">
          {(['남', '여'] as Gender[]).map(g => (
            <button
              type="button"
              key={g}
              onClick={() => setGender(g)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium border ${
                gender === g
                  ? g === '남' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-pink-50 border-pink-300 text-pink-700'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">나이/학년</label>
        <div className="flex flex-wrap gap-2">
          {STUDENT_GRADES.map(g => (
            <button
              type="button"
              key={g}
              onClick={() => setGrade(g)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                grade === g
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
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
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              type="button"
              key={n}
              onClick={() => handleSessionsChange(n)}
              className={`px-3 py-2 rounded-lg text-sm font-medium border ${
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

      {/* 수업별 요일 + 시간 설정 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          정규 수업 스케줄
          <span className="text-xs text-gray-400 ml-1">({sessionsPerWeek}회 수업)</span>
        </label>
        <div className="space-y-2">
          {regularSchedule.map((entry, index) => (
            <div key={index} className="flex items-center gap-3">
              <span className="w-6 text-center text-xs font-medium text-gray-400">
                {index + 1}
              </span>
              <select
                value={entry.day}
                onChange={e => updateScheduleEntry(index, 'day', e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                {DAYS_OF_WEEK.map(d => <option key={d} value={d}>{d}요일</option>)}
              </select>
              <input
                type="time"
                value={entry.startTime}
                onChange={e => updateScheduleEntry(index, 'startTime', e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          ))}
        </div>
      </div>

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
