import { useMemo } from 'react';
import { format, parseISO, startOfMonth, endOfMonth, subMonths, isWithinInterval, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { ko } from 'date-fns/locale';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { useAppStore } from '../../store/StoreContext';
import { formatCurrency, getDayOfWeekFromDate, expandHolidayDates } from '../../utils/helpers';
import Badge from '../common/Badge';
const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];

const DAILY_QUOTES = [
  { text: '아이들의 그림 한 장에는 세상을 바꿀 힘이 있습니다.', author: '' },
  { text: '예술은 가르치는 것이 아니라, 발견하게 하는 것입니다.', author: '' },
  { text: '오늘도 아이들의 눈빛에서 가능성을 만나는 하루가 되길.', author: '' },
  { text: '창의력은 실수를 두려워하지 않는 곳에서 자랍니다.', author: '' },
  { text: '매일의 작은 가르침이 아이의 평생을 빛나게 합니다.', author: '' },
  { text: '좋은 선생님은 아이에게 날개를 달아주는 사람입니다.', author: '' },
  { text: '그림을 그리는 아이는 자기만의 세상을 만들고 있는 중입니다.', author: '' },
  { text: '모든 아이는 예술가입니다. 문제는 어른이 되어서도 예술가로 남는 것이죠.', author: '파블로 피카소' },
  { text: '색칠하는 손끝에서 아이의 마음이 피어납니다.', author: '' },
  { text: '교육은 양동이를 채우는 것이 아니라, 불을 지피는 것입니다.', author: '윌리엄 버틀러 예이츠' },
  { text: '오늘 한 아이가 그린 선 하나가 내일의 걸작이 됩니다.', author: '' },
  { text: '가르침의 보람은 아이들의 성장 속에 있습니다.', author: '' },
  { text: '예술을 통해 아이들은 자기 감정을 표현하는 법을 배웁니다.', author: '' },
  { text: '완벽한 그림보다 즐거운 과정이 더 중요합니다.', author: '' },
  { text: '선생님의 따뜻한 말 한마디가 아이의 자신감이 됩니다.', author: '' },
  { text: '미술은 정답이 없는 유일한 수업입니다.', author: '' },
  { text: '아이의 상상력에는 한계가 없습니다.', author: '' },
  { text: '오늘의 수업이 아이에게 평생의 추억이 될 수 있습니다.', author: '' },
  { text: '붓을 드는 순간, 아이는 자유를 배웁니다.', author: '' },
  { text: '가르치는 일은 세상에서 가장 아름다운 예술입니다.', author: '' },
  { text: '미술 교육은 눈에 보이지 않는 성장을 만듭니다.', author: '' },
  { text: '아이들과 함께하는 매 순간이 선물입니다.', author: '' },
  { text: '한 아이의 웃음이 하루의 피로를 녹입니다.', author: '' },
  { text: '열정은 전염됩니다. 선생님이 즐거우면 아이도 즐겁습니다.', author: '' },
  { text: '어떤 색이든 아이가 선택한 색이 가장 좋은 색입니다.', author: '' },
  { text: '작은 칭찬이 큰 예술가를 만듭니다.', author: '' },
  { text: '그림은 말로 표현할 수 없는 것을 보여주는 언어입니다.', author: '' },
  { text: '오늘도 최선을 다하는 당신을 응원합니다.', author: '' },
  { text: '아이에게 그림을 가르치는 것은 세상을 보는 눈을 키워주는 것입니다.', author: '' },
  { text: '진정한 교육자는 아이의 가능성을 믿어주는 사람입니다.', author: '' },
  { text: '하루하루 쌓인 정성이 결국 큰 차이를 만듭니다.', author: '' },
];

