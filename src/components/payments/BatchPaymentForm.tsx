import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import type { Student, Payment, PaymentMethod, ClassDuration, AcademySettings, SplitPayment, DayOfWeek, RegularScheduleEntry } from '../../types';
import { formatCurrency, getPricePerSession } from '../../utils/helpers';

interface StudentEntry {
  studentId: string;
  classDuration: ClassDuration;
  totalSessions: number;
  sessionsPerWeek: number;
  regularSchedule: RegularScheduleEntry[];
  originalAmount: number;
  discountRate: number;
  amount: number;
  manualAmount: boolean;
}

interface BatchPaymentFormProps {
  students: Student[];
  settings: AcademySettings;
  payments: Payment[];
  onSubmit: (entries: Omit<Payment, 'id' | 'usedSessions' | 'remainingSessions' | 'completed' | 'transactionGroupId'>[]) => void;
  onCancel: () => void;
}

const PAYMENT_METHODS: PaymentMethod[] = ['계좌이체', '현금', '카드', '온누리상품권', '기타'];
const DAYS: DayOfWeek[] = ['월', '화', '수', '목', '금', '토'];

function createEmptyEntry(settings: AcademySettings): StudentEntry {
  const basePrice = getPricePerSession(settings.pricing[60], 4);
  return {
    studentId: '',
    classDuration: 60,
    totalSessions: 4,
    sessionsPerWeek: 0,
    regularSchedule: [],
    originalAmount: basePrice,
    discountRate: 0,
    amount: basePrice,
    manualAmount: false,
  };
}

