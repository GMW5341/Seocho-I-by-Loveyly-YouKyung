import { format, parse, addMinutes, isAfter, isBefore, isSameDay, parseISO, eachDayOfInterval } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { DayOfWeek, AcademySettings, Holiday } from '../types';

export const DAY_MAP: Record<DayOfWeek, number> = {
  '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6
};

export const DAYS_OF_WEEK: DayOfWeek[] = ['화', '수', '목', '금', '토'];

export const DEFAULT_SETTINGS: AcademySettings = {
  name: '서초아이미술',
  maxStudentsPerSlot: 6,
  currentSeason: '학기중',
  semesterHours: {
    '화': { start: '13:00', end: '19:30' },
    '수': { start: '13:00', end: '19:30' },
    '목': { start: '13:00', end: '19:30' },
    '금': { start: '13:00', end: '19:30' },
    '토': { start: '10:00', end: '17:00' },
  },
  vacationHours: {
    '화': { start: '10:00', end: '19:30' },
    '수': { start: '10:00', end: '19:30' },
    '목': { start: '10:00', end: '19:30' },
    '금': { start: '10:00', end: '19:30' },
    '토': { start: '10:00', end: '17:00' },
  },
  pricing: {
    60: 150000,
    80: 170000,
    100: 190000,
  },
};

export function getOperatingHours(settings: AcademySettings, day: DayOfWeek): { start: string; end: string } | null {
  const hours = settings.currentSeason === '학기중' ? settings.semesterHours : settings.vacationHours;
  return hours[day] || null;
}

export function generateTimeSlots(startTime: string, endTime: string, intervalMinutes: number = 30): string[] {
  const slots: string[] = [];
  let current = parse(startTime, 'HH:mm', new Date());
  const end = parse(endTime, 'HH:mm', new Date());

  while (isBefore(current, end)) {
    slots.push(format(current, 'HH:mm'));
    current = addMinutes(current, intervalMinutes);
  }
  return slots;
}

export function getEndTime(startTime: string, duration: number): string {
  const start = parse(startTime, 'HH:mm', new Date());
  return format(addMinutes(start, duration), 'HH:mm');
}

export function isTimeOverlapping(
  start1: string, duration1: number,
  start2: string, duration2: number
): boolean {
  const s1 = parse(start1, 'HH:mm', new Date());
  const e1 = addMinutes(s1, duration1);
  const s2 = parse(start2, 'HH:mm', new Date());
  const e2 = addMinutes(s2, duration2);

  return isBefore(s1, e2) && isAfter(e1, s2);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount);
}

export function formatDate(dateStr: string): string {
  return format(parseISO(dateStr), 'yyyy년 MM월 dd일', { locale: ko });
}

export function formatShortDate(dateStr: string): string {
  return format(parseISO(dateStr), 'MM/dd (EEE)', { locale: ko });
}

export function getDayOfWeekFromDate(dateStr: string): DayOfWeek | null {
  const dayNum = parseISO(dateStr).getDay();
  const map: Record<number, DayOfWeek> = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토' };
  return map[dayNum] || null;
}

export function isSameDayCheck(date1: string, date2: string): boolean {
  return isSameDay(parseISO(date1), parseISO(date2));
}

export function getPricePerSession(basePricePer4: number, sessions: number): number {
  const pricePerSession = basePricePer4 / 4;
  return Math.round(pricePerSession * sessions);
}

export function expandHolidayDates(holidays: Holiday[]): string[] {
  const dates: Set<string> = new Set();
  holidays.forEach(h => {
    if (h.endDate && h.endDate > h.date) {
      eachDayOfInterval({ start: parseISO(h.date), end: parseISO(h.endDate) })
        .forEach(d => dates.add(format(d, 'yyyy-MM-dd')));
    } else {
      dates.add(h.date);
    }
  });
  return Array.from(dates);
}