export default function Dashboard() {
  const { students, payments, attendance, holidays } = useAppStore();
  const activeStudents = useMemo(() => students.filter(s => s.active), [students]);

  // Check if today is a holiday
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const holidayDates = useMemo(() => expandHolidayDates(holidays), [holidays]);
  const isTodayHoliday = holidayDates.includes(todayStr);
  const todayHolidayName = useMemo(() => {
    for (const h of holidays) {
      if (h.endDate) {
        if (todayStr >= h.date && todayStr <= h.endDate) return h.name;
      } else if (h.date === todayStr) {
        return h.name;
      }
    }
    return null;
  }, [holidays, todayStr]);

  // Today's schedule - derived from active payments (+ unpaid fallback)
  const todaySchedule = useMemo(() => {
    if (isTodayHoliday) return [];
    const today = new Date();
    const dayOfWeek = getDayOfWeekFromDate(format(today, 'yyyy-MM-dd'));
    if (!dayOfWeek) return [];
    const slots: { id: string; studentId: string; startTime: string; duration: number; isRegular: boolean; isUnpaid?: boolean; student?: typeof activeStudents[0] }[] = [];
    activeStudents.forEach(student => {
      const activePayment = payments.find(p => p.studentId === student.id && !p.completed && p.remainingSessions > 0);
      const payment = activePayment || payments
        .filter(p => p.studentId === student.id && p.completed && p.regularSchedule?.length)
        .sort((a, b) => b.paidAt.localeCompare(a.paidAt))[0];
      if (payment?.regularSchedule?.length) {
        payment.regularSchedule
          .filter(entry => entry.day === dayOfWeek)
          .forEach((entry, i) => {
            slots.push({
              id: `today-${payment.id}-${i}`,
              studentId: student.id,
              startTime: entry.startTime,
              duration: payment.classDuration,
              isRegular: true,
              isUnpaid: !activePayment,
              student,
            });
          });
      }
    });
    return slots.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [activeStudents, payments, isTodayHoliday]);

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
    }).map(s => {
      const absences = attendance.filter(r => r.studentId === s.id && r.status === '결석').length;
      const makeups = attendance.filter(r => r.studentId === s.id && r.status === '보강').length;
      return { student: s, pending: absences - makeups };
    });

    return {
      totalStudents: activeStudents.length,
      monthRevenue: monthPayments.reduce((sum, p) => sum + p.amount, 0),
      monthPaymentCount: monthPayments.length,
      unpaidCount: unpaidStudents.length,
      expiringCount: expiringPayments.length,
      makeupNeeded: needsMakeup.length,
      makeupStudents: needsMakeup,
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
      .sort((a, b) => a.remaining - b.remaining);
  }, [activeStudents, payments]);

  // Daily quote - based on day of year, skip holidays/weekends
  const dailyQuote = useMemo(() => {
    if (isTodayHoliday) return null;
    const today = new Date();
    const dayOfWeek = today.getDay();
    // 일(0), 월(1) = 휴원
    if (dayOfWeek === 0 || dayOfWeek === 1) return null;
    const startOfYear = new Date(today.getFullYear(), 0, 0);
    const diff = today.getTime() - startOfYear.getTime();
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
    return DAILY_QUOTES[dayOfYear % DAILY_QUOTES.length];
  }, [isTodayHoliday]);

  return (
    <div className="p-3 md:p-6">
      <div className="mb-4 md:mb-6">
        <h3 className="text-lg font-bold text-gray-800">대시보드</h3>
        <p className="text-sm text-gray-500">{format(new Date(), 'yyyy년 MM월 dd일 EEEE', { locale: ko })}</p>
        {dailyQuote && (
          <p className="mt-2 text-sm text-indigo-600 italic">
            &ldquo;{dailyQuote.text}&rdquo;
            {dailyQuote.author && <span className="text-indigo-400 not-italic"> &mdash; {dailyQuote.author}</span>}
          </p>
        )}
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 md:gap-3 mb-4 md:mb-6">
        {[
          { label: '총 원생', value: `${metrics.totalStudents}명`, color: 'text-gray-900' },
          { label: '오늘 수업', value: isTodayHoliday ? '휴원' : `${metrics.todayClassCount}건`, color: isTodayHoliday ? 'text-red-500' : 'text-indigo-600' },
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
            <BarChart data={revenueChartData} margin={{ top: 5, right: 5, bottom: 0, left: 5 }}>
              <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} dy={8} />
              <Tooltip
                formatter={(value) => formatCurrency(value as number)}
                contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 13 }}
                cursor={{ fill: 'rgba(99,102,241,0.08)' }}
              />
              <Bar dataKey="매출" fill="#6366f1" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Weekly Attendance Chart */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-gray-700">이번주 출결 현황</h4>
            <div className="flex items-center gap-3">
              {[
                { label: '출석', color: '#10b981' },
                { label: '결석', color: '#ef4444' },
                { label: '보강', color: '#3b82f6' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-xs text-gray-500">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={weekAttendance} margin={{ top: 5, right: 5, bottom: 0, left: 5 }}>
              <XAxis dataKey="day" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} dy={8} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 13 }}
                cursor={{ fill: 'rgba(99,102,241,0.08)' }}
              />
              <Bar dataKey="출석" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="결석" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Bar dataKey="보강" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Student Level Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-4">반별 원생 분포</h4>
          {levelDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={levelDistribution}
                  cx="50%"
                  cy="45%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {levelDistribution.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <text x="50%" y="45%" textAnchor="middle" dominantBaseline="central">
                  <tspan x="50%" dy="-8" fontSize="20" fontWeight="bold" fill="#1f2937">
                    {metrics.totalStudents}
                  </tspan>
                  <tspan x="50%" dy="20" fontSize="11" fill="#9ca3af">
                    총 원생
                  </tspan>
                </text>
                <Tooltip formatter={(value) => `${value}명`} contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 13 }} />
                <Legend
                  verticalAlign="bottom"
                  formatter={(value, _entry) => {
                    const item = levelDistribution.find(d => d.name === value);
                    return `${value}: ${item?.value || 0}명`;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-sm text-gray-400">
              데이터가 없습니다
            </div>
          )}
        </div>

        {/* Makeup Needed Students */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-4">
            보강 필요 원생
            {metrics.makeupStudents.length > 0 && (
              <span className="ml-2 text-xs font-normal text-orange-600">
                {metrics.makeupStudents.length}명
              </span>
            )}
          </h4>
          <div className="space-y-2 max-h-[250px] overflow-y-auto">
            {metrics.makeupStudents.length > 0 ? metrics.makeupStudents
              .sort((a, b) => b.pending - a.pending)
              .map(item => (
              <div key={item.student.id} className="flex items-center justify-between p-2 rounded-lg bg-orange-50">
                <div>
                  <div className="text-sm font-medium text-gray-800">{item.student.name}</div>
                  <div className="text-xs text-gray-500">
                    {item.student.level} | {(() => {
                      const p = payments.find(pay => pay.studentId === item.student.id && !pay.completed && pay.remainingSessions > 0);
                      return (p?.regularSchedule || []).map(entry => `${entry.day} ${entry.startTime}`).join(', ') || '-';
                    })()}
                  </div>
                </div>
                <Badge variant="warning">보강 {item.pending}회</Badge>
              </div>
            )) : (
              <div className="text-sm text-gray-400 text-center py-8">보강이 필요한 원생이 없습니다</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Schedule */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-4">오늘 수업 일정</h4>
          <div className="space-y-2 max-h-[250px] overflow-y-auto">
            {isTodayHoliday ? (
              <div className="text-center py-8">
                <div className="text-red-400 text-2xl mb-2">휴원</div>
                <div className="text-sm font-semibold text-red-500">{todayHolidayName}</div>
                <div className="text-xs text-red-400 mt-1">오늘은 공휴일/휴원일입니다</div>
              </div>
            ) : todaySchedule.length > 0 ? todaySchedule.map(slot => (
              <div key={slot.id} className={`flex items-center gap-3 p-2 rounded-lg ${slot.isUnpaid ? 'bg-red-50 border border-red-200' : 'bg-gray-50'}`}>
                <div className="text-xs font-mono text-gray-500 w-12">{slot.startTime}</div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-800">{slot.student?.name}</div>
                  <div className="text-xs text-gray-500">{slot.student?.level} | {slot.duration}분</div>
                </div>
                {slot.isUnpaid && <Badge variant="danger">미결제</Badge>}
                {!slot.isRegular && !slot.isUnpaid && <Badge variant="warning">보강</Badge>}
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
