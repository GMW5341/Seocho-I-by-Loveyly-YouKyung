import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import type { Student, Payment, PaymentMethod, ClassDuration, AcademySettings, ExtraDiscount, SplitPayment, DayOfWeek, RegularScheduleEntry } from '../../types';
import { formatCurrency, getPricePerSession } from '../../utils/helpers';

interface PaymentFormProps {
  students: Student[];
  settings: AcademySettings;
  payment?: Payment;
  isPastMode?: boolean;
  onSubmit: (data: Omit<Payment, 'id' | 'usedSessions' | 'remainingSessions' | 'completed'> & { isPastRecord?: boolean }) => void;
  onCancel: () => void;
}

const PAYMENT_METHODS: PaymentMethod[] = ['계좌이체', '현금', '카드', '온누리상품권', '기타'];
const DAYS: DayOfWeek[] = ['월', '화', '수', '목', '금', '토'];
const TIME_SLOTS = Array.from({ length: 27 }, (_, i) => {
  const h = Math.floor(i / 2) + 10;
  const m = i % 2 === 0 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
});

export default function PaymentForm({ students, settings, payment, isPastMode, onSubmit, onCancel }: PaymentFormProps) {
  const [studentId, setStudentId] = useState(payment?.studentId || '');
  const [studentSearch, setStudentSearch] = useState('');
  const [totalSessions, setTotalSessions] = useState(payment?.totalSessions || 4);
  const [classDuration, setClassDuration] = useState<ClassDuration>(payment?.classDuration || 60);
  const [originalAmount, setOriginalAmount] = useState(payment?.originalAmount || payment?.amount || 0);
  const [discountRate, setDiscountRate] = useState(payment?.discountRate || 0);
  const [amount, setAmount] = useState(payment?.amount || 0);
  const [manualAmount, setManualAmount] = useState(false);
  const [extraDiscounts, setExtraDiscounts] = useState<ExtraDiscount[]>(payment?.extraDiscounts || []);
  const [method, setMethod] = useState<PaymentMethod>(payment?.method || '카드');
  const [isSplitPayment, setIsSplitPayment] = useState(!!payment?.splitPayments?.length);
  const [splitPayments, setSplitPayments] = useState<SplitPayment[]>(
    payment?.splitPayments || [{ method: '카드', amount: 0 }, { method: '현금', amount: 0 }]
  );
  const [paidAt, setPaidAt] = useState(payment?.paidAt || format(new Date(), 'yyyy-MM-dd'));
  const [startDate, setStartDate] = useState(payment?.startDate || format(new Date(), 'yyyy-MM-dd'));
  const [lastClassDate, setLastClassDate] = useState(payment?.lastClassDate || '');
  const [sessionsPerWeek, setSessionsPerWeek] = useState(
    payment?.sessionsPerWeek || payment?.regularSchedule?.length || 0
  );
  const [regularSchedule, setRegularSchedule] = useState<RegularScheduleEntry[]>(
    payment?.regularSchedule || []
  );
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

  // Calculate total extra discount amount
  const extraDiscountTotal = extraDiscounts.reduce((sum, d) => {
    if (d.type === 'fixed') return sum + d.value;
    if (d.type === 'rate') return sum + Math.round(originalAmount * d.value / 100);
    return sum;
  }, 0);

  // Apply discount to calculate final amount
  useEffect(() => {
    if (!manualAmount) {
      const afterRate = Math.round(originalAmount * (1 - discountRate / 100));
      const afterExtra = afterRate - extraDiscountTotal;
      setAmount(Math.max(0, afterExtra));
    }
  }, [originalAmount, discountRate, extraDiscountTotal, manualAmount]);

  // Auto-set duration and schedule from student selection
  useEffect(() => {
    if (selectedStudent && !payment) {
      setClassDuration(selectedStudent.classDuration);
      // Load existing schedule from student as default
      if (selectedStudent.regularSchedule?.length) {
        setSessionsPerWeek(selectedStudent.sessionsPerWeek || selectedStudent.regularSchedule.length);
        setRegularSchedule([...selectedStudent.regularSchedule]);
      }
    }
  }, [selectedStudent, payment]);

  const handleSessionsPerWeekChange = (n: number) => {
    setSessionsPerWeek(n);
    if (n > regularSchedule.length) {
      const newEntries: RegularScheduleEntry[] = [...regularSchedule];
      const usedDays = newEntries.map(e => e.day);
      const availableDays = DAYS.filter(d => !usedDays.includes(d));
      for (let i = regularSchedule.length; i < n; i++) {
        newEntries.push({ day: availableDays[i - regularSchedule.length] || '월', startTime: '14:00' });
      }
      setRegularSchedule(newEntries);
    } else {
      setRegularSchedule(regularSchedule.slice(0, n));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId) return;
    const activeSplits = isSplitPayment ? splitPayments.filter(sp => sp.amount > 0) : undefined;
    onSubmit({
      studentId,
      totalSessions,
      amount,
      originalAmount,
      discountRate,
      extraDiscounts: extraDiscounts.length > 0 ? extraDiscounts : undefined,
      method: isSplitPayment && activeSplits?.length ? activeSplits[0].method : method,
      splitPayments: activeSplits && activeSplits.length > 0 ? activeSplits : undefined,
      classDuration,
      paidAt,
      startDate: isPastMode ? paidAt : startDate,
      lastClassDate: isPastMode && lastClassDate ? lastClassDate : undefined,
      sessionsPerWeek: !isPastMode && sessionsPerWeek > 0 ? sessionsPerWeek : undefined,
      regularSchedule: !isPastMode && regularSchedule.length > 0 ? regularSchedule : undefined,
      memo: isPastMode ? (memo ? `[과거 기록] ${memo}` : '[과거 기록]') : memo,
      isPastRecord: isPastMode || undefined,
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
          <div className="flex gap-2 flex-wrap">
            {[3, 4, 5, 8, 12, 16].map(n => (
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

        {/* Extra Discounts */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700">기타 할인</label>
            <button
              type="button"
              onClick={() => setExtraDiscounts([...extraDiscounts, { label: '', type: 'fixed', value: 0 }])}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              + 할인 항목 추가
            </button>
          </div>
          {extraDiscounts.length > 0 && (
            <div className="space-y-2">
              {extraDiscounts.map((d, i) => (
                <div key={i} className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 p-2">
                  <input
                    type="text"
                    placeholder="할인 사유 (예: 형제 할인)"
                    value={d.label}
                    onChange={e => {
                      const updated = [...extraDiscounts];
                      updated[i] = { ...updated[i], label: e.target.value };
                      setExtraDiscounts(updated);
                    }}
                    className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm min-w-0"
                  />
                  <select
                    value={d.type}
                    onChange={e => {
                      const updated = [...extraDiscounts];
                      updated[i] = { ...updated[i], type: e.target.value as 'rate' | 'fixed', value: 0 };
                      setExtraDiscounts(updated);
                      setManualAmount(false);
                    }}
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm w-20"
                  >
                    <option value="fixed">금액</option>
                    <option value="rate">비율</option>
                  </select>
                  <div className="relative w-24">
                    <input
                      type="number"
                      value={d.value}
                      onChange={e => {
                        const updated = [...extraDiscounts];
                        const val = Number(e.target.value);
                        updated[i] = { ...updated[i], value: d.type === 'rate' ? Math.max(0, Math.min(100, val)) : Math.max(0, val) };
                        setExtraDiscounts(updated);
                        setManualAmount(false);
                      }}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm pr-8"
                      min={0}
                      max={d.type === 'rate' ? 100 : undefined}
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                      {d.type === 'rate' ? '%' : '원'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setExtraDiscounts(extraDiscounts.filter((_, idx) => idx !== i));
                      setManualAmount(false);
                    }}
                    className="text-red-400 hover:text-red-600 text-sm px-1"
                  >
                    &times;
                  </button>
                </div>
              ))}
              {extraDiscountTotal > 0 && (
                <p className="text-xs text-orange-600">
                  기타 할인 합계: -{formatCurrency(extraDiscountTotal)}
                </p>
              )}
            </div>
          )}
          {extraDiscounts.length === 0 && (
            <p className="text-xs text-gray-400">형제 할인, 동네 주민 할인 등 추가 할인 항목을 등록하세요.</p>
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
          {(discountRate > 0 || extraDiscountTotal > 0) && (
            <p className="text-xs text-gray-500 mt-1">
              {formatCurrency(originalAmount)}
              {discountRate > 0 && ` - ${discountRate}%`}
              {extraDiscountTotal > 0 && ` - 기타 ${formatCurrency(extraDiscountTotal)}`}
              {` = ${formatCurrency(amount)}`}
            </p>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-gray-700">결제 방식</label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={isSplitPayment}
              onChange={e => setIsSplitPayment(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-xs text-gray-600">분할 결제</span>
          </label>
        </div>

        {!isSplitPayment ? (
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
        ) : (
          <div className="space-y-2">
            {splitPayments.map((sp, i) => (
              <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg border border-gray-200 p-2">
                <select
                  value={sp.method}
                  onChange={e => {
                    const updated = [...splitPayments];
                    updated[i] = { ...updated[i], method: e.target.value as PaymentMethod };
                    setSplitPayments(updated);
                  }}
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm flex-1"
                >
                  {PAYMENT_METHODS.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <div className="relative w-32">
                  <input
                    type="number"
                    value={sp.amount}
                    onChange={e => {
                      const updated = [...splitPayments];
                      updated[i] = { ...updated[i], amount: Math.max(0, Number(e.target.value)) };
                      setSplitPayments(updated);
                    }}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm pr-8"
                    min={0}
                    placeholder="금액"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">원</span>
                </div>
                {splitPayments.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setSplitPayments(splitPayments.filter((_, idx) => idx !== i))}
                    className="text-red-400 hover:text-red-600 text-sm px-1"
                  >
                    &times;
                  </button>
                )}
              </div>
            ))}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSplitPayments([...splitPayments, { method: '기타', amount: 0 }])}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                + 결제 방식 추가
              </button>
              {(() => {
                const splitTotal = splitPayments.reduce((sum, sp) => sum + sp.amount, 0);
                const diff = amount - splitTotal;
                return (
                  <span className={`text-xs font-medium ${diff === 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    합계: {formatCurrency(splitTotal)}
                    {diff !== 0 && ` (${diff > 0 ? '부족' : '초과'} ${formatCurrency(Math.abs(diff))})`}
                  </span>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Schedule Section - only for non-past mode */}
      {!isPastMode && studentId && (
        <div className="bg-blue-50 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-bold text-gray-800">수업 스케줄</label>
            {selectedStudent?.regularSchedule?.length ? (
              <span className="text-xs text-blue-600">기존 스케줄이 자동 로드되었습니다</span>
            ) : null}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">주당 수업 횟수</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  type="button"
                  key={n}
                  onClick={() => handleSessionsPerWeekChange(n)}
                  className={`flex-1 px-2 py-1.5 rounded-lg text-sm font-medium border ${
                    sessionsPerWeek === n
                      ? 'bg-blue-500 border-blue-500 text-white'
                      : 'border-gray-300 text-gray-600 hover:bg-white'
                  }`}
                >
                  주{n}회
                </button>
              ))}
            </div>
          </div>
          {sessionsPerWeek > 0 && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-600">요일 및 시간 ({sessionsPerWeek}회 수업)</label>
              {regularSchedule.map((entry, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-6">{i + 1}.</span>
                  <div className="flex gap-1">
                    {DAYS.map(d => (
                      <button
                        type="button"
                        key={d}
                        onClick={() => {
                          const updated = [...regularSchedule];
                          updated[i] = { ...updated[i], day: d };
                          setRegularSchedule(updated);
                        }}
                        className={`w-8 h-8 rounded-full text-xs font-medium border ${
                          entry.day === d
                            ? 'bg-blue-500 border-blue-500 text-white'
                            : 'border-gray-300 text-gray-500 hover:bg-white'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                  <select
                    value={entry.startTime}
                    onChange={e => {
                      const updated = [...regularSchedule];
                      updated[i] = { ...updated[i], startTime: e.target.value };
                      setRegularSchedule(updated);
                    }}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm flex-1"
                  >
                    {TIME_SLOTS.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
          {sessionsPerWeek === 0 && (
            <p className="text-xs text-gray-400">주당 수업 횟수를 선택하면 요일/시간을 설정할 수 있습니다.</p>
          )}
        </div>
      )}

      <div className={isPastMode ? 'grid grid-cols-2 gap-4' : 'grid grid-cols-2 gap-4'}>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">결제일</label>
          <input
            type="date"
            value={paidAt}
            onChange={e => setPaidAt(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        {isPastMode ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">마지막 수업일</label>
            <input
              type="date"
              value={lastClassDate}
              onChange={e => setLastClassDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">수업 시작일</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        )}
      </div>
      {isPastMode && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
          과거 결제 기록은 매출에만 반영되며, 수업 잔여 횟수에는 영향을 주지 않습니다.
        </div>
      )}

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
