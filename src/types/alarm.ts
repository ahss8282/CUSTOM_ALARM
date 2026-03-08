export interface SnoozeSettings {
  enabled: boolean;
  intervalMinutes: number;  // 1 | 3 | 5 | 10 | 15 | 30
  maxCount: number;         // -1 = 무제한
  enforced: boolean;        // true 시 수학 문제 풀기 후 해제
}

export interface Alarm {
  id: string;
  name: string;
  hour: number;             // 0-23
  minute: number;           // 0-59
  isEnabled: boolean;

  // 스케줄 타입
  scheduleType: 'weekly' | 'calendar';
  weekdays: number[];       // 0=일, 1=월 ... 6=토 (weekly 모드, 빈 배열=한 번만)
  calendarDates: string[];  // ISO date strings (calendar 모드)
  repeatEvery?: { value: number; unit: 'week' | 'month' }; // calendar 반복 주기

  // 공휴일/주말 제외
  excludeHolidays: boolean;
  excludeWeekends: boolean;

  // 캘린더 반복 주기에서 반복 일자 제외 (반복 주기 날짜 대신 나머지 날에 알람)
  excludeRepeatDates: boolean;

  // 알람음
  soundId: string;          // 'default' | 'bell' | 'digital' | 'gentle'
  volume: number;           // 0-100

  // 진동
  vibration: boolean;

  // 스누즈
  snooze: SnoozeSettings;

  // 배경 (Phase 3)
  background?: {
    type: 'color' | 'image';
    value: string;  // hex color 또는 image URI
  };

  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_SNOOZE: SnoozeSettings = {
  enabled: true,
  intervalMinutes: 5,
  maxCount: 3,
  enforced: false,
};

export const DEFAULT_ALARM: Omit<Alarm, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  hour: 7,
  minute: 0,
  isEnabled: true,
  scheduleType: 'weekly',
  weekdays: [],
  calendarDates: [],
  excludeHolidays: false,
  excludeWeekends: false,
  excludeRepeatDates: false,
  soundId: 'default',
  volume: 80,
  vibration: true,
  snooze: DEFAULT_SNOOZE,
};
