import { useMemo } from 'react';
import { format, parseISO, startOfMonth, endOfMonth, subMonths, isWithinInterval, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { ko } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { useAppStore } from '../../store/StoreContext';
import { formatCurrency, getDayOfWeekFromDate } from '../../utils/helpers';
import Badge from '../common/Badge';

const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];

export default function Dashboard() {
  const { students, payments, attendance, schedules } = useAppStore();
  const activeStudents = useMemo(() => students.filter(s => s.active), [students]);

  // Today's schedule
  const todaySchedule = useMemo(() => {
    const today = new Date();
    const dayOfWeek = getDayOfWeekFromDate(format(today, 'yyyy-MM-dd'));
    if (!dayOfWeek) return [];
    return schedules
      .filter(s => s.dayOfWeek === dayOfWeek)
      .map(s => ({
        ...s,
        student: activeStudents.find(st => st.id === s.studentId),
      }))
      .filter(s => s.student)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [schedules, activeStudents]);

  // Monthly revenue chart data (last 6 months)
  const revenueChartData = useMemo(() => {
    const data = [];
    for (let i = 5; i >= 0; i--) {
      const month = subMonths(new Date(), i);
      const start = startOfMonth(month);
      const end = endOfMonth(month);
      const monthPayments = payments.filter(p =>
        isWithinInterval(parseISO(p.paidAt), { start, end })
      );
      data.push({
        month: format(month, 'MM월', { locale: ko }),
        매출: monthPayments.reduce((sum, p) => sum + p.amount, 0),
        건수: monthPayments.length,
      });
    }
    return data;
  }, [payments]);

  // Student level distribution
  const levelDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    activeStudents.forEach(s => {
      counts[s.level] = (counts[s.level] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [activeStudents]);

  // This week attendance
  const weekAttendance = useMemo(() => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: weekStart, end: weekEnd })
      .filter(d => d.getDay() >= 2 && d.getDay() <= 6);

    return days.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayRecords = attendance.filter(r => r.date === dateStr);
      return {
        day: format(day, 'EEE', { locale: ko }),
        출석: dayRecords.filter(r => r.status === '출석').length,
        결석: dayRecords.filter(r => r.status === '결석').length,
        보강: dayRecords.filter(r => r.status === '보강').length,
      };
    });
  }, [attendance]);

  // Key metrics
  const metrics = useMemo(() => {
    const thisMonth = new Date();
    const monthStart = startOfMonth(thisMonth);
    const monthEnd = endOfMonth(thisMonth);

    const monthPayments = payments.filter(p =>
      isWithinInterval(parseISO(p.paidAt), { start: monthStart, end: monthEnd })
    );

    const unpaidStudents = activeStudents.filter(s =>
      !payments.find(p => p.studentId === s.id && !p.completed && p.remainingSessions > 0)
    );

    const expiringPayments = payments.filter(p => !p.completed && p.remainingSessions <= 1);

    const needsMakeup = activeStudents.filter(s => {
      const absences = attendance.filter(r => r.studentId === s.id && r.status === '결석').length;
      const makeups = attendance.filter(r => r.studentId === s.id && r.status === '보강').length;
      return absences > makeups;
    });

    return {
      totalStudents: activeStudents.length,
      monthRevenue: monthPayments.reduce((sum, p) => sum + p.amount, 0),
      monthPaymentCount: monthPayments.length,
      unpaidCount: unpaidStudents.length,
      expiringCount: expiringPayments.length,
      makeupNeeded: needsMakeup.length,
      todayClassCount: todaySchedule.length,
    };
  }, [activeStudents, payments, attendance, todaySchedule]);

  // Upcoming payment alerts
  const upcomingAlerts = useMemo(() => {
    return activeStudents
      .map(student => {
        const activePayment = payments.find(p => p.studentId === student.id && !p.completed && p.remainingSessions > 0);
        return {
          student,
          payment: activePayment,
          remaining: activePayment?.remainingSessions || 0,
        };
      })
      .filter(a => !a.payment || a.remaining <= 2)
      .sort((a, b) => a.remaining - b.remaining)
      .slice(0, 10);
  }, [activeStudents, payments]);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h3 className="text-lg font-bold text-gray-800">대시보드</h3>
        <p className="text-sm text-gray-500">{format(new Date(), 'yyyy년 MM월 dd일 EEEE', { locale: ko })}</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        {[
          { label: '총 원생', value: `${metrics.totalStudents}명`, color: 'text-gray-900' },
          { label: '오늘 수업', value: `${metrics.todayClassCount}건`, color: 'text-indigo-600' },
          { label: '이번달 매출', value: formatCurrency(metrics.monthRevenue), color: 'text-green-600' },
          { label: '결제 건수', value: `${metrics.monthPaymentCount}건`, color: 'text-blue-600' },
          { label: '미결제', value: `${metrics.unpaidCount}명`, color: 'text-red-600' },
          { label: '결제 임박', value: `${metrics.expiringCount}명`, color: 'text-amber-600' },
          { label: '보강 필요', value: `${metrics.makeupNeeded}명`, color: 'text-orange-600' },
        ].map(metric => (
          <div key={metric.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs font-medium text-gray-500 mb-1">{metric.label}</div>
            <div className={`text-lg font-bold ${metric.color}`}>{metric.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Monthly Revenue Chart */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-4">월별 매출 현황</h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={revenueChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${(v / 10000).toFixed(0)}만`} />
              <Tooltip formatter={(value) => formatCurrency(value as number)} />
              <Bar dataKey="매출" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Weekly Attendance Chart */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-4">이번주 출결 현황</h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={weekAttendance}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="출석" fill="#10b981" radius={[2, 2, 0, 0]} />
              <Bar dataKey="결석" fill="#ef4444" radius={[2, 2, 0, 0]} />
              <Bar dataKey="보강" fill="#3b82f6" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Student Level Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-4">반별 원생 분포</h4>
          {levelDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={levelDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}명`}
                >
                  {levelDistribution.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-sm text-gray-400">
              데이터가 없습니다
            </div>
          )}
        </div>

        {/* Today's Schedule */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-4">오늘 수업 일정</h4>
          <div className="space-y-2 max-h-[250px] overflow-y-auto">
            {todaySchedule.length > 0 ? todaySchedule.map(slot => (
              <div key={slot.id} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50">
                <div className="text-xs font-mono text-gray-500 w-12">{slot.startTime}</div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-800">{slot.student?.name}</div>
                  <div className="text-xs text-gray-500">{slot.student?.level} | {slot.duration}분</div>
                </div>
                {!slot.isRegular && <Badge variant="warning">보강</Badge>}
              </div>
            )) : (
              <div className="text-sm text-gray-400 text-center py-8">오늘은 수업이 없습니다</div>
            )}
          </div>
        </div>

        {/* Alerts */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-4">결제 알림</h4>
          <div className="space-y-2 max-h-[250px] overflow-y-auto">
            {upcomingAlerts.length > 0 ? upcomingAlerts.map(alert => (
              <div key={alert.student.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                <div>
                  <div className="text-sm font-medium text-gray-800">{alert.student.name}</div>
                  <div className="text-xs text-gray-500">{alert.student.level}</div>
                </div>
                {alert.payment ? (
                  <Badge variant={alert.remaining <= 1 ? 'danger' : 'warning'}>
                    잔여 {alert.remaining}회
                  </Badge>
                ) : (
                  <Badge variant="danger">미결제</Badge>
                )}
              </div>
            )) : (
              <div className="text-sm text-gray-400 text-center py-8">알림이 없습니다</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
