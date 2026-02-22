export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  language: 'ko' | 'en';
  holidayCountry: string;   // ISO 3166-1 alpha-2 (예: 'KR', 'US', 'JP')
}

// Google Calendar API가 공휴일을 제공하는 주요 국가 목록
export interface CountryOption {
  code: string;
  nameKo: string;
  nameEn: string;
  calendarId: string; // Google Calendar 공휴일 캘린더 ID
}

export const SUPPORTED_COUNTRIES: CountryOption[] = [
  { code: 'KR', nameKo: '대한민국', nameEn: 'South Korea', calendarId: 'ko.south_korea#holiday@group.v.calendar.google.com' },
  { code: 'US', nameKo: '미국', nameEn: 'United States', calendarId: 'en.usa#holiday@group.v.calendar.google.com' },
  { code: 'JP', nameKo: '일본', nameEn: 'Japan', calendarId: 'ja.japanese#holiday@group.v.calendar.google.com' },
  { code: 'CN', nameKo: '중국', nameEn: 'China', calendarId: 'zh_CN.china#holiday@group.v.calendar.google.com' },
  { code: 'GB', nameKo: '영국', nameEn: 'United Kingdom', calendarId: 'en.uk#holiday@group.v.calendar.google.com' },
  { code: 'DE', nameKo: '독일', nameEn: 'Germany', calendarId: 'de.german#holiday@group.v.calendar.google.com' },
  { code: 'FR', nameKo: '프랑스', nameEn: 'France', calendarId: 'fr.french#holiday@group.v.calendar.google.com' },
  { code: 'CA', nameKo: '캐나다', nameEn: 'Canada', calendarId: 'en.canadian#holiday@group.v.calendar.google.com' },
  { code: 'AU', nameKo: '호주', nameEn: 'Australia', calendarId: 'en.australian#holiday@group.v.calendar.google.com' },
];
