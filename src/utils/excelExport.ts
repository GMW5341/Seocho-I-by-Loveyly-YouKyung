import * as XLSX from 'xlsx';
import type { Payment, TrialLesson, SpecialClassStudent, SpecialClass, Student } from '../types';

interface PaymentExportRow {
  구분: string;
  이름: string;
  학년: string;
  수업시간: string;
  결제금액: number;
  할인전금액: number | string;
  할인율: string;
  결제방식: string;
  결제일: string;
  시작일: string;
  총횟수: number | string;
  사용횟수: number | string;
  잔여횟수: number | string;
  상태: string;
  메모: string;
}

/**
 * 결제 관리 내역을 엑셀로 다운로드
 */
export function exportPaymentsToExcel(
  payments: Payment[],
  students: Student[],
  filename?: string,
) {
  const studentMap = new Map(students.map(s => [s.id, s]));

  const rows: PaymentExportRow[] = payments
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
    .map(p => {
      const student = studentMap.get(p.studentId);
      return {
        구분: '정규수업',
        이름: student?.name || '(삭제된 학생)',
        학년: student?.grade || '',
        수업시간: `${p.classDuration}분`,
        결제금액: p.amount,
        할인전금액: p.originalAmount ?? '',
        할인율: p.discountRate ? `${p.discountRate}%` : '',
        결제방식: p.method,
        결제일: p.paidAt,
        시작일: p.startDate,
        총횟수: p.totalSessions,
        사용횟수: p.usedSessions,
        잔여횟수: p.remainingSessions,
        상태: p.completed ? '소진완료' : p.remainingSessions <= 1 ? '임박' : '진행중',
        메모: p.memo || '',
      };
    });

  const ws = XLSX.utils.json_to_sheet(rows);

  // 열 너비 설정
  ws['!cols'] = [
    { wch: 10 }, // 구분
    { wch: 12 }, // 이름
    { wch: 8 },  // 학년
    { wch: 8 },  // 수업시간
    { wch: 14 }, // 결제금액
    { wch: 14 }, // 할인전금액
    { wch: 8 },  // 할인율
    { wch: 12 }, // 결제방식
    { wch: 12 }, // 결제일
    { wch: 12 }, // 시작일
    { wch: 8 },  // 총횟수
    { wch: 8 },  // 사용횟수
    { wch: 8 },  // 잔여횟수
    { wch: 10 }, // 상태
    { wch: 20 }, // 메모
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '결제내역');

  const name = filename || `결제관리_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, name);
}

interface RevenueExportOptions {
  selectedMonth: string; // 'yyyy-MM'
  payments: Payment[];
  trialLessons: TrialLesson[];
  specialClassStudents: SpecialClassStudent[];
  specialClasses: SpecialClass[];
  students: Student[];
  trialStudents: { id: string; name: string; grade: string }[];
}

/**
 * 매출 상세 내역을 엑셀로 다운로드 (월별/연간 시트 포함)
 */
export function exportRevenueToExcel(options: RevenueExportOptions) {
  const {
    selectedMonth,
    payments,
    trialLessons,
    specialClassStudents,
    specialClasses,
    students,
    trialStudents,
  } = options;

  const [year, month] = selectedMonth.split('-').map(Number);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0, 23, 59, 59);
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59);

  const inRange = (dateStr: string, start: Date, end: Date) => {
    const d = new Date(dateStr);
    return d >= start && d <= end;
  };

  const studentMap = new Map(students.map(s => [s.id, s]));
  const trialStudentMap = new Map(trialStudents.map(s => [s.id, s]));
  const specialClassMap = new Map(specialClasses.map(c => [c.id, c]));

  // --- 시트 1: 월별 상세 내역 ---
  const monthRows: Record<string, string | number>[] = [];

  // 정규 수업
  payments
    .filter(p => inRange(p.paidAt, monthStart, monthEnd))
    .sort((a, b) => a.paidAt.localeCompare(b.paidAt))
    .forEach(p => {
      const student = studentMap.get(p.studentId);
      monthRows.push({
        구분: '정규수업',
        이름: student?.name || '(삭제된 학생)',
        학년: student?.grade || '',
        수업시간: `${p.classDuration}분`,
        결제금액: p.amount,
        결제방식: p.method,
        결제일: p.paidAt,
        메모: p.memo || '',
      });
    });

  // 체험 수업
  trialLessons
    .filter(l => l.paid && l.paidAt && inRange(l.paidAt, monthStart, monthEnd))
    .sort((a, b) => (a.paidAt || '').localeCompare(b.paidAt || ''))
    .forEach(l => {
      const ts = trialStudentMap.get(l.trialStudentId);
      monthRows.push({
        구분: '체험수업',
        이름: ts?.name || '(삭제된 학생)',
        학년: ts?.grade || '',
        수업시간: `${l.duration}분`,
        결제금액: l.amount,
        결제방식: l.paymentMethod || '',
        결제일: l.paidAt || '',
        메모: '',
      });
    });

  // 특강
  specialClassStudents
    .filter(s => s.paid && s.paidAt && inRange(s.paidAt, monthStart, monthEnd))
    .sort((a, b) => (a.paidAt || '').localeCompare(b.paidAt || ''))
    .forEach(s => {
      const sc = specialClassMap.get(s.specialClassId);
      monthRows.push({
        구분: `특강(${sc?.name || ''})`,
        이름: s.name,
        학년: s.grade,
        수업시간: sc ? `${sc.duration}분` : '',
        결제금액: s.amount,
        결제방식: s.paymentMethod || '',
        결제일: s.paidAt || '',
        메모: s.memo || '',
      });
    });

  const wsMonth = XLSX.utils.json_to_sheet(monthRows);
  wsMonth['!cols'] = [
    { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 8 },
    { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 20 },
  ];

  // --- 시트 2: 연간 상세 내역 ---
  const yearRows: Record<string, string | number>[] = [];

  payments
    .filter(p => inRange(p.paidAt, yearStart, yearEnd))
    .sort((a, b) => a.paidAt.localeCompare(b.paidAt))
    .forEach(p => {
      const student = studentMap.get(p.studentId);
      yearRows.push({
        월: new Date(p.paidAt).getMonth() + 1,
        구분: '정규수업',
        이름: student?.name || '(삭제된 학생)',
        수업시간: `${p.classDuration}분`,
        결제금액: p.amount,
        결제방식: p.method,
        결제일: p.paidAt,
      });
    });

  trialLessons
    .filter(l => l.paid && l.paidAt && inRange(l.paidAt, yearStart, yearEnd))
    .sort((a, b) => (a.paidAt || '').localeCompare(b.paidAt || ''))
    .forEach(l => {
      const ts = trialStudentMap.get(l.trialStudentId);
      yearRows.push({
        월: new Date(l.paidAt!).getMonth() + 1,
        구분: '체험수업',
        이름: ts?.name || '(삭제된 학생)',
        수업시간: `${l.duration}분`,
        결제금액: l.amount,
        결제방식: l.paymentMethod || '',
        결제일: l.paidAt || '',
      });
    });

  specialClassStudents
    .filter(s => s.paid && s.paidAt && inRange(s.paidAt, yearStart, yearEnd))
    .sort((a, b) => (a.paidAt || '').localeCompare(b.paidAt || ''))
    .forEach(s => {
      const sc = specialClassMap.get(s.specialClassId);
      yearRows.push({
        월: new Date(s.paidAt!).getMonth() + 1,
        구분: `특강(${sc?.name || ''})`,
        이름: s.name,
        수업시간: sc ? `${sc.duration}분` : '',
        결제금액: s.amount,
        결제방식: s.paymentMethod || '',
        결제일: s.paidAt || '',
      });
    });

  const wsYear = XLSX.utils.json_to_sheet(yearRows);
  wsYear['!cols'] = [
    { wch: 4 }, { wch: 14 }, { wch: 12 }, { wch: 8 },
    { wch: 14 }, { wch: 12 }, { wch: 12 },
  ];

  // --- 시트 3: 월별 요약 ---
  const summaryRows: Record<string, string | number>[] = [];
  for (let m = 1; m <= 12; m++) {
    const ms = new Date(year, m - 1, 1);
    const me = new Date(year, m, 0, 23, 59, 59);

    const regularTotal = payments
      .filter(p => inRange(p.paidAt, ms, me))
      .reduce((sum, p) => sum + p.amount, 0);
    const trialTotal = trialLessons
      .filter(l => l.paid && l.paidAt && inRange(l.paidAt, ms, me))
      .reduce((sum, l) => sum + l.amount, 0);
    const specialTotal = specialClassStudents
      .filter(s => s.paid && s.paidAt && inRange(s.paidAt, ms, me))
      .reduce((sum, s) => sum + s.amount, 0);

    summaryRows.push({
      월: `${m}월`,
      정규수업: regularTotal,
      체험수업: trialTotal,
      특강: specialTotal,
      합계: regularTotal + trialTotal + specialTotal,
    });
  }

  // 연합계 행
  const yearTotals = summaryRows.reduce(
    (acc, r) => ({
      정규수업: (acc.정규수업 as number) + (r.정규수업 as number),
      체험수업: (acc.체험수업 as number) + (r.체험수업 as number),
      특강: (acc.특강 as number) + (r.특강 as number),
      합계: (acc.합계 as number) + (r.합계 as number),
    }),
    { 정규수업: 0, 체험수업: 0, 특강: 0, 합계: 0 },
  );
  summaryRows.push({ 월: '합계', ...yearTotals });

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  wsSummary['!cols'] = [
    { wch: 6 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
  ];

  // --- 시트 4: 결제방식별 요약 ---
  const methods = ['계좌이체', '현금', '카드', '온누리상품권', '기타'];
  const methodRows: Record<string, string | number>[] = [];
  for (let m = 1; m <= 12; m++) {
    const ms = new Date(year, m - 1, 1);
    const me = new Date(year, m, 0, 23, 59, 59);
    const row: Record<string, string | number> = { 월: `${m}월` };
    let total = 0;
    methods.forEach(method => {
      const payAmount = payments
        .filter(p => p.method === method && inRange(p.paidAt, ms, me))
        .reduce((sum, p) => sum + p.amount, 0);
      const trialAmount = trialLessons
        .filter(l => l.paid && l.paidAt && l.paymentMethod === method && inRange(l.paidAt, ms, me))
        .reduce((sum, l) => sum + l.amount, 0);
      const specialAmount = specialClassStudents
        .filter(s => s.paid && s.paidAt && s.paymentMethod === method && inRange(s.paidAt, ms, me))
        .reduce((sum, s) => sum + s.amount, 0);
      const v = payAmount + trialAmount + specialAmount;
      row[method] = v;
      total += v;
    });
    row['합계'] = total;
    methodRows.push(row);
  }

  const methodTotals: Record<string, string | number> = { 월: '합계' };
  let grandTotal = 0;
  methods.forEach(method => {
    const t = methodRows.reduce((sum, r) => sum + (r[method] as number), 0);
    methodTotals[method] = t;
    grandTotal += t;
  });
  methodTotals['합계'] = grandTotal;
  methodRows.push(methodTotals);

  const wsMethod = XLSX.utils.json_to_sheet(methodRows);
  wsMethod['!cols'] = [
    { wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 },
  ];

  // --- 워크북 생성 및 다운로드 ---
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsMonth, `${month}월 상세내역`);
  XLSX.utils.book_append_sheet(wb, wsYear, `${year}년 전체내역`);
  XLSX.utils.book_append_sheet(wb, wsSummary, '월별 매출요약');
  XLSX.utils.book_append_sheet(wb, wsMethod, '결제방식별 요약');

  XLSX.writeFile(wb, `매출내역_${selectedMonth}.xlsx`);
}
