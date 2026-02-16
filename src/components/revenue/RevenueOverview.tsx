import { useState, useMemo } from 'react';
import { format, parseISO, startOfMonth, endOfMonth, startOfYear, endOfYear, isWithinInterval, subMonths } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAppStore } from '../../store/StoreContext';
import { formatCurrency } from '../../utils/helpers';
import { exportRevenueToExcel } from '../../utils/excelExport';

export default function RevenueOverview() {
  const { payments, trialLessons, specialClasses, specialClassStudents, students, trialStudents } = useAppStore();
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));

  const revenueData = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const monthStart = startOfMonth(new Date(year, month - 1));
    const monthEnd = endOfMonth(monthStart);
    const yearStart = startOfYear(monthStart);
    const yearEnd = endOfYear(monthStart);

    // Regular payments
    const monthPayments = payments.filter(p => {
      const date = parseISO(p.paidAt);
      return isWithinInterval(date, { start: monthStart, end: monthEnd });
    });
    const yearPayments = payments.filter(p => {
      const date = parseISO(p.paidAt);
      return isWithinInterval(date, { start: yearStart, end: yearEnd });
    });

    // Trial revenue
    const monthTrials = trialLessons.filter(l => {
      if (!l.paid || !l.paidAt) return false;
      const date = parseISO(l.paidAt);
      return isWithinInterval(date, { start: monthStart, end: monthEnd });
    });
    const yearTrials = trialLessons.filter(l => {
      if (!l.paid || !l.paidAt) return false;
      const date = parseISO(l.paidAt);
      return isWithinInterval(date, { start: yearStart, end: yearEnd });
    });

    // Special class revenue (date-filtered)
    const monthSpecial = specialClassStudents.filter(s => {
      if (!s.paid || !s.paidAt) return false;
      const date = parseISO(s.paidAt);
      return isWithinInterval(date, { start: monthStart, end: monthEnd });
    });
    const yearSpecial = specialClassStudents.filter(s => {
      if (!s.paid || !s.paidAt) return false;
      const date = parseISO(s.paidAt);
      return isWithinInterval(date, { start: yearStart, end: yearEnd });
    });
    const specialAllTime = specialClassStudents.filter(s => s.paid).reduce((sum, s) => sum + s.amount, 0);

    // Payment method breakdown (regular)
    const byMethod: Record<string, number> = {};
    monthPayments.forEach(p => {
      byMethod[p.method] = (byMethod[p.method] || 0) + p.amount;
    });
    // Trial payment methods
    monthTrials.forEach(l => {
      if (l.paymentMethod) {
        byMethod[l.paymentMethod] = (byMethod[l.paymentMethod] || 0) + l.amount;
      }
    });
    // Special class payment methods
    monthSpecial.forEach(s => {
      if (s.paymentMethod) {
        byMethod[s.paymentMethod] = (byMethod[s.paymentMethod] || 0) + s.amount;
      }
    });

    // Year payment method breakdown
    const yearByMethod: Record<string, number> = {};
    yearPayments.forEach(p => {
      yearByMethod[p.method] = (yearByMethod[p.method] || 0) + p.amount;
    });
    yearTrials.forEach(l => {
      if (l.paymentMethod) {
        yearByMethod[l.paymentMethod] = (yearByMethod[l.paymentMethod] || 0) + l.amount;
      }
    });
    yearSpecial.forEach(s => {
      if (s.paymentMethod) {
        yearByMethod[s.paymentMethod] = (yearByMethod[s.paymentMethod] || 0) + s.amount;
      }
    });

    // Duration breakdown (regular)
    const byDuration: Record<string, number> = {};
    monthPayments.forEach(p => {
      const key = `${p.classDuration}분`;
      byDuration[key] = (byDuration[key] || 0) + p.amount;
    });

    const regularMonthTotal = monthPayments.reduce((sum, p) => sum + p.amount, 0);
    const trialMonthTotal = monthTrials.reduce((sum, l) => sum + l.amount, 0);
    const specialMonthTotal = monthSpecial.reduce((sum, s) => sum + s.amount, 0);
    const regularYearTotal = yearPayments.reduce((sum, p) => sum + p.amount, 0);
    const trialYearTotal = yearTrials.reduce((sum, l) => sum + l.amount, 0);
    const specialYearTotal = yearSpecial.reduce((sum, s) => sum + s.amount, 0);

    return {
      monthTotal: regularMonthTotal + trialMonthTotal + specialMonthTotal,
      regularMonthTotal,
      trialMonthTotal,
      specialMonthTotal,
      monthCount: monthPayments.length + monthTrials.length + monthSpecial.length,
      yearTotal: regularYearTotal + trialYearTotal + specialYearTotal,
      regularYearTotal,
      trialYearTotal,
      specialYearTotal,
      yearCount: yearPayments.length + yearTrials.length + yearSpecial.length,
      specialAllTime,
      byMethod,
      yearByMethod,
      byDuration,
    };
  }, [payments, trialLessons, specialClassStudents, selectedMonth]);

  // Monthly trend (last 6 months)
  const monthlyTrend = useMemo(() => {
    const months: { label: string; total: number; regular: number; trial: number; special: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const mStart = startOfMonth(d);
      const mEnd = endOfMonth(d);
      const regular = payments
        .filter(p => isWithinInterval(parseISO(p.paidAt), { start: mStart, end: mEnd }))
        .reduce((sum, p) => sum + p.amount, 0);
      const trial = trialLessons
        .filter(l => l.paid && l.paidAt && isWithinInterval(parseISO(l.paidAt), { start: mStart, end: mEnd }))
        .reduce((sum, l) => sum + l.amount, 0);
      const special = specialClassStudents
        .filter(s => s.paid && s.paidAt && isWithinInterval(parseISO(s.paidAt), { start: mStart, end: mEnd }))
        .reduce((sum, s) => sum + s.amount, 0);
      months.push({
        label: format(d, 'M월', { locale: ko }),
        total: regular + trial + special,
        regular,
        trial,
        special,
      });
    }
    return months;
  }, [payments, trialLessons, specialClassStudents]);

  const maxTrend = Math.max(...monthlyTrend.map(m => m.total), 1);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-gray-800">매출 현황</h3>
          <p className="text-sm text-gray-500">학원 전체 매출 통계</p>
        </div>
        <div className="flex gap-2 items-center">
          <input
            type="month"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={() => exportRevenueToExcel({
              selectedMonth,
              payments,
              trialLessons,
              specialClassStudents,
              specialClasses,
              students,
              trialStudents,
            })}
            className="border border-emerald-300 text-emerald-700 bg-emerald-50 px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-100 whitespace-nowrap"
          >
            엑셀 다운로드
          </button>
        </div>
      </div>

      {/* Total Revenue Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl p-5 text-white">
          <h4 className="text-sm font-medium text-indigo-200 mb-1">월 매출 (총합)</h4>
          <div className="text-2xl font-bold">{formatCurrency(revenueData.monthTotal)}</div>
          <div className="text-xs text-indigo-200 mt-1">{revenueData.monthCount}건</div>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-5 text-white">
          <h4 className="text-sm font-medium text-emerald-200 mb-1">연 매출 (총합)</h4>
          <div className="text-2xl font-bold">{formatCurrency(revenueData.yearTotal)}</div>
          <div className="text-xs text-emerald-200 mt-1">{revenueData.yearCount}건</div>
        </div>
        <div className="bg-gradient-to-br from-violet-500 to-violet-600 rounded-xl p-5 text-white">
          <h4 className="text-sm font-medium text-violet-200 mb-1">특강 매출 (누적)</h4>
          <div className="text-2xl font-bold">{formatCurrency(revenueData.specialAllTime)}</div>
          <div className="text-xs text-violet-200 mt-1">{specialClasses.filter(c => c.active).length}개 운영중</div>
        </div>
      </div>

      {/* Revenue Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Monthly Breakdown by Category */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-4">월별 매출 구분</h4>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-indigo-500" />
                <span className="text-sm text-gray-600">정규 수업</span>
              </div>
              <span className="text-sm font-bold text-gray-900">{formatCurrency(revenueData.regularMonthTotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-emerald-500" />
                <span className="text-sm text-gray-600">체험 수업</span>
              </div>
              <span className="text-sm font-bold text-gray-900">{formatCurrency(revenueData.trialMonthTotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-violet-500" />
                <span className="text-sm text-gray-600">특강 수업</span>
              </div>
              <span className="text-sm font-bold text-gray-900">{formatCurrency(revenueData.specialMonthTotal)}</span>
            </div>
            <div className="border-t border-gray-200 pt-2 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">합계</span>
              <span className="text-sm font-bold text-indigo-700">{formatCurrency(revenueData.monthTotal)}</span>
            </div>
          </div>

          <h4 className="text-sm font-semibold text-gray-700 mt-6 mb-4">연간 매출 구분</h4>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-indigo-500" />
                <span className="text-sm text-gray-600">정규 수업</span>
              </div>
              <span className="text-sm font-bold text-gray-900">{formatCurrency(revenueData.regularYearTotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-emerald-500" />
                <span className="text-sm text-gray-600">체험 수업</span>
              </div>
              <span className="text-sm font-bold text-gray-900">{formatCurrency(revenueData.trialYearTotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-violet-500" />
                <span className="text-sm text-gray-600">특강 수업</span>
              </div>
              <span className="text-sm font-bold text-gray-900">{formatCurrency(revenueData.specialYearTotal)}</span>
            </div>
            <div className="border-t border-gray-200 pt-2 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">합계</span>
              <span className="text-sm font-bold text-emerald-700">{formatCurrency(revenueData.yearTotal)}</span>
            </div>
          </div>
        </div>

        {/* Payment Method Breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-4">결제 방식별 매출 (월)</h4>
          {Object.keys(revenueData.byMethod).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(revenueData.byMethod)
                .sort((a, b) => b[1] - a[1])
                .map(([method, amount]) => {
                  const percent = revenueData.monthTotal > 0 ? Math.round((amount / revenueData.monthTotal) * 100) : 0;
                  return (
                    <div key={method}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-600">{method}</span>
                        <span className="text-sm font-medium text-gray-900">{formatCurrency(amount)} ({percent}%)</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <p className="text-sm text-gray-400">해당 월 결제 내역이 없습니다.</p>
          )}

          <h4 className="text-sm font-semibold text-gray-700 mt-6 mb-4">결제 방식별 매출 (연)</h4>
          {Object.keys(revenueData.yearByMethod).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(revenueData.yearByMethod)
                .sort((a, b) => b[1] - a[1])
                .map(([method, amount]) => {
                  const percent = revenueData.yearTotal > 0 ? Math.round((amount / revenueData.yearTotal) * 100) : 0;
                  return (
                    <div key={method}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-600">{method}</span>
                        <span className="text-sm font-medium text-gray-900">{formatCurrency(amount)} ({percent}%)</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <p className="text-sm text-gray-400">해당 연도 결제 내역이 없습니다.</p>
          )}
        </div>
      </div>

      {/* Duration breakdown */}
      {Object.keys(revenueData.byDuration).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <h4 className="text-sm font-semibold text-gray-700 mb-4">수업 시간별 매출 (월)</h4>
          <div className="flex flex-wrap gap-4">
            {Object.entries(revenueData.byDuration)
              .sort((a, b) => b[1] - a[1])
              .map(([duration, amount]) => (
                <div key={duration} className="bg-gray-50 rounded-lg px-4 py-3 text-center min-w-[120px]">
                  <div className="text-xs text-gray-500 mb-1">{duration}</div>
                  <div className="text-sm font-bold text-gray-900">{formatCurrency(amount)}</div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Monthly Trend Chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h4 className="text-sm font-semibold text-gray-700 mb-4">월별 매출 추이 (최근 6개월)</h4>
        <div className="flex items-end gap-3 h-48">
          {monthlyTrend.map((m, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
              <div className="text-xs font-medium text-gray-700 mb-1">{formatCurrency(m.total)}</div>
              <div className="w-full flex flex-col justify-end" style={{ height: '70%' }}>
                {m.special > 0 && (
                  <div
                    className={`w-full bg-violet-400 ${m.trial > 0 || m.regular > 0 ? '' : 'rounded-b'} rounded-t`}
                    style={{ height: `${(m.special / maxTrend) * 100}%`, minHeight: 4 }}
                    title={`특강: ${formatCurrency(m.special)}`}
                  />
                )}
                {m.trial > 0 && (
                  <div
                    className={`w-full bg-emerald-400 ${m.special > 0 ? '' : 'rounded-t'} ${m.regular > 0 ? '' : 'rounded-b'}`}
                    style={{ height: `${(m.trial / maxTrend) * 100}%`, minHeight: 4 }}
                    title={`체험: ${formatCurrency(m.trial)}`}
                  />
                )}
                <div
                  className={`w-full bg-indigo-500 ${m.trial > 0 || m.special > 0 ? '' : 'rounded-t'} rounded-b`}
                  style={{ height: `${(m.regular / maxTrend) * 100}%`, minHeight: m.regular > 0 ? 4 : 0 }}
                  title={`정규: ${formatCurrency(m.regular)}`}
                />
              </div>
              <div className="text-xs text-gray-500 mt-2">{m.label}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-4 mt-3 justify-center">
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <div className="w-3 h-3 rounded bg-indigo-500" /> 정규
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <div className="w-3 h-3 rounded bg-emerald-400" /> 체험
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <div className="w-3 h-3 rounded bg-violet-400" /> 특강
          </div>
        </div>
      </div>
    </div>
  );
}
