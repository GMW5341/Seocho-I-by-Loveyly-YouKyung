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
  const [studentSearch, setStudentSearch] = useState('');
  const [totalSessions, setTotalSessions] = useState(payment?.totalSessions || 4);
  const [classDuration, setClassDuration] = useState<ClassDuration>(payment?.classDuration || 60);
  const [originalAmount, setOriginalAmount] = useState(payment?.originalAmount || payment?.amount || 0);
  const [discountRate, setDiscountRate] = useState(payment?.discountRate || 0);
  const [amount, setAmount] = useState(payment?.amount || 0);
  const [manualAmount, setManualAmount] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>(payment?.method || '카드');
  const [paidAt, setPaidAt] = useState(payment?.paidAt || format(new Date(), 'yyyy-MM-dd'));
  const [startDate, setStartDate] = useState(payment?.startDate || format(new Date(), 'yyyy-MM-dd'));
  const [memo, setMemo] = useState(payment?.memo || '');

  const selectedStudent = students.find(s => s.id === studentId);

  // Auto-calculate original price based on sessions and duration
  useEffect(() => {
    if (!manualAmount) {
      const basePrice = settings.pricing[classDuration];
      const calculated = getPricePerSession(basePrice, totalSessions);
      setOriginalAmount(calculated);
    }
  }, [totalSessions, classDuration, settings.pricing, manualAmount]);

  // Apply discount to calculate final amount
  useEffect(() => {
    if (!manualAmount) {
      const discounted = Math.round(originalAmount * (1 - discountRate / 100));
      setAmount(discounted);
    }
  }, [originalAmount, discountRate, manualAmount]);

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
      originalAmount,
      discountRate,
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
        {!payment && (
          <input
            type="text"
            placeholder="이름 검색..."
            value={studentSearch}
            onChange={e => setStudentSearch(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-1"
          />
        )}
        <select
          value={studentId}
          onChange={e => setStudentId(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          required
          disabled={!!payment}
          size={!payment && studentSearch ? Math.min(6, students.filter(s => s.name.includes(studentSearch)).length + 1) : 1}
        >
          <option value="">원생을 선택하세요</option>
          {students
            .filter(s => !studentSearch || s.name.includes(studentSearch))
            .map(s => (
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

      {/* Price section */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">기본 금액</label>
          <div className="relative">
            <input
              type="number"
              value={originalAmount}
              onChange={e => {
                setManualAmount(true);
                setOriginalAmount(Number(e.target.value));
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm pr-12"
              min={0}
              step={1}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">원</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            자동계산: {totalSessions}회 x {formatCurrency(settings.pricing[classDuration] / 4)}/회 = {formatCurrency(getPricePerSession(settings.pricing[classDuration], totalSessions))}
            {manualAmount && (
              <button
                type="button"
                onClick={() => {
                  setManualAmount(false);
                  setOriginalAmount(getPricePerSession(settings.pricing[classDuration], totalSessions));
                }}
                className="ml-2 text-indigo-600 hover:text-indigo-800 underline"
              >
                자동계산으로 복원
              </button>
            )}
          </p>
        </div>

        {/* Discount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">할인율</label>
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <input
                type="number"
                value={discountRate}
                onChange={e => {
                  const val = Math.max(0, Math.min(100, Number(e.target.value)));
                  setDiscountRate(val);
                  setManualAmount(false);
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm pr-8"
                min={0}
                max={100}
                step={1}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">%</span>
            </div>
            <div className="flex gap-1">
              {[5, 10, 15, 20].map(rate => (
                <button
                  type="button"
                  key={rate}
                  onClick={() => {
                    setDiscountRate(rate);
                    setManualAmount(false);
                  }}
                  className={`px-2 py-1.5 rounded text-xs font-medium border ${
                    discountRate === rate ? 'bg-orange-50 border-orange-300 text-orange-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {rate}%
                </button>
              ))}
            </div>
          </div>
          {discountRate > 0 && (
            <p className="text-xs text-orange-600 mt-1">
              할인: -{formatCurrency(Math.round(originalAmount * discountRate / 100))}
            </p>
          )}
        </div>

        {/* Final amount */}
        <div className="border-t border-gray-200 pt-3">
          <label className="block text-sm font-bold text-gray-800 mb-1">최종 결제 금액</label>
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={e => {
                setManualAmount(true);
                setAmount(Number(e.target.value));
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm pr-12 font-bold text-lg"
              min={0}
              step={1}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">원</span>
          </div>
          {discountRate > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              {formatCurrency(originalAmount)} - {discountRate}% = {formatCurrency(amount)}
            </p>
          )}
        </div>
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
