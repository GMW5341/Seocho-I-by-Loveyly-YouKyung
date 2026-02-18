export type DayOfWeek = '월' | '화' | '수' | '목' | '금' | '토';

export type ClassDuration = 60 | 80 | 100;

export type ClassLevel = '유아반' | '초등(저학년)' | '초등(고학년)';

export type StudentGrade = '6세' | '7세' | '초등1' | '초등2' | '초등3' | '초등4' | '초등5' | '초등6';

export type PaymentMethod = '계좌이체' | '현금' | '카드' | '온누리상품권' | '기타';

export type AttendanceStatus = '출석' | '결석' | '보강' | '예정';

export type SeasonType = '학기중' | '방학중';

export type Gender = '남' | '여';

export interface RegularScheduleEntry {
  day: DayOfWeek;
  startTime: string; // "HH:mm"
}

export interface Student {
  id: string;
  name: string;
  gender?: Gender;
  grade: StudentGrade;
  level: ClassLevel;
  classDuration: ClassDuration;
  sessionsPerWeek: number; // 주 1~5회
  regularSchedule: RegularScheduleEntry[];
  // 하위 호환용 (마이그레이션 후 사용하지 않음)
  regularDays?: DayOfWeek[];
  regularStartTimes?: { [key in DayOfWeek]?: string };
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
  isTrial?: boolean; // 체험 수업 여부
  trialStudentId?: string; // 체험 수업 학생 ID
  date?: string; // ISO date for specific date slots (보강)
  isOverrideHidden?: boolean; // 특정 주에 정규 슬롯을 숨기는 마커
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
  originalAmount?: number; // 할인 전 원래 금액
  discountRate?: number; // 할인율 (%)
  extraDiscounts?: ExtraDiscount[]; // 기타 할인 항목
  totalSessions: number; // 결제한 총 수업 횟수
  usedSessions: number; // 사용한 수업 횟수
  remainingSessions: number; // 남은 수업 횟수
  method: PaymentMethod;
  splitPayments?: SplitPayment[]; // 분할 결제 시 각 방식별 금액
  startDate: string; // 결제 시작일
  paidAt: string; // 결제일
  classDuration: ClassDuration;
  memo: string;
  completed: boolean; // 모든 수업 소진 여부
  lastClassDate?: string; // 마지막 수업일 (과거 기록용)
}

export interface Holiday {
  id: string;
  date: string;
  endDate?: string; // 기간 설정 시 종료일
  name: string;
}

export interface TrialStudent {
  id: string;
  name: string;
  grade: StudentGrade;
  parentPhone: string;
  memo: string;
  createdAt: string;
}

export interface TrialLesson {
  id: string;
  trialStudentId: string;
  dayOfWeek: DayOfWeek;
  startTime: string; // "HH:mm"
  duration: ClassDuration;
  date?: string; // ISO date
  paid: boolean;
  amount: number;
  paidAt?: string;
  paymentMethod?: PaymentMethod;
}

export const TRIAL_PRICING: { [key in ClassDuration]: number } = {
  60: 35000,
  80: 40000,
  100: 45000,
};

export interface CurriculumFile {
  id: string;
  name: string;
  type: 'image' | 'pdf';
  classLevel: ClassLevel;
  order?: number; // higher = more recent/current
  dataUrl: string; // base64 data URL
  createdAt: string;
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

export interface MessageTemplate {
  id: string;
  title: string;
  content: string;
  category: string;
  createdAt: string;
}

export interface SpecialClass {
  id: string;
  name: string; // 수업 이름
  startDate: string;
  endDate: string;
  schedule: { day: DayOfWeek; startTime: string }[];
  duration: number; // 임의 수업 시간 (분)
  maxStudents: number;
  fee: number;
  memo: string;
  active: boolean;
  createdAt: string;
}

export interface ExtraCharge {
  label: string;
  amount: number;
}

export interface ExtraDiscount {
  label: string;
  type: 'rate' | 'fixed'; // rate: 할인율(%), fixed: 할인금액(원)
  value: number;
}

export interface SplitPayment {
  method: PaymentMethod;
  amount: number;
}

export interface SpecialClassStudent {
  id: string;
  specialClassId: string;
  name: string;
  grade: StudentGrade;
  phone: string;
  parentPhone: string;
  paid: boolean;
  amount: number;
  extraCharges?: ExtraCharge[];
  paymentMethod?: PaymentMethod;
  paidAt?: string;
  memo: string;
  createdAt: string;
}

export type TabType = 'curriculum' | 'dashboard' | 'schedule' | 'students' | 'attendance' | 'payments' | 'trial' | 'messages' | 'special' | 'revenue' | 'settings';
