import { useState, useMemo } from 'react';
import { format, parseISO, startOfMonth, endOfMonth, startOfYear, endOfYear, isWithinInterval } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAppStore } from '../../store/StoreContext';
import type { Payment } from '../../types';
import { formatCurrency, calculateNextPaymentDate } from '../../utils/helpers';
import Modal from '../common/Modal';
import Badge from '../common/Badge';
import PaymentForm from './PaymentForm';

export default function PaymentManager() {
  const { students, payments, addPayment, updatePayment, deletePayment, attendance, holidays, settings } = useAppStore();
  const [showForm, setShowForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | undefined>();
  const [filterView, setFilterView] = useState<'active' | 'all' | 'unpaid'>('active');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));

  const activeStudents = useMemo(() => students.filter(s => s.active), [students]);

  // Payment status per student
  const studentPaymentData = useMemo(() => {
    return activeStudents.map(student => {
      const studentPayments = payments.filter(p => p.studentId === student.id);
      const activePayment = studentPayments.find(p => !p.completed && p.remainingSessions > 0);
      const lastPayment = studentPayments
        .filter(p => p.completed || p.remainingSessions === 0)
        .sort((a, b) => b.paidAt.localeCompare(a.paidAt))[0];

      // Calculate next payment date
      let nextPaymentDate: string | null = null;
      if (activePayment) {
        const holidayDates = holidays.map(h => h.date);
        const studentAttendance = attendance
          .filter(r => r.studentId === student.id)
          .map(r => ({ date: r.date, status: r.status }));
        nextPaymentDate = calculateNextPaymentDate(
          activePayment.startDate,
          activePayment.totalSessions,
          student.regularSchedule || [],
          holidayDates,
          studentAttendance
        );
      }

      return {
        student,
        activePayment,
        lastPayment,
        allPayments: studentPayments,
        nextPaymentDate,
        hasPayment: !!activePayment,
        isExpiring: activePayment ? activePayment.remainingSessions <= 1 : false,
      };
    });
  }, [activeStudents, payments, attendance, holidays]);

  // Monthly/yearly revenue
  const monthlyRevenue = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const monthStart = startOfMonth(new Date(year, month - 1));
    const monthEnd = endOfMonth(monthStart);
    const yearStart = startOfYear(monthStart);
    const yearEnd = endOfYear(monthStart);

    const monthPayments = payments.filter(p => {
      const date = parseISO(p.paidAt);
      return isWithinInterval(date, { start: monthStart, end: monthEnd });
    });
    const yearPayments = payments.filter(p => {
      const date = parseISO(p.paidAt);
      return isWithinInterval(date, { start: yearStart, end: yearEnd });
    });

    const byMethod: Record<string, number> = {};
    monthPayments.forEach(p => {
      byMethod[p.method] = (byMethod[p.method] || 0) + p.amount;
    });

    return {
      monthTotal: monthPayments.reduce((sum, p) => sum + p.amount, 0),
      monthCount: monthPayments.length,
      yearTotal: yearPayments.reduce((sum, p) => sum + p.amount, 0),
      yearCount: yearPayments.length,
      byMethod,
      monthPayments,
    };
  }, [payments, selectedMonth]);

  const filteredData = useMemo(() => {
    switch (filterView) {
      case 'unpaid': return studentPaymentData.filter(d => !d.hasPayment);
      case 'active': return studentPaymentData.filter(d => d.hasPayment);
      default: return studentPaymentData;
    }
  }, [studentPaymentData, filterView]);

  const handleAddPayment = (data: Omit<Payment, 'id' | 'usedSessions' | 'remainingSessions' | 'completed'>) => {
    addPayment(data);
    setShowForm(false);
  };

  const handleEditPayment = (data: Omit<Payment, 'id' | 'usedSessions' | 'remainingSessions' | 'completed'>) => {
    if (editingPayment) {
      updatePayment(editingPayment.id, data);
      setEditingPayment(undefined);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-gray-800">결제 관리</h3>
        <button
          onClick={() => setShowForm(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
        >
          + 결제 등록
        </button>
      </div>

      {/* Revenue Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-sm font-medium text-gray-500">월 매출</h4>
            <input
              type="month"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="text-xs border border-gray-200 rounded px-1 py-0.5"
            />
          </div>
          <div className="text-xl font-bold text-gray-900">{formatCurrency(monthlyRevenue.monthTotal)}</div>
          <div className="text-xs text-gray-500">{monthlyRevenue.monthCount}건</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="text-sm font-medium text-gray-500 mb-1">연 매출</h4>
          <div className="text-xl font-bold text-gray-900">{formatCurrency(monthlyRevenue.yearTotal)}</div>
          <div className="text-xs text-gray-500">{monthlyRevenue.yearCount}건</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="text-sm font-medium text-gray-500 mb-1">미결제 원생</h4>
          <div className="text-xl font-bold text-red-600">
            {studentPaymentData.filter(d => !d.hasPayment).length}명
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="text-sm font-medium text-gray-500 mb-1">결제 임박 (1회 이하)</h4>
          <div className="text-xl font-bold text-amber-600">
            {studentPaymentData.filter(d => d.isExpiring).length}명
          </div>
        </div>
      </div>

      {/* Payment method breakdown */}
      {Object.keys(monthlyRevenue.byMethod).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <h4 className="text-sm font-medium text-gray-500 mb-3">결제 방식별 내역 ({selectedMonth})</h4>
          <div className="flex flex-wrap gap-4">
            {Object.entries(monthlyRevenue.byMethod).map(([method, amount]) => (
              <div key={method} className="flex items-center gap-2">
                <Badge variant="info">{method}</Badge>
                <span className="text-sm font-medium text-gray-700">{formatCurrency(amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {[
          { value: 'active' as const, label: '결제 중' },
          { value: 'unpaid' as const, label: '미결제' },
          { value: 'all' as const, label: '전체' },
        ].map(f => (
          <button
            key={f.value}
            onClick={() => setFilterView(f.value)}
            className={`px-3 py-1 rounded-lg text-sm font-medium border ${
              filterView === f.value ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Payment Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">원생</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">수업</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">금액</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">횟수</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">잔여</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">결제방식</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">결제일</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">다음 결제 예정</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredData.map(data => (
              <tr key={data.student.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="text-sm font-medium text-gray-900">{data.student.name}</div>
                  <div className="text-xs text-gray-500">{data.student.level}</div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {data.activePayment?.classDuration || data.student.classDuration}분
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                  {data.activePayment ? formatCurrency(data.activePayment.amount) : '-'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {data.activePayment ? `${data.activePayment.usedSessions}/${data.activePayment.totalSessions}회` : '-'}
                </td>
                <td className="px-4 py-3">
                  {data.activePayment ? (
                    <Badge variant={data.activePayment.remainingSessions <= 1 ? 'danger' : data.activePayment.remainingSessions <= 2 ? 'warning' : 'success'}>
                      {data.activePayment.remainingSessions}회
                    </Badge>
                  ) : (
                    <Badge variant="danger">미결제</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {data.activePayment?.method || '-'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {data.activePayment ? format(parseISO(data.activePayment.paidAt), 'MM/dd', { locale: ko }) : '-'}
                </td>
                <td className="px-4 py-3 text-sm">
                  {data.nextPaymentDate ? (
                    <span className={`font-medium ${
                      parseISO(data.nextPaymentDate) <= new Date() ? 'text-red-600' : 'text-gray-700'
                    }`}>
                      {format(parseISO(data.nextPaymentDate), 'MM/dd (EEE)', { locale: ko })}
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {data.activePayment ? (
                      <>
                        <button
                          onClick={() => setEditingPayment(data.activePayment)}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`${data.student.name}님의 결제를 취소하시겠습니까?`)) {
                              deletePayment(data.activePayment!.id);
                            }
                          }}
                          className="text-xs text-red-500 hover:text-red-700 font-medium"
                        >
                          취소
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => {
                          setShowForm(true);
                        }}
                        className="text-xs text-green-600 hover:text-green-800 font-medium"
                      >
                        결제등록
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filteredData.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-400">
                  결제 데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Payment Modal */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="결제 등록" size="lg">
        <PaymentForm
          students={activeStudents}
          settings={settings}
          onSubmit={handleAddPayment}
          onCancel={() => setShowForm(false)}
        />
      </Modal>

      {/* Edit Payment Modal */}
      <Modal isOpen={!!editingPayment} onClose={() => setEditingPayment(undefined)} title="결제 수정" size="lg">
        {editingPayment && (
          <PaymentForm
            students={activeStudents}
            settings={settings}
            payment={editingPayment}
            onSubmit={handleEditPayment}
            onCancel={() => setEditingPayment(undefined)}
          />
        )}
      </Modal>
    </div>
  );
}
