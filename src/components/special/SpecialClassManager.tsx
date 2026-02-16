import { useState, useMemo } from 'react';
import { useAppStore } from '../../store/StoreContext';
import type { SpecialClass, SpecialClassStudent, StudentGrade, DayOfWeek, PaymentMethod } from '../../types';
import { formatCurrency } from '../../utils/helpers';
import Modal from '../common/Modal';
import Badge from '../common/Badge';

const DAYS: DayOfWeek[] = ['월', '화', '수', '목', '금', '토'];
const GRADES: StudentGrade[] = ['6세', '7세', '초등1', '초등2', '초등3', '초등4', '초등5', '초등6'];
const PAYMENT_METHODS: PaymentMethod[] = ['계좌이체', '현금', '카드', '온누리상품권', '기타'];

export default function SpecialClassManager() {
  const {
    specialClasses, addSpecialClass, updateSpecialClass, deleteSpecialClass,
    specialClassStudents, addSpecialClassStudent, updateSpecialClassStudent, deleteSpecialClassStudent,
    settings,
  } = useAppStore();

  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [showClassForm, setShowClassForm] = useState(false);
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [editingClass, setEditingClass] = useState<SpecialClass | null>(null);
  const [editingStudent, setEditingStudent] = useState<SpecialClassStudent | null>(null);

  // Class form state
  const [className, setClassName] = useState('');
  const [classStartDate, setClassStartDate] = useState('');
  const [classEndDate, setClassEndDate] = useState('');
  const [classDuration, setClassDuration] = useState(80);
  const [classMaxStudents, setClassMaxStudents] = useState(10);
  const [classFee, setClassFee] = useState(0);
  const [classMemo, setClassMemo] = useState('');
  const [classSchedule, setClassSchedule] = useState<{ day: DayOfWeek; startTime: string }[]>([]);

  // Payment popup state
  const [payingStudentId, setPayingStudentId] = useState<string | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('계좌이체');

  // Student form state
  const [studentName, setStudentName] = useState('');
  const [studentGrade, setStudentGrade] = useState<StudentGrade>('초등1');
  const [studentPhone, setStudentPhone] = useState('');
  const [studentParentPhone, setStudentParentPhone] = useState('');
  const [studentMemo, setStudentMemo] = useState('');

  const isVacation = settings.currentSeason === '방학중';

  const selectedClass = selectedClassId ? specialClasses.find(c => c.id === selectedClassId) : null;
  const classStudents = useMemo(() => {
    if (!selectedClassId) return [];
    return specialClassStudents.filter(s => s.specialClassId === selectedClassId);
  }, [specialClassStudents, selectedClassId]);

  const resetClassForm = () => {
    setClassName('');
    setClassStartDate('');
    setClassEndDate('');
    setClassDuration(80);
    setClassMaxStudents(10);
    setClassFee(0);
    setClassMemo('');
    setClassSchedule([]);
    setEditingClass(null);
  };

  const resetStudentForm = () => {
    setStudentName('');
    setStudentGrade('초등1');
    setStudentPhone('');
    setStudentParentPhone('');
    setStudentMemo('');
    setEditingStudent(null);
  };

  const openClassForm = (cls?: SpecialClass) => {
    if (cls) {
      setEditingClass(cls);
      setClassName(cls.name);
      setClassStartDate(cls.startDate);
      setClassEndDate(cls.endDate);
      setClassDuration(cls.duration);
      setClassMaxStudents(cls.maxStudents);
      setClassFee(cls.fee);
      setClassMemo(cls.memo);
      setClassSchedule([...cls.schedule]);
    } else {
      resetClassForm();
    }
    setShowClassForm(true);
  };

  const openStudentForm = (student?: SpecialClassStudent) => {
    if (student) {
      setEditingStudent(student);
      setStudentName(student.name);
      setStudentGrade(student.grade);
      setStudentPhone(student.phone);
      setStudentParentPhone(student.parentPhone);
      setStudentMemo(student.memo);
    } else {
      resetStudentForm();
    }
    setShowStudentForm(true);
  };

  const handleClassSubmit = () => {
    if (!className.trim()) return;
    const data = {
      name: className,
      startDate: classStartDate,
      endDate: classEndDate,
      schedule: classSchedule,
      duration: classDuration,
      maxStudents: classMaxStudents,
      fee: classFee,
      memo: classMemo,
    };
    if (editingClass) {
      updateSpecialClass(editingClass.id, data);
    } else {
      const newClass = addSpecialClass(data);
      setSelectedClassId(newClass.id);
    }
    setShowClassForm(false);
    resetClassForm();
  };

  const handleStudentSubmit = () => {
    if (!studentName.trim() || !selectedClassId) return;
    const data = {
      specialClassId: selectedClassId,
      name: studentName,
      grade: studentGrade,
      phone: studentPhone,
      parentPhone: studentParentPhone,
      paid: false,
      amount: selectedClass?.fee || 0,
      memo: studentMemo,
    };
    if (editingStudent) {
      updateSpecialClassStudent(editingStudent.id, data);
    } else {
      addSpecialClassStudent(data);
    }
    setShowStudentForm(false);
    resetStudentForm();
  };

  const addScheduleEntry = () => {
    setClassSchedule(prev => [...prev, { day: '월', startTime: '10:00' }]);
  };

  const removeScheduleEntry = (index: number) => {
    setClassSchedule(prev => prev.filter((_, i) => i !== index));
  };

  const updateScheduleEntry = (index: number, field: 'day' | 'startTime', value: string) => {
    setClassSchedule(prev => prev.map((entry, i) =>
      i === index ? { ...entry, [field]: value } : entry
    ));
  };

  const handleSpecialPayment = (studentId: string) => {
    updateSpecialClassStudent(studentId, {
      paid: true,
      paidAt: new Date().toISOString(),
      paymentMethod: selectedPaymentMethod,
    });
    setPayingStudentId(null);
  };

  const handleCancelPayment = (studentId: string) => {
    if (confirm('결제를 취소하시겠습니까?')) {
      updateSpecialClassStudent(studentId, {
        paid: false,
        paidAt: undefined,
        paymentMethod: undefined,
      });
    }
  };

  const paidCount = classStudents.filter(s => s.paid).length;
  const totalRevenue = classStudents.filter(s => s.paid).reduce((sum, s) => sum + s.amount, 0);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-gray-800">특강 수업</h3>
          <p className="text-sm text-gray-500">
            {isVacation ? '방학 중 - 특강 개설 가능' : '학기 중 - 개설된 특강만 관리 가능'}
          </p>
        </div>
        {isVacation && (
          <button
            onClick={() => openClassForm()}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            + 특강 개설
          </button>
        )}
      </div>

      {/* Class List */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {specialClasses.map(cls => {
          const count = specialClassStudents.filter(s => s.specialClassId === cls.id).length;
          return (
            <button
              key={cls.id}
              onClick={() => setSelectedClassId(cls.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                selectedClassId === cls.id
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : cls.active
                  ? 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400 hover:text-indigo-600'
                  : 'bg-gray-100 text-gray-400 border-gray-200'
              }`}
            >
              {cls.name}
              <span className="ml-1.5 text-xs opacity-75">({count}/{cls.maxStudents})</span>
            </button>
          );
        })}
        {specialClasses.length === 0 && (
          <p className="text-sm text-gray-400 py-4">
            {isVacation ? '아직 개설된 특강이 없습니다. "특강 개설" 버튼을 눌러주세요.' : '개설된 특강이 없습니다. 방학 중에 특강을 개설할 수 있습니다.'}
          </p>
        )}
      </div>

      {/* Selected Class Details */}
      {selectedClass && (
        <div className="space-y-6">
          {/* Class Info Card */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h4 className="text-lg font-bold text-gray-800">{selectedClass.name}</h4>
                <p className="text-sm text-gray-500 mt-1">
                  {selectedClass.startDate} ~ {selectedClass.endDate} | {selectedClass.duration}분 수업
                </p>
                {selectedClass.schedule.length > 0 && (
                  <p className="text-sm text-gray-500 mt-0.5">
                    {selectedClass.schedule.map((s, i) => (
                      <span key={i}>{s.day} {s.startTime}{i < selectedClass.schedule.length - 1 ? ', ' : ''}</span>
                    ))}
                  </p>
                )}
                {selectedClass.memo && (
                  <p className="text-sm text-gray-500 mt-1">{selectedClass.memo}</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => openClassForm(selectedClass)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 rounded hover:bg-indigo-50"
                >
                  수정
                </button>
                <button
                  onClick={() => {
                    if (confirm(`"${selectedClass.name}" 특강을 삭제하시겠습니까?\n등록된 학생 데이터도 모두 삭제됩니다.`)) {
                      deleteSpecialClass(selectedClass.id);
                      setSelectedClassId(null);
                    }
                  }}
                  className="text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1 rounded hover:bg-red-50"
                >
                  삭제
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-indigo-50 rounded-lg p-3 text-center">
                <div className="text-xl font-bold text-indigo-700">{classStudents.length}</div>
                <div className="text-xs text-indigo-500">등록 인원</div>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <div className="text-xl font-bold text-green-700">{paidCount}</div>
                <div className="text-xs text-green-500">결제 완료</div>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-center">
                <div className="text-xl font-bold text-amber-700">{classStudents.length - paidCount}</div>
                <div className="text-xs text-amber-500">미결제</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-xl font-bold text-gray-700">{totalRevenue.toLocaleString()}</div>
                <div className="text-xs text-gray-500">수입 (원)</div>
              </div>
            </div>
          </div>

          {/* Student List */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h5 className="text-sm font-bold text-gray-800">수강생 목록 ({classStudents.length}명)</h5>
              <button
                onClick={() => openStudentForm()}
                className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-indigo-700"
              >
                + 수강생 등록
              </button>
            </div>
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">이름</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">학년</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">학부모 연락처</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">결제</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">금액</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">메모</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {classStudents.map(student => (
                  <tr key={student.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{student.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{student.grade}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{student.parentPhone || '-'}</td>
                    <td className="px-4 py-3">
                      {student.paid ? (
                        <button
                          onClick={() => handleCancelPayment(student.id)}
                          className="cursor-pointer"
                          title="클릭하여 결제 취소"
                        >
                          <Badge variant="success">
                            결제완료 ({student.paymentMethod || '-'})
                          </Badge>
                        </button>
                      ) : (
                        <button
                          onClick={() => setPayingStudentId(student.id)}
                          className="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full font-medium hover:bg-red-100"
                        >
                          미결제 - 결제하기
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatCurrency(student.amount)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-[150px] truncate" title={student.memo}>{student.memo || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openStudentForm(student)}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`${student.name} 수강생을 삭제하시겠습니까?`)) deleteSpecialClassStudent(student.id);
                          }}
                          className="text-xs text-red-600 hover:text-red-800 font-medium"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {classStudents.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                      등록된 수강생이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Class Form Modal */}
      <Modal isOpen={showClassForm} onClose={() => { setShowClassForm(false); resetClassForm(); }} title={editingClass ? '특강 수정' : '특강 개설'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">수업 이름 *</label>
            <input
              type="text"
              value={className}
              onChange={e => setClassName(e.target.value)}
              placeholder="예: 여름방학 수채화 특강"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">시작일</label>
              <input
                type="date"
                value={classStartDate}
                onChange={e => setClassStartDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">종료일</label>
              <input
                type="date"
                value={classEndDate}
                onChange={e => setClassEndDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">수업 시간 (분)</label>
              <input
                type="number"
                value={classDuration}
                onChange={e => setClassDuration(Number(e.target.value))}
                min={10}
                step={10}
                placeholder="예: 90"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">최대 인원</label>
              <input
                type="number"
                value={classMaxStudents}
                onChange={e => setClassMaxStudents(Number(e.target.value))}
                min={1}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">수강료 (원)</label>
              <input
                type="number"
                value={classFee}
                onChange={e => setClassFee(Number(e.target.value))}
                min={0}
                step={1000}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Schedule entries */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">수업 스케줄</label>
              <button onClick={addScheduleEntry} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">+ 추가</button>
            </div>
            {classSchedule.map((entry, i) => (
              <div key={i} className="flex gap-2 mb-2 items-center">
                <select
                  value={entry.day}
                  onChange={e => updateScheduleEntry(i, 'day', e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                >
                  {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <input
                  type="time"
                  value={entry.startTime}
                  onChange={e => updateScheduleEntry(i, 'startTime', e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                />
                <button onClick={() => removeScheduleEntry(i)} className="text-red-500 hover:text-red-700 text-sm">&times;</button>
              </div>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
            <textarea
              value={classMemo}
              onChange={e => setClassMemo(e.target.value)}
              placeholder="추가 메모..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none h-16"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleClassSubmit}
              disabled={!className.trim()}
              className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editingClass ? '수정' : '개설'}
            </button>
            <button
              onClick={() => { setShowClassForm(false); resetClassForm(); }}
              className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-200"
            >
              취소
            </button>
          </div>
        </div>
      </Modal>

      {/* Payment Modal */}
      <Modal isOpen={!!payingStudentId} onClose={() => setPayingStudentId(null)} title="특강 수업 결제">
        <div className="space-y-4">
          {payingStudentId && (() => {
            const student = specialClassStudents.find(s => s.id === payingStudentId);
            const cls = student ? specialClasses.find(c => c.id === student.specialClassId) : null;
            if (!student) return null;
            return (
              <>
                <div className="bg-gray-50 rounded-lg p-3 text-sm">
                  <div className="font-medium text-gray-900">{student.name} ({student.grade})</div>
                  {cls && <div className="text-gray-600">{cls.name}</div>}
                  <div className="text-lg font-bold text-gray-900 mt-1">{formatCurrency(student.amount)}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">결제 방식</label>
                  <div className="flex flex-wrap gap-2">
                    {PAYMENT_METHODS.map(m => (
                      <button
                        key={m}
                        onClick={() => setSelectedPaymentMethod(m)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                          selectedPaymentMethod === m
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                            : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => handleSpecialPayment(payingStudentId)}
                    className="flex-1 bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-700"
                  >
                    결제 완료
                  </button>
                  <button
                    onClick={() => setPayingStudentId(null)}
                    className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-200"
                  >
                    취소
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      </Modal>

      {/* Student Form Modal */}
      <Modal isOpen={showStudentForm} onClose={() => { setShowStudentForm(false); resetStudentForm(); }} title={editingStudent ? '수강생 수정' : '수강생 등록'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이름 *</label>
            <input
              type="text"
              value={studentName}
              onChange={e => setStudentName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">학년</label>
            <select
              value={studentGrade}
              onChange={e => setStudentGrade(e.target.value as StudentGrade)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">원생 연락처</label>
              <input
                type="tel"
                value={studentPhone}
                onChange={e => setStudentPhone(e.target.value)}
                placeholder="010-0000-0000"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">학부모 연락처</label>
              <input
                type="tel"
                value={studentParentPhone}
                onChange={e => setStudentParentPhone(e.target.value)}
                placeholder="010-0000-0000"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
            <textarea
              value={studentMemo}
              onChange={e => setStudentMemo(e.target.value)}
              placeholder="추가 메모..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none h-16"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleStudentSubmit}
              disabled={!studentName.trim()}
              className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editingStudent ? '수정' : '등록'}
            </button>
            <button
              onClick={() => { setShowStudentForm(false); resetStudentForm(); }}
              className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-200"
            >
              취소
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
