import { useState } from 'react';
import type { Student, ClassLevel, StudentGrade, Gender } from '../../types';

interface StudentFormProps {
  student?: Student;
  onSubmit: (data: Omit<Student, 'id' | 'createdAt' | 'active'>) => void;
  onCancel: () => void;
}

const STUDENT_GRADES: StudentGrade[] = ['6세', '7세', '초등1', '초등2', '초등3', '초등4', '초등5', '초등6'];
const CLASS_LEVELS: ClassLevel[] = ['60분', '80분', '100분'];

export default function StudentForm({ student, onSubmit, onCancel }: StudentFormProps) {
  const [name, setName] = useState(student?.name || '');
  const [gender, setGender] = useState<Gender | undefined>(student?.gender);
  const [grade, setGrade] = useState<StudentGrade>(student?.grade || '6세');
  const [level, setLevel] = useState<ClassLevel>(student?.level || '60분');
  const [phone, setPhone] = useState(student?.phone || '');
  const [parentPhone, setParentPhone] = useState(student?.parentPhone || '');
  const [memo, setMemo] = useState(student?.memo || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      gender,
      grade,
      level,
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
