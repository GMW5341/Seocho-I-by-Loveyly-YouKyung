import { useState, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAppStore } from '../../store/StoreContext';
import type { Payment } from '../../types';
import { formatCurrency } from '../../utils/helpers';
import { exportPaymentsToExcel } from '../../utils/excelExport';
import Modal from '../common/Modal';
import Badge from '../common/Badge';
import PaymentForm from './PaymentForm';
import BatchPaymentForm from './BatchPaymentForm';

export default function PaymentManager() {
  const { students, payments, addPayment, addBatchPayment, updatePayment, deletePayment, settings } = useAppStore();
  const [showForm, setShowForm] = useState(false);
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [showPastForm, setShowPastForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | undefined>();
  const [filterView, setFilterView] = useState<'active' | 'all' | 'unpaid'>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [showHistory, setShowHistory] = useState(true);

  const activeStudents = useMemo(() => students.filter(s => s.active), [students]);

  // Payment status per student
  const studentPaymentData = useMemo(() => {
    return activeStudents.map(student => {
      const studentPayments = payments.filter(p => p.studentId === student.id);
      const activePayment = studentPayments.find(p => !p.completed && p.remainingSessions > 0);
      const lastPayment = studentPayments
        .filter(p => p.completed || p.remainingSessions === 0)
        .sort((a, b) => b.paidAt.localeCompare(a.paidAt))[0];

      return {
        student,
        activePayment,
        lastPayment,
        allPayments: studentPayments,
        hasPayment: !!activePayment,
        isExpiring: activePayment ? activePayment.remainingSessions <= 1 : false,
      };
    });
  }, [activeStudents, payments]);

  const filteredData = useMemo(() => {
    let result = studentPaymentData;
    if (searchQuery) {
      result = result.filter(d => d.student.name.includes(searchQuery));
    }
    switch (filterView) {
      case 'unpaid': return result.filter(d => !d.hasPayment);
      case 'active': return result.filter(d => d.hasPayment);
      default: return result;
    }
  }, [studentPaymentData, filterView, searchQuery]);

  // All payment records for history view
  const paymentHistory = useMemo(() => {
    const allRecords = payments.map(p => {
      const student = students.find(s => s.id === p.studentId);
      return {
        payment: p,
        studentName: student?.name || '(삭제된 원생)',
        studentLevel: student?.level || '',
      };
    });
    let filtered = allRecords;
    if (historySearchQuery) {
      filtered = filtered.filter(r => r.studentName.includes(historySearchQuery));
    }
    return filtered.sort((a, b) => b.payment.paidAt.localeCompare(a.payment.paidAt));
  }, [payments, students, historySearchQuery]);

  const handleAddPayment = (data: Omit<Payment, 'id' | 'usedSessions' | 'remainingSessions' | 'completed'> & { isPastRecord?: boolean }) => {
    const { isPastRecord, ...paymentData } = data;
    const newPayment = addPayment(paymentData);
    if (isPastRecord) {
      updatePayment(newPayment.id, {
        usedSessions: paymentData.totalSessions,
        remainingSessions: 0,
        completed: true,
      });
    }
    // Schedule slots are now independent; addPayment links them automatically
    setShowForm(false);
    setShowPastForm(false);
  };

  const handleEditPayment = (data: Omit<Payment, 'id' | 'usedSessions' | 'remainingSessions' | 'completed'>) => {
    if (editingPayment) {
      // For completed/past records, keep them completed but update usedSessions to match
      if (editingPayment.completed) {
        updatePayment(editingPayment.id, {
          ...data,
          usedSessions: data.totalSessions,
          remainingSessions: 0,
          completed: true,
        });
      } else {
        const newRemaining = Math.max(0, data.totalSessions - editingPayment.usedSessions);
        updatePayment(editingPayment.id, {
          ...data,
          remainingSessions: newRemaining,
          completed: newRemaining <= 0,
        });
      }
      setEditingPayment(undefined);
    }
  };

  return (
    <div className="p-3 md:p-6">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h3 className="text-lg font-bold text-gray-800">결제 관리</h3>
        <div className="flex gap-2">
          <button
            onClick={() => exportPaymentsToExcel(payments, students)}
            className="border border-emerald-300 text-emerald-700 bg-emerald-50 px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-100"
          >
            엑셀 다운로드
          </button>
          <button
            onClick={() => setShowPastForm(true)}
            className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            + 과거 기록
          </button>
          <button
            onClick={() => setShowBatchForm(true)}
            className="border border-indigo-300 text-indigo-700 bg-indigo-50 px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-100"
          >
            + 묶음 결제
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            + 결제 등록
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="text-sm font-medium text-gray-500 mb-1">결제 중</h4>
          <div className="text-xl font-bold text-emerald-600">
            {studentPaymentData.filter(d => d.hasPayment).length}명
          </div>
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

      {/* Filter */}
      <div className="flex gap-2 mb-4 items-center">
        <div className="relative">
          <input
            type="text"
            placeholder="이름 검색..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            autoComplete="off"
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-36 md:w-44 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
            >
              &times;
            </button>
          )}
        </div>
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
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">수업 시작일</th>
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
                  {data.activePayment?.classDuration || 60}분
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
                  {data.activePayment?.splitPayments?.length ? (
                    <span title={data.activePayment.splitPayments.map(sp => `${sp.method} ${formatCurrency(sp.amount)}`).join(' / ')}>
                      {data.activePayment.splitPayments.map(sp => sp.method).join('+')}
                    </span>
                  ) : (
                    data.activePayment?.method || '-'
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {data.activePayment ? format(parseISO(data.activePayment.paidAt), 'MM/dd', { locale: ko }) : '-'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {data.activePayment ? format(parseISO(data.activePayment.startDate), 'MM/dd', { locale: ko }) : '-'}
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

      {/* Payment History */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-bold text-gray-800">결제 내역</h3>
            <span className="text-sm text-gray-500">{paymentHistory.length}건</span>
          </div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-sm text-gray-500 hover:text-gray-700 font-medium"
          >
            {showHistory ? '접기' : '펼치기'}
          </button>
        </div>
        {showHistory && (
          <>
            <div className="mb-3">
              <div className="relative inline-block">
                <input
                  type="text"
                  placeholder="이름 검색..."
                  value={historySearchQuery}
                  onChange={e => setHistorySearchQuery(e.target.value)}
                  autoComplete="off"
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-36 md:w-44 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                {historySearchQuery && (
                  <button
                    onClick={() => setHistorySearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                  >
                    &times;
                  </button>
                )}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">원생</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">수업</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">금액</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">차감</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">상태</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">결제방식</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">결제일</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">수업 시작일</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">메모</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paymentHistory.map(({ payment: p, studentName, studentLevel }, histIdx) => {
                    // Batch grouping: check if this is part of a group
                    const groupId = p.transactionGroupId;
                    const groupPayments = groupId
                      ? paymentHistory.filter(h => h.payment.transactionGroupId === groupId)
                      : null;
                    const isFirstInGroup = groupPayments
                      ? paymentHistory.findIndex(h => h.payment.transactionGroupId === groupId) === histIdx
                      : false;
                    const groupTotal = groupPayments
                      ? groupPayments.reduce((sum, h) => sum + h.payment.amount, 0)
                      : 0;

                    return (
                    <tr key={p.id} className={`hover:bg-gray-50 ${p.completed ? 'bg-gray-50/50' : ''} ${groupId ? 'border-l-2 border-l-indigo-300' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">
                          {studentName}
                          {groupId && isFirstInGroup && (
                            <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-700">
                              묶음 {groupPayments!.length}명 · {formatCurrency(groupTotal)}
                            </span>
                          )}
                        </div>
                        {studentLevel && <div className="text-xs text-gray-500">{studentLevel}</div>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{p.classDuration}분</td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                        {formatCurrency(p.amount)}
                        {p.discountRate ? (
                          <span className="text-xs text-orange-500 ml-1">({p.discountRate}%↓)</span>
                        ) : null}
                        {p.extraDiscounts && p.extraDiscounts.length > 0 && (
                          <span className="text-xs text-orange-500 ml-1" title={p.extraDiscounts.map(d => `${d.label}: ${d.type === 'rate' ? `${d.value}%` : formatCurrency(d.value)}`).join(', ')}>
                            (+기타할인)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-gray-900">
                            {p.remainingSessions}/{p.totalSessions}회
                          </span>
                          <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                            <div
                              className={`h-1.5 rounded-full ${p.completed ? 'bg-gray-400' : p.remainingSessions <= 1 ? 'bg-red-500' : 'bg-indigo-500'}`}
                              style={{ width: `${Math.round((p.usedSessions / p.totalSessions) * 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400 mt-0.5">
                            {p.usedSessions}회 차감
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {p.completed ? (
                          <Badge variant={p.memo?.includes('[과거 기록]') ? 'default' : 'success'}>
                            {p.memo?.includes('[과거 기록]') ? '과거기록' : '완료'}
                          </Badge>
                        ) : p.remainingSessions <= 1 ? (
                          <Badge variant="warning">잔여 {p.remainingSessions}회</Badge>
                        ) : (
                          <Badge variant="success">진행중</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {p.splitPayments?.length ? (
                          <span title={p.splitPayments.map(sp => `${sp.method} ${formatCurrency(sp.amount)}`).join(' / ')}>
                            {p.splitPayments.map(sp => sp.method).join('+')}
                          </span>
                        ) : p.method}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {format(parseISO(p.paidAt), 'yyyy.MM.dd', { locale: ko })}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {format(parseISO(p.startDate), 'yyyy.MM.dd', { locale: ko })}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 max-w-[120px] truncate" title={p.memo || ''}>
                        {p.memo || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingPayment(p)}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`${studentName}님의 결제 기록을 삭제하시겠습니까?`)) {
                                deletePayment(p.id);
                              }
                            }}
                            className="text-xs text-red-500 hover:text-red-700 font-medium"
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                  {paymentHistory.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-sm text-gray-400">
                        결제 내역이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Add Payment Modal */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="결제 등록" size="lg">
        <PaymentForm
          students={activeStudents}
          settings={settings}
          payments={payments}
          onSubmit={handleAddPayment}
          onCancel={() => setShowForm(false)}
        />
      </Modal>

      {/* Edit Payment Modal */}
      <Modal isOpen={!!editingPayment} onClose={() => setEditingPayment(undefined)} title="결제 수정" size="lg">
        {editingPayment && (
          <PaymentForm
            students={students}
            settings={settings}
            payments={payments}
            payment={editingPayment}
            onSubmit={handleEditPayment}
            onCancel={() => setEditingPayment(undefined)}
          />
        )}
      </Modal>

      {/* Past Payment Modal */}
      <Modal isOpen={showPastForm} onClose={() => setShowPastForm(false)} title="과거 결제 기록" size="lg">
        <PaymentForm
          students={activeStudents}
          settings={settings}
          payments={payments}
          isPastMode
          onSubmit={handleAddPayment}
          onCancel={() => setShowPastForm(false)}
        />
      </Modal>

      {/* Batch Payment Modal */}
      <Modal isOpen={showBatchForm} onClose={() => setShowBatchForm(false)} title="묶음 결제 등록" size="lg">
        <BatchPaymentForm
          students={activeStudents}
          settings={settings}
          payments={payments}
          onSubmit={(entries) => {
            addBatchPayment(entries);
            setShowBatchForm(false);
          }}
          onCancel={() => setShowBatchForm(false)}
        />
      </Modal>
    </div>
  );
}
