import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import type { Student, Payment, PaymentMethod, ClassDuration, AcademySettings } from '../../types';
import { formatCurrency, getPricePerSession } from '../../utils/helpers';

interface PaymentFormProps {
  students: Student[];
  settings: AcademySettings;
  payment?: Payment;
  onSubmit: (data: Omit<Payment, 'id' | 'usedSessions' | 'remainingSessions' | 'completed'>) => void;
  onCancel: () => void;
}

const PAYMENT_METHODS: PaymentMethod[] = ['계좌이체', '현금', '카드', '온누리상품권', '기타'];

export default function PaymentForm({ students, settings, payment, onSubmit, onCancel }: PaymentFormProps) {
  const [studentId, setStudentId] = useState(payment?.studentId || '');
  const [totalSessions, setTotalSessions] = useState(payment?.totalSessions || 4);
  const [classDuration, setClassDuration] = useState<ClassDuration>(payment?.classDuration || 60);
  const [amount, setAmount] = useState(payment?.amount || 0);
  const [method, setMethod] = useState<PaymentMethod>(payment?.method || '카드');
  const [paidAt, setPaidAt] = useState(payment?.paidAt || format(new Date(), 'yyyy-MM-dd'));
  const [startDate, setStartDate] = useState(payment?.startDate || format(new Date(), 'yyyy-MM-dd'));
  const [memo, setMemo] = useState(payment?.memo || '');

  const selectedStudent = students.find(s => s.id === studentId);

  // Auto-calculate price based on sessions and duration
  useEffect(() => {
    if (!payment) {
      const basePrice = settings.pricing[classDuration];
      setAmount(getPricePerSession(basePrice, totalSessions));
    }
  }, [totalSessions, classDuration, settings.pricing, payment]);

  // Auto-set duration from student selection
  useEffect(() => {
    if (selectedStudent && !payment) {
      setClassDuration(selectedStudent.classDuration);
    }
  }, [selectedStudent, payment]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId) return;
    onSubmit({
      studentId,
      totalSessions,
      amount,
      method,
      classDuration,
      paidAt,
      startDate,
      memo,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">원생 *</label>
        <select
          value={studentId}
          onChange={e => setStudentId(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          required
          disabled={!!payment}
        >
          <option value="">원생을 선택하세요</option>
          {students.map(s => (
            <option key={s.id} value={s.id}>{s.name} ({s.level} / {s.classDuration}분)</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">수업 시간</label>
          <select
            value={classDuration}
            onChange={e => setClassDuration(Number(e.target.value) as ClassDuration)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            {([60, 80, 100] as ClassDuration[]).map(d => (
              <option key={d} value={d}>{d}분 (4회 기준 {formatCurrency(settings.pricing[d])})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">결제 횟수</label>
          <div className="flex gap-2">
            {[3, 4, 5, 8].map(n => (
              <button
                type="button"
                key={n}
                onClick={() => setTotalSessions(n)}
                className={`flex-1 px-2 py-2 rounded-lg text-sm font-medium border ${
                  totalSessions === n ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {n}회
              </button>
            ))}
          </div>
          <input
            type="number"
            value={totalSessions}
            onChange={e => setTotalSessions(Math.max(1, Number(e.target.value)))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-2"
            min={1}
            max={20}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">결제 금액</label>
        <div className="relative">
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(Number(e.target.value))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm pr-12"
            min={0}
            step={10000}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">원</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          자동계산: {totalSessions}회 x {formatCurrency(settings.pricing[classDuration] / 4)}/회 = {formatCurrency(getPricePerSession(settings.pricing[classDuration], totalSessions))}
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">결제 방식</label>
        <div className="flex flex-wrap gap-2">
          {PAYMENT_METHODS.map(m => (
            <button
              type="button"
              key={m}
              onClick={() => setMethod(m)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                method === m ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">결제일</label>
          <input
            type="date"
            value={paidAt}
            onChange={e => setPaidAt(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">수업 시작일</label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
        <textarea
          value={memo}
          onChange={e => setMemo(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          rows={2}
          placeholder="결제 관련 메모"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
          {payment ? '수정' : '결제 등록'}
        </button>
        <button type="button" onClick={onCancel} className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-200">
          취소
        </button>
      </div>
    </form>
  );
}