export function calculateNextPaymentDate(
  lastPaymentDate: string,
  totalSessions: number,
  regularSchedule: { day: DayOfWeek; startTime: string }[],
  holidays: string[],
  attendanceRecords: { date: string; status: string }[]
): string | null {
  const regularDays = regularSchedule.map(entry => entry.day);
  if (regularDays.length === 0) return null;

  let sessionsCount = 0;
  const startDate = parseISO(lastPaymentDate);
  let currentDate = new Date(startDate);

  const maxDays = 365;
  for (let i = 0; i < maxDays; i++) {
    currentDate.setDate(currentDate.getDate() + 1);
    const dateStr = format(currentDate, 'yyyy-MM-dd');
    const dayOfWeek = getDayOfWeekFromDate(dateStr);
    const isHoliday = holidays.includes(dateStr);
    const isRegularDay = dayOfWeek && regularDays.includes(dayOfWeek);
    const record = attendanceRecords.find(r => r.date === dateStr);

    let shouldCount = false;

    // 실제 출석/보강 기록이 있으면 (정규일이든 아니든) 세션 소진
    if (record && (record.status === '출석' || record.status === '보강')) {
      shouldCount = true;
    }
    // 미래 정규 수업일: 공휴일이 아니고 출결 기록이 없으면 출석 예측
    else if (!record && isRegularDay && !isHoliday) {
      shouldCount = true;
    }
    // 결석: shouldCount = false → 다음 결제일이 밀림
    // 공휴일(출결 기록 없음): shouldCount = false → 다음 결제일이 밀림

    if (shouldCount) {
      sessionsCount++;
    }

    if (sessionsCount >= totalSessions) {
      // 모든 세션 소진 후 다음 정규 수업일 찾기 (공휴일 제외)
      const nextDate = new Date(currentDate);
      for (let j = 0; j < 60; j++) {
        nextDate.setDate(nextDate.getDate() + 1);
        const nextDateStr = format(nextDate, 'yyyy-MM-dd');
        const nextDay = getDayOfWeekFromDate(nextDateStr);
        const nextIsHoliday = holidays.includes(nextDateStr);
        if (nextDay && regularDays.includes(nextDay) && !nextIsHoliday) {
          return nextDateStr;
        }
      }
    }
  }
  return null;
}

/**
 * 결제 차수 기준 마지막 수업 예정일 계산
 * totalSessions 번째 수업이 일어나는 날짜를 반환
 */
export function calculateLastClassDate(
  startDate: string,
  totalSessions: number,
  regularSchedule: { day: DayOfWeek; startTime: string }[],
  holidays: string[],
  attendanceRecords: { date: string; status: string }[]
): string | null {
  const regularDays = regularSchedule.map(entry => entry.day);
  if (regularDays.length === 0) return null;

  let sessionsCount = 0;
  const start = parseISO(startDate);
  const currentDate = new Date(start);
  // Only count attendance records from startDate onwards
  const relevantAttendance = attendanceRecords.filter(r => r.date >= startDate);

  const maxDays = 365;
  for (let i = 0; i <= maxDays; i++) {
    if (i > 0) {
      currentDate.setDate(currentDate.getDate() + 1);
    }
    const dateStr = format(currentDate, 'yyyy-MM-dd');
    const dayOfWeek = getDayOfWeekFromDate(dateStr);
    const isHoliday = holidays.includes(dateStr);
    const isRegularDay = dayOfWeek && regularDays.includes(dayOfWeek);
    const record = relevantAttendance.find(r => r.date === dateStr);

    let shouldCount = false;

    if (record && (record.status === '출석' || record.status === '보강')) {
      // Count actual attendance (only on regular days or makeup on any day)
      if (isRegularDay || record.status === '보강') {
        shouldCount = true;
      }
    } else if (!record && isRegularDay && !isHoliday) {
      // Predict future regular days
      shouldCount = true;
    }
    // 결석 record on a regular day → don't count (will be made up separately)

    if (shouldCount) {
      sessionsCount++;
    }

    if (sessionsCount >= totalSessions) {
      return dateStr;
    }
  }
  return null;
}

