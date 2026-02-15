export type DayOfWeek = '월' | '화' | '수' | '목' | '금' | '토';

export type ClassDuration = 60 | 80 | 100;

export type ClassLevel = '유아반' | '초등(저학년)' | '초등(고학년)';

export type PaymentMethod = '계좌이체' | '현금' | '카드' | '온누리상품권' | '기타';

export type AttendanceStatus = '출석' | '결석' | '보강' | '예정';

export type SeasonType = '학기중' | '방학중';

export interface Student {
  id: string;
  name: string;
  level: ClassLevel;
  classDuration: ClassDuration;
  sessionsPerWeek: number; // 주 1회 or 2회
  regularDays: DayOfWeek[];
  regularStartTime: string; // "HH:mm"
  phone: string;
  parentPhone: string;
  memo: string;
  active: boolean;
  createdAt: string;
}

export interface ScheduleSlot {
  id: string;
  studentId: string;
  dayOfWeek: DayOfWeek;
  startTime: string; // "HH:mm"
  duration: ClassDuration;
  isRegular: boolean; // 정규 vs 보강
  date?: string; // ISO date for specific date slots (보강)
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  date: string; // ISO date
  status: AttendanceStatus;
  scheduleSlotId?: string;
  startTime: string;
  duration: ClassDuration;
  isMakeup: boolean; // 보강 여부
  memo: string;
}

export interface Payment {
  id: string;
  studentId: string;
  amount: number;
  totalSessions: number; // 결제한 총 수업 횟수
  usedSessions: number; // 사용한 수업 횟수
  remainingSessions: number; // 남은 수업 횟수
  method: PaymentMethod;
  startDate: string; // 결제 시작일
  paidAt: string; // 결제일
  classDuration: ClassDuration;
  memo: string;
  completed: boolean; // 모든 수업 소진 여부
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
}

export interface AcademySettings {
  name: string;
  maxStudentsPerSlot: number;
  currentSeason: SeasonType;
  semesterHours: {
    [key in DayOfWeek]?: { start: string; end: string };
  };
  vacationHours: {
    [key in DayOfWeek]?: { start: string; end: string };
  };
  pricing: {
    [key in ClassDuration]: number; // 4회 기준 가격
  };
}

export interface DailyScheduleView {
  time: string;
  slots: (ScheduleSlot & { student: Student })[];
  count: number;
  maxCapacity: number;
}

export type TabType = 'dashboard' | 'schedule' | 'students' | 'attendance' | 'payments' | 'settings';