export default function BatchPaymentForm({ students, settings, payments: allPayments, onSubmit, onCancel }: BatchPaymentFormProps) {
  const [entries, setEntries] = useState<StudentEntry[]>([
    createEmptyEntry(settings),
    createEmptyEntry(settings),
  ]);

  // Shared payment info
  const [method, setMethod] = useState<PaymentMethod>('카드');
  const [isSplitPayment, setIsSplitPayment] = useState(false);
  const [splitPayments, setSplitPayments] = useState<SplitPayment[]>([
    { method: '카드', amount: 0 }, { method: '현금', amount: 0 },
  ]);
  const [paidAt, setPaidAt] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [memo, setMemo] = useState('');

  const totalAmount = entries.reduce((sum, e) => sum + e.amount, 0);

  const updateEntry = (index: number, updates: Partial<StudentEntry>) => {
    setEntries(prev => prev.map((e, i) => i === index ? { ...e, ...updates } : e));
  };

  const removeEntry = (index: number) => {
    if (entries.length <= 2) return;
    setEntries(prev => prev.filter((_, i) => i !== index));
  };

  const addEntry = () => {
    setEntries(prev => [...prev, createEmptyEntry(settings)]);
  };

  // Recalculate prices when duration/sessions change
  const recalculateAmount = (entry: StudentEntry): StudentEntry => {
    if (entry.manualAmount) return entry;
    const basePrice = settings.pricing[entry.classDuration];
    const originalAmount = getPricePerSession(basePrice, entry.totalSessions);
    const amount = Math.max(0, Math.round(originalAmount * (1 - entry.discountRate / 100)));
    return { ...entry, originalAmount, amount };
  };

  // Auto-load schedule from latest payment when student is selected
  const handleStudentChange = (index: number, studentId: string) => {
    const latestPayment = allPayments
      ?.filter(p => p.studentId === studentId && p.regularSchedule?.length)
      .sort((a, b) => b.paidAt.localeCompare(a.paidAt))[0];

    const updates: Partial<StudentEntry> = { studentId };
    if (latestPayment) {
      updates.classDuration = latestPayment.classDuration;
      updates.sessionsPerWeek = latestPayment.sessionsPerWeek || latestPayment.regularSchedule!.length;
      updates.regularSchedule = [...latestPayment.regularSchedule!];
    }

    setEntries(prev => prev.map((e, i) => {
      if (i !== index) return e;
      const updated = { ...e, ...updates };
      return recalculateAmount(updated);
    }));
  };

  const handleSessionsPerWeekChange = (index: number, n: number) => {
    setEntries(prev => prev.map((e, i) => {
      if (i !== index) return e;
      let schedule = [...e.regularSchedule];
      if (n > schedule.length) {
        const usedDays = schedule.map(s => s.day);
        const availableDays = DAYS.filter(d => !usedDays.includes(d));
        for (let j = schedule.length; j < n; j++) {
          schedule.push({ day: availableDays[j - schedule.length] || '월', startTime: '14:00' });
        }
      } else {
        schedule = schedule.slice(0, n);
      }
      return { ...e, sessionsPerWeek: n, regularSchedule: schedule };
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validEntries = entries.filter(entry => entry.studentId);
    if (validEntries.length === 0) return;

    const activeSplits = isSplitPayment ? splitPayments.filter(sp => sp.amount > 0) : undefined;

    const paymentEntries = validEntries.map(entry => ({
      studentId: entry.studentId,
      totalSessions: entry.totalSessions,
      amount: entry.amount,
      originalAmount: entry.originalAmount,
      discountRate: entry.discountRate || undefined,
      method: isSplitPayment && activeSplits?.length ? activeSplits[0].method : method,
      splitPayments: activeSplits && activeSplits.length > 0 ? activeSplits : undefined,
      classDuration: entry.classDuration,
      paidAt,
      startDate,
      sessionsPerWeek: entry.sessionsPerWeek > 0 ? entry.sessionsPerWeek : undefined,
      regularSchedule: entry.regularSchedule.length > 0 ? entry.regularSchedule : undefined,
      memo,
    }));

    onSubmit(paymentEntries);
  };

  // Used student IDs (to prevent selecting same student twice)
  const usedStudentIds = new Set(entries.map(e => e.studentId).filter(Boolean));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
        형제 등 여러 원생을 한 번에 결제할 때 사용합니다. 결제 정보(방식, 날짜)는 공유되고, 각 원생별 수업 설정은 개별로 입력합니다.
      </div>

      {/* Per-student entries */}
      {entries.map((entry, idx) => {
        const selectedStudent = students.find(s => s.id === entry.studentId);
        return (
          <div key={idx} className="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-gray-800">원생 {idx + 1}</h4>
              {entries.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeEntry(idx)}
                  className="text-xs text-red-500 hover:text-red-700 font-medium"
                >
                  삭제
                </button>
              )}
            </div>

            {/* Student select */}
            <div>
              <select
                value={entry.studentId}
                onChange={e => handleStudentChange(idx, e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                required
              >
                <option value="">원생을 선택하세요</option>
                {students.map(s => (
                  <option
                    key={s.id}
                    value={s.id}
                    disabled={usedStudentIds.has(s.id) && entry.studentId !== s.id}
                  >
                    {s.name} ({s.level})
                  </option>
                ))}
              </select>
            </div>

            {entry.studentId && (
              <>
                {/* Duration + Sessions */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">수업 시간</label>
                    <select
                      value={entry.classDuration}
                      onChange={e => {
                        const dur = Number(e.target.value) as ClassDuration;
                        setEntries(prev => prev.map((en, i) =>
                          i === idx ? recalculateAmount({ ...en, classDuration: dur, manualAmount: false }) : en
                        ));
                      }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                    >
                      {([60, 80, 100] as ClassDuration[]).map(d => (
                        <option key={d} value={d}>{d}분</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">결제 횟수</label>
                    <div className="flex gap-1">
                      {[4, 8, 12].map(n => (
                        <button
                          type="button"
                          key={n}
                          onClick={() => {
                            setEntries(prev => prev.map((en, i) =>
                              i === idx ? recalculateAmount({ ...en, totalSessions: n, manualAmount: false }) : en
                            ));
                          }}
                          className={`flex-1 px-1 py-1.5 rounded text-xs font-medium border ${
                            entry.totalSessions === n ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-300 text-gray-600'
                          }`}
                        >
                          {n}회
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Schedule */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">주당 수업</label>
                  <div className="flex gap-1 mb-2">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button
                        type="button"
                        key={n}
                        onClick={() => handleSessionsPerWeekChange(idx, n)}
                        className={`flex-1 px-1 py-1 rounded text-xs font-medium border ${
                          entry.sessionsPerWeek === n
                            ? 'bg-blue-500 border-blue-500 text-white'
                            : 'border-gray-300 text-gray-600'
                        }`}
                      >
                        {n}회
                      </button>
                    ))}
                  </div>
                  {entry.regularSchedule.map((sched, si) => (
                    <div key={si} className="flex items-center gap-1 mb-1">
                      <div className="flex gap-0.5">
                        {DAYS.map(d => (
                          <button
                            type="button"
                            key={d}
                            onClick={() => {
                              setEntries(prev => prev.map((en, i) => {
                                if (i !== idx) return en;
                                const updated = [...en.regularSchedule];
                                updated[si] = { ...updated[si], day: d };
                                return { ...en, regularSchedule: updated };
                              }));
                            }}
                            className={`w-6 h-6 rounded-full text-[10px] font-medium border ${
                              sched.day === d ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300 text-gray-500'
                            }`}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                      <input
                        type="time"
                        value={sched.startTime}
                        onChange={e => {
                          setEntries(prev => prev.map((en, i) => {
                            if (i !== idx) return en;
                            const updated = [...en.regularSchedule];
                            updated[si] = { ...updated[si], startTime: e.target.value };
                            return { ...en, regularSchedule: updated };
                          }));
                        }}
                        className="border border-gray-300 rounded px-2 py-1 text-sm flex-1"
                      />
                    </div>
                  ))}
                </div>

                {/* Price */}
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-600 mb-1">금액</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={entry.amount}
                        onChange={e => updateEntry(idx, { amount: Number(e.target.value), manualAmount: true })}
                        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm pr-8 font-medium"
                        min={0}
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">원</span>
                    </div>
                  </div>
                  <div className="w-20">
                    <label className="block text-xs font-medium text-gray-600 mb-1">할인</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={entry.discountRate}
                        onChange={e => {
                          const rate = Math.max(0, Math.min(100, Number(e.target.value)));
                          setEntries(prev => prev.map((en, i) =>
                            i === idx ? recalculateAmount({ ...en, discountRate: rate, manualAmount: false }) : en
                          ));
                        }}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm pr-6"
                        min={0}
                        max={100}
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">%</span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  자동: {entry.totalSessions}회 x {formatCurrency(settings.pricing[entry.classDuration] / 4)}/회 = {formatCurrency(getPricePerSession(settings.pricing[entry.classDuration], entry.totalSessions))}
                </p>
              </>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={addEntry}
        className="w-full border-2 border-dashed border-gray-300 rounded-lg py-2 text-sm text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
      >
        + 원생 추가
      </button>

      {/* Total */}
      <div className="bg-indigo-50 rounded-lg p-3 flex items-center justify-between">
        <span className="text-sm font-bold text-gray-800">합계 금액</span>
        <span className="text-lg font-bold text-indigo-700">{formatCurrency(totalAmount)}</span>
      </div>

      {/* Shared payment info */}
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
                const diff = totalAmount - splitTotal;
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
          placeholder="묶음 결제 관련 메모 (예: 형제 할인)"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={entries.filter(e => e.studentId).length < 2}
          className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          묶음 결제 등록 ({entries.filter(e => e.studentId).length}명)
        </button>
        <button type="button" onClick={onCancel} className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-200">
          취소
        </button>
      </div>
    </form>
  );
}
