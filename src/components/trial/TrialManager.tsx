import { useState, useMemo, useCallback } from 'react';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAppStore } from '../../store/StoreContext';
import type { PaymentMethod, ClassDuration, DayOfWeek, StudentGrade } from '../../types';
import { TRIAL_PRICING } from '../../types';
import { formatCurrency } from '../../utils/helpers';
import Badge from '../common/Badge';
import Modal from '../common/Modal';
import TrialForm from '../schedule/TrialForm';
import type { TrialFormData } from '../schedule/TrialForm';
import type { TrialStudent, TrialLesson } from '../../types';

const PAYMENT_METHODS: PaymentMethod[] = ['계좌이체', '현금', '카드', '온누리상품권', '기타'];

export default function TrialManager() {
  const { trialStudents, trialLessons, updateTrialStudent, updateTrialLesson, deleteTrialStudent, addTrialStudent, addTrialLesson, addSchedule, schedules, removeSchedule } = useAppStore();
  const [payingLessonId, setPayingLessonId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('계좌이체');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [showTrialForm, setShowTrialForm] = useState(false);
  const [editingTrial, setEditingTrial] = useState<{ student: TrialStudent; lesson: TrialLesson } | null>(null);

  const handleAddTrial = useCallback((data: {
    name: string;
    grade: StudentGrade;
    parentPhone: string;
    memo: string;
    date: string;
    dayOfWeek: DayOfWeek;
    startTime: string;
    duration: ClassDuration;
  }) => {
    const trialStudent = addTrialStudent({
      name: data.name,
      grade: data.grade,
      parentPhone: data.parentPhone,
      memo: data.memo,
    });
    addTrialLesson({
      trialStudentId: trialStudent.id,
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      duration: data.duration,
      date: data.date,
      paid: false,
      amount: TRIAL_PRICING[data.duration],
    });
    addSchedule({
      studentId: '',
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      duration: data.duration,
      isRegular: false,
      isTrial: true,
      trialStudentId: trialStudent.id,
      date: data.date,
    });
    setShowTrialForm(false);
  }, [addTrialStudent, addTrialLesson, addSchedule]);

  const handleEditTrial = useCallback((data: TrialFormData) => {
    if (!editingTrial) return;
    const { student, lesson } = editingTrial;
    // Update student info
    updateTrialStudent(student.id, {
      name: data.name,
      grade: data.grade,
      parentPhone: data.parentPhone,
      memo: data.memo,
    });
    // Update lesson info
    updateTrialLesson(lesson.id, {
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      duration: data.duration,
      date: data.date,
      amount: TRIAL_PRICING[data.duration],
    });
    // Update matching schedule slot
    const trialSlot = schedules.find(s => s.isTrial && s.trialStudentId === student.id);
    if (trialSlot) {
      removeSchedule(trialSlot.id);
      addSchedule({
        studentId: '',
        dayOfWeek: data.dayOfWeek,
        startTime: data.startTime,
        duration: data.duration,
        isRegular: false,
        isTrial: true,
        trialStudentId: student.id,
        date: data.date,
      });
    }
    setEditingTrial(null);
  }, [editingTrial, updateTrialStudent, updateTrialLesson, schedules, removeSchedule, addSchedule]);

  const trialData = useMemo(() => {
    return trialStudents.map(student => {
      const lessons = trialLessons.filter(l => l.trialStudentId === student.id);
      return { student, lessons };
    }).sort((a, b) => b.student.createdAt.localeCompare(a.student.createdAt));
  }, [trialStudents, trialLessons]);

  const stats = useMemo(() => {
    const total = trialLessons.length;
    const paid = trialLessons.filter(l => l.paid).length;
    const unpaid = total - paid;
    const revenue = trialLessons.filter(l => l.paid).reduce((sum, l) => sum + l.amount, 0);
    return { total, paid, unpaid, revenue };
  }, [trialLessons]);

  const monthlyTrialRevenue = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const monthStart = startOfMonth(new Date(year, month - 1));
    const monthEnd = endOfMonth(monthStart);
    const paidThisMonth = trialLessons.filter(l => {
      if (!l.paid || !l.paidAt) return false;
      const date = parseISO(l.paidAt);
      return isWithinInterval(date, { start: monthStart, end: monthEnd });
    });
    return paidThisMonth.reduce((sum, l) => sum + l.amount, 0);
  }, [trialLessons, selectedMonth]);

  const handlePayment = (lessonId: string) => {
    updateTrialLesson(lessonId, {
      paid: true,
      paidAt: new Date().toISOString(),
      paymentMethod,
    });
    setPayingLessonId(null);
  };

  return (
    <div className="p-3 md:p-6">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div>
          <h3 className="text-lg font-bold text-gray-800">체험 수업 관리</h3>
          <p className="text-sm text-gray-500">체험 수업 신청 학생 목록 및 결제 관리</p>
        </div>
        <button
          onClick={() => setShowTrialForm(true)}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors whitespace-nowrap"
        >
          + 체험 수업 등록
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="text-sm font-medium text-gray-500 mb-1">총 체험 학생</h4>
          <div className="text-xl font-bold text-gray-900">{trialStudents.length}명</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="text-sm font-medium text-gray-500 mb-1">총 체험 수업</h4>
          <div className="text-xl font-bold text-gray-900">{stats.total}건</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="text-sm font-medium text-gray-500 mb-1">미결제</h4>
          <div className="text-xl font-bold text-red-600">{stats.unpaid}건</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="text-sm font-medium text-gray-500 mb-1">총 매출 (누적)</h4>
          <div className="text-xl font-bold text-emerald-600">{formatCurrency(stats.revenue)}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-sm font-medium text-gray-500">월별 매출</h4>
            <input
              type="month"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="text-xs border border-gray-200 rounded px-1 py-0.5"
            />
          </div>
          <div className="text-xl font-bold text-indigo-600">{formatCurrency(monthlyTrialRevenue)}</div>
        </div>
      </div>

      {/* Price info */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6">
        <h4 className="text-sm font-medium text-emerald-700 mb-2">체험 수업 가격표</h4>
        <div className="flex gap-6 text-sm">
          {([60, 80, 100] as ClassDuration[]).map(d => (
            <span key={d} className="text-emerald-800">
              {d}분: <span className="font-bold">{formatCurrency(TRIAL_PRICING[d])}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Trial Student Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">이름</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">나이/학년</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">학부모 연락처</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">수업 정보</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">금액</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">결제 상태</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">등록일</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {trialData.map(({ student, lessons }) => (
              <tr key={student.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="text-sm font-medium text-gray-900">{student.name}</div>
                  {student.memo && <div className="text-xs text-gray-400">{student.memo}</div>}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{student.grade}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{student.parentPhone || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {lessons.map(l => (
                    <div key={l.id}>
                      {l.date ? format(parseISO(l.date), 'MM/dd', { locale: ko }) : ''} ({l.dayOfWeek}) {l.startTime} · {l.duration}분
                    </div>
                  ))}
                </td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {lessons.map(l => (
                    <div key={l.id}>{formatCurrency(l.amount)}</div>
                  ))}
                </td>
                <td className="px-4 py-3">
                  {lessons.map(l => (
                    <div key={l.id} className="mb-1">
                      {l.paid ? (
                        <Badge variant="success">
                          결제완료 ({l.paymentMethod})
                        </Badge>
                      ) : (
                        <button
                          onClick={() => setPayingLessonId(l.id)}
                          className="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full font-medium hover:bg-red-100"
                        >
                          미결제 - 결제하기
                        </button>
                      )}
                    </div>
                  ))}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {format(new Date(student.createdAt), 'MM/dd', { locale: ko })}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const lesson = lessons[0];
                        if (lesson) setEditingTrial({ student, lesson });
                      }}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`${student.name} 체험 기록을 삭제하시겠습니까?`)) deleteTrialStudent(student.id);
                      }}
                      className="text-xs text-red-600 hover:text-red-800 font-medium"
                    >
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {trialData.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">
                  체험 수업 기록이 없습니다. 위의 &quot;+ 체험 수업 등록&quot; 버튼을 눌러 추가하세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Trial Form Modal */}
      <Modal isOpen={showTrialForm} onClose={() => setShowTrialForm(false)} title="체험 수업 등록">
        <TrialForm
          onSubmit={handleAddTrial}
          onCancel={() => setShowTrialForm(false)}
        />
      </Modal>

      {/* Edit Trial Modal */}
      <Modal isOpen={!!editingTrial} onClose={() => setEditingTrial(null)} title="체험 수업 수정">
        {editingTrial && (
          <TrialForm
            initialData={{
              name: editingTrial.student.name,
              grade: editingTrial.student.grade,
              parentPhone: editingTrial.student.parentPhone,
              memo: editingTrial.student.memo,
              date: editingTrial.lesson.date,
              dayOfWeek: editingTrial.lesson.dayOfWeek,
              startTime: editingTrial.lesson.startTime,
              duration: editingTrial.lesson.duration,
            }}
            onSubmit={handleEditTrial}
            onCancel={() => setEditingTrial(null)}
          />
        )}
      </Modal>

      {/* Payment Modal */}
      <Modal isOpen={!!payingLessonId} onClose={() => setPayingLessonId(null)} title="체험 수업 결제">
        <div className="space-y-4">
          {payingLessonId && (() => {
            const lesson = trialLessons.find(l => l.id === payingLessonId);
            const student = lesson ? trialStudents.find(s => s.id === lesson.trialStudentId) : null;
            if (!lesson || !student) return null;
            return (
              <>
                <div className="bg-gray-50 rounded-lg p-3 text-sm">
                  <div className="font-medium text-gray-900">{student.name} ({student.grade})</div>
                  <div className="text-gray-600">
                    {lesson.date ? format(parseISO(lesson.date), 'MM/dd', { locale: ko }) + ' ' : ''}{lesson.dayOfWeek} {lesson.startTime} | {lesson.duration}분
                  </div>
                  <div className="text-lg font-bold text-gray-900 mt-1">{formatCurrency(lesson.amount)}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">결제 방식</label>
                  <div className="flex flex-wrap gap-2">
                    {PAYMENT_METHODS.map(m => (
                      <button
                        key={m}
                        onClick={() => setPaymentMethod(m)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                          paymentMethod === m
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
                    onClick={() => handlePayment(payingLessonId)}
                    className="flex-1 bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-700"
                  >
                    결제 완료
                  </button>
                  <button
                    onClick={() => setPayingLessonId(null)}
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
    </div>
  );
}
