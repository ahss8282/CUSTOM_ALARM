import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUPPORTED_COUNTRIES } from '../types/settings';
import { toLocalDateString } from './date-utils';

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_CALENDAR_API_KEY ?? '';

// AsyncStorage 캐시 키 형식: holidays_KR_2026
const cacheKey = (countryCode: string, year: number) =>
  `holidays_${countryCode}_${year}`;

// 캐시 유효 기간: 1년 (밀리초)
// 공휴일 데이터는 연초에 확정되고 연중 변경되지 않으므로 1년이 적절합니다.
// 연도가 바뀌면 캐시 키 자체가 달라지므로(holidays_KR_2026 → holidays_KR_2027)
// 새 연도의 데이터는 항상 새로 가져옵니다.
const CACHE_TTL_MS = 365 * 24 * 60 * 60 * 1000;

type HolidayCache = { dates: string[]; cachedAt: number };

/**
 * 특정 국가·연도의 공휴일 날짜 Set을 반환합니다.
 * 캐시된 데이터가 있으면 그것을 사용하고, 없으면 Google Calendar API를 호출합니다.
 */
export const getHolidays = async (
  countryCode: string,
  year: number
): Promise<Set<string>> => {
  const key = cacheKey(countryCode, year);

  // 캐시 확인 (1년 이내 데이터만 유효)
  let staleCache: Set<string> | null = null;
  try {
    const cached = await AsyncStorage.getItem(key);
    if (cached) {
      const parsed: HolidayCache = JSON.parse(cached);
      // 구형 캐시(string[] 형식)는 cachedAt이 없으므로 만료 처리
      const isExpired = !parsed.cachedAt || Date.now() - parsed.cachedAt > CACHE_TTL_MS;
      if (!isExpired) return new Set(parsed.dates);
      // 만료된 캐시는 API 재호출 후 교체하되,
      // API 실패 시 백그라운드에서도 동작하도록 stale 데이터를 보관
      staleCache = new Set(parsed.dates);
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
    if (!res.ok) return staleCache ?? new Set();

    const data = await res.json();
    const dates: string[] = (data.items ?? [])
      .map((item: { start?: { date?: string } }) => item.start?.date)
      .filter(Boolean) as string[];

    // 연도별 캐시 저장 (fetch 시각 함께 기록)
    const cache: HolidayCache = { dates, cachedAt: Date.now() };
    await AsyncStorage.setItem(key, JSON.stringify(cache));
    return new Set(dates);
  } catch {
    // API 실패 시 만료된 stale 캐시를 fallback으로 사용
    // (백그라운드 실행 중 네트워크 없음 등의 상황 대비)
    return staleCache ?? new Set();
  }
};

/**
 * 주어진 날짜(YYYY-MM-DD)가 공휴일인지 확인합니다.
 */
export const isHoliday = (date: Date, holidays: Set<string>): boolean => {
  const dateStr = toLocalDateString(date);
  return holidays.has(dateStr);
};
