import { useState, useMemo } from 'react';
import { useAppStore } from '../../store/StoreContext';
import type { Student, ClassLevel, StudentGrade } from '../../types';
import { getClassLevelColor } from '../../utils/helpers';

const GRADE_ORDER: Record<StudentGrade, number> = {
  '6세': 0, '7세': 1, '초등1': 2, '초등2': 3, '초등3': 4, '초등4': 5, '초등5': 6, '초등6': 7,
};
import Modal from '../common/Modal';
import StudentForm from './StudentForm';
import Badge from '../common/Badge';

export default function StudentList() {
  const { students, schedules, addStudent, updateStudent, deleteStudent, permanentDeleteStudent, payments, addSchedule, removeSchedule } = useAppStore();
  const [showForm, setShowForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | undefined>();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLevel, setFilterLevel] = useState<ClassLevel | '전체'>('전체');
  const [showInactive, setShowInactive] = useState(false);

  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      if (!showInactive && !s.active) return false;
      if (filterLevel !== '전체' && s.level !== filterLevel) return false;
      if (searchQuery && !s.name.includes(searchQuery)) return false;
      return true;
    }).sort((a, b) => {
      const gradeA = GRADE_ORDER[a.grade] ?? 99;
      const gradeB = GRADE_ORDER[b.grade] ?? 99;
      if (gradeA !== gradeB) return gradeA - gradeB;
      return a.name.localeCompare(b.name, 'ko');
    });
  }, [students, showInactive, filterLevel, searchQuery]);

  const handleAdd = (data: Omit<Student, 'id' | 'createdAt' | 'active'>) => {
    const newStudent = addStudent(data);
    // Auto-create schedule slots for regular schedule
    (data.regularSchedule || []).forEach(entry => {
      addSchedule({
        studentId: newStudent.id,
        dayOfWeek: entry.day,
        startTime: entry.startTime,
        duration: data.classDuration,
        isRegular: true,
      });
    });
    setShowForm(false);
  };

  const handleEdit = (data: Omit<Student, 'id' | 'createdAt' | 'active'>) => {
    if (editingStudent) {
      updateStudent(editingStudent.id, data);
      // Sync schedules: remove old regular schedules and create new ones
      const oldRegularSlots = schedules.filter(s => s.studentId === editingStudent.id && s.isRegular);
      oldRegularSlots.forEach(slot => removeSchedule(slot.id));
      (data.regularSchedule || []).forEach(entry => {
        addSchedule({
          studentId: editingStudent.id,
          dayOfWeek: entry.day,
          startTime: entry.startTime,
          duration: data.classDuration,
          isRegular: true,
        });
      });
      setEditingStudent(undefined);
    }
  };

  const getStudentPaymentStatus = (studentId: string) => {
    const activePayment = payments.find(p => p.studentId === studentId && !p.completed && p.remainingSessions > 0);
    if (!activePayment) return { label: '미결제', variant: 'danger' as const };
    if (activePayment.remainingSessions <= 1) return { label: `잔여 ${activePayment.remainingSessions}회`, variant: 'warning' as const };
    return { label: `잔여 ${activePayment.remainingSessions}회`, variant: 'success' as const };
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-gray-800">원생 목록</h3>
          <p className="text-sm text-gray-500">총 {filteredStudents.length}명</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          + 원생 등록
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="이름 검색..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 max-w-xs focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        <select
          value={filterLevel}
          onChange={e => setFilterLevel(e.target.value as ClassLevel | '전체')}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        >
          <option value="전체">전체 반</option>
          <option value="유아반">유아반</option>
          <option value="초등(저학년)">초등(저학년)</option>
          <option value="초등(고학년)">초등(고학년)</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="rounded" />
          퇴원생 포함
        </label>
      </div>

      {/* Student Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">이름</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">성별</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">나이/학년</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">반</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">수업시간</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">수업 스케줄</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">결제상태</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredStudents.map(student => {
              const paymentStatus = getStudentPaymentStatus(student.id);
              return (
                <tr key={student.id} className={`hover:bg-gray-50 ${!student.active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{student.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {student.gender ? (
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${
                        student.gender === '남' ? 'bg-blue-50 text-blue-700' : 'bg-pink-50 text-pink-700'
                      }`}>{student.gender}</span>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{student.grade || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${getClassLevelColor(student.level)}`}>
                      {student.level}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{student.classDuration}분</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {(student.regularSchedule || []).map((entry, i) => (
                      <span key={i}>
                        {entry.day} {entry.startTime}
                        {i < (student.regularSchedule || []).length - 1 ? ' / ' : ''}
                      </span>
                    ))}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={paymentStatus.variant}>{paymentStatus.label}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingStudent(student)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        수정
                      </button>
                      {student.active && (
                        <button
                          onClick={() => { if (confirm('정말 퇴원 처리하시겠습니까?')) deleteStudent(student.id); }}
                          className="text-xs text-red-600 hover:text-red-800 font-medium"
                        >
                          퇴원
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (confirm(`${student.name} 원생의 모든 기록(스케줄, 출결, 결제)을 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
                            permanentDeleteStudent(student.id);
                          }
                        }}
                        className="text-xs text-gray-400 hover:text-red-600 font-medium"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredStudents.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">
                  등록된 원생이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Modal */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="원생 등록" preventBackdropClose>
        <StudentForm onSubmit={handleAdd} onCancel={() => setShowForm(false)} />
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={!!editingStudent} onClose={() => setEditingStudent(undefined)} title="원생 정보 수정" preventBackdropClose>
        {editingStudent && (
          <StudentForm student={editingStudent} onSubmit={handleEdit} onCancel={() => setEditingStudent(undefined)} />
        )}
      </Modal>
    </div>
  );
}
