import { useState } from 'react';
import type { DayOfWeek, ClassDuration, StudentGrade } from '../../types';
import { TRIAL_PRICING } from '../../types';
import { DAYS_OF_WEEK } from '../../utils/helpers';
import { formatCurrency } from '../../utils/helpers';

const STUDENT_GRADES: StudentGrade[] = ['6세', '7세', '초등1', '초등2', '초등3', '초등4', '초등5', '초등6'];

interface TrialFormProps {
  onSubmit: (data: {
    name: string;
    grade: StudentGrade;
    parentPhone: string;
    memo: string;
    dayOfWeek: DayOfWeek;
    startTime: string;
    duration: ClassDuration;
  }) => void;
  onCancel: () => void;
}

export default function TrialForm({ onSubmit, onCancel }: TrialFormProps) {
  const [name, setName] = useState('');
  const [grade, setGrade] = useState<StudentGrade>('6세');
  const [parentPhone, setParentPhone] = useState('');
  const [memo, setMemo] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>('화');
  const [startTime, setStartTime] = useState('14:00');
  const [duration, setDuration] = useState<ClassDuration>(60);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), grade, parentPhone, memo, dayOfWeek, startTime, duration });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">이름 *</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          placeholder="체험 학생 이름"
          required
        />
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
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">학부모 연락처</label>
        <input
          type="tel"
          value={parentPhone}
          onChange={e => setParentPhone(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          placeholder="010-0000-0000"
        />
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
                duration === d
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {d}분
            </button>
          ))}
        </div>
      </div>

      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-700">
        체험 수업료: <span className="font-bold">{formatCurrency(TRIAL_PRICING[duration])}</span> ({duration}분 기준)
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
        <textarea
          value={memo}
          onChange={e => setMemo(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          rows={2}
          placeholder="특이사항 메모"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" className="flex-1 bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-700">
          체험 수업 추가
        </button>
        <button type="button" onClick={onCancel} className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-200">
          취소
        </button>
      </div>
    </form>
  );
}