export function getClassLevelColor(level: string): string {
  switch (level) {
    case '유아반': return 'bg-pink-100 text-pink-800 border-pink-300';
    case '초등(저학년)': return 'bg-blue-100 text-blue-800 border-blue-300';
    case '초등(고학년)': return 'bg-green-100 text-green-800 border-green-300';
    default: return 'bg-gray-100 text-gray-800 border-gray-300';
  }
}

export function getDurationColor(duration: number): string {
  switch (duration) {
    case 60: return 'bg-cyan-50 border-cyan-400';
    case 80: return 'bg-pink-50 border-pink-400';
    case 100: return 'bg-amber-50 border-amber-400';
    default: return 'bg-gray-50 border-gray-300';
  }
}

export function getDurationAccent(duration: number): string {
  switch (duration) {
    case 60: return 'bg-cyan-400';
    case 80: return 'bg-pink-400';
    case 100: return 'bg-amber-400';
    default: return 'bg-gray-400';
  }
}

export function getDurationTextColor(duration: number): string {
  switch (duration) {
    case 60: return 'text-cyan-700';
    case 80: return 'text-pink-700';
    case 100: return 'text-amber-700';
    default: return 'text-gray-700';
  }
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

export function layoutSlotsForDay(
  daySlots: { id: string; startTime: string; duration: number }[]
): Map<string, { column: number; numColumns: number }> {
  if (daySlots.length === 0) return new Map();

  // De-duplicate by id (prevent same slot appearing twice)
  const seen = new Set<string>();
  const uniqueSlots = daySlots.filter(s => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });

  const sorted = [...uniqueSlots].sort((a, b) => {
    const diff = timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
    return diff !== 0 ? diff : b.duration - a.duration;
  });

  const placed: Array<{
    id: string;
    column: number;
    startMin: number;
    endMin: number;
  }> = [];

  for (const slot of sorted) {
    const startMin = timeToMinutes(slot.startTime);
    const endMin = startMin + slot.duration;
    let col = 0;
    while (placed.some(p => p.column === col && p.endMin > startMin && p.startMin < endMin)) {
      col++;
    }
    placed.push({ id: slot.id, column: col, startMin, endMin });
  }

  // Build connected overlap groups for consistent numColumns
  const groups: number[][] = [];
  const groupOf = new Map<number, number>(); // index → group index

  for (let i = 0; i < placed.length; i++) {
    let assignedGroup = -1;
    for (let j = 0; j < i; j++) {
      if (placed[j].endMin > placed[i].startMin && placed[j].startMin < placed[i].endMin) {
        const jGroup = groupOf.get(j)!;
        if (assignedGroup === -1) {
          assignedGroup = jGroup;
          groups[jGroup].push(i);
          groupOf.set(i, jGroup);
        } else if (assignedGroup !== jGroup) {
          // Merge groups
          const mergeFrom = Math.max(assignedGroup, jGroup);
          const mergeInto = Math.min(assignedGroup, jGroup);
          for (const idx of groups[mergeFrom]) {
            groupOf.set(idx, mergeInto);
            groups[mergeInto].push(idx);
          }
          groups[mergeFrom] = [];
          assignedGroup = mergeInto;
        }
      }
    }
    if (assignedGroup === -1) {
      assignedGroup = groups.length;
      groups.push([i]);
      groupOf.set(i, assignedGroup);
    }
  }

  const result = new Map<string, { column: number; numColumns: number }>();
  for (let i = 0; i < placed.length; i++) {
    const gIdx = groupOf.get(i)!;
    const groupMembers = groups[gIdx];
    const numColumns = Math.max(...groupMembers.map(idx => placed[idx].column + 1));
    result.set(placed[i].id, { column: placed[i].column, numColumns });
  }

  return result;
}
