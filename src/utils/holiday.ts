import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUPPORTED_COUNTRIES } from '../types/settings';

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_CALENDAR_API_KEY ?? '';

// AsyncStorage 캐시 키 형식: holidays_KR_2026
const cacheKey = (countryCode: string, year: number) =>
  `holidays_${countryCode}_${year}`;

/**
 * 특정 국가·연도의 공휴일 날짜 Set을 반환합니다.
 * 캐시된 데이터가 있으면 그것을 사용하고, 없으면 Google Calendar API를 호출합니다.
 */
export const getHolidays = async (
  countryCode: string,
  year: number
): Promise<Set<string>> => {
  const key = cacheKey(countryCode, year);

  // 캐시 확인
  try {
    const cached = await AsyncStorage.getItem(key);
    if (cached) {
      const dates: string[] = JSON.parse(cached);
      return new Set(dates);
    }
  } catch {
    // 캐시 읽기 실패 시 API 호출로 진행
  }

  // API Key 없으면 빈 Set 반환
  if (!API_KEY) return new Set();

  const country = SUPPORTED_COUNTRIES.find((c) => c.code === countryCode);
  if (!country) return new Set();

  try {
    const calendarId = encodeURIComponent(country.calendarId);
    const timeMin = `${year}-01-01T00:00:00Z`;
    const timeMax = `${year}-12-31T23:59:59Z`;
    const url =
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events` +
      `?key=${API_KEY}&timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`;

    const res = await fetch(url);
    if (!res.ok) return new Set();

    const data = await res.json();
    const dates: string[] = (data.items ?? [])
      .map((item: { start?: { date?: string } }) => item.start?.date)
      .filter(Boolean) as string[];

    // 연도별 캐시 저장
    await AsyncStorage.setItem(key, JSON.stringify(dates));
    return new Set(dates);
  } catch {
    return new Set();
  }
};

/**
 * 주어진 날짜(YYYY-MM-DD)가 공휴일인지 확인합니다.
 */
export const isHoliday = (date: Date, holidays: Set<string>): boolean => {
  const dateStr = date.toISOString().slice(0, 10);
  return holidays.has(dateStr);
};
