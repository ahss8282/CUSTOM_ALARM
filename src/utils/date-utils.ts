/**
 * date-utils.ts
 * 로컬 타임존 기준 날짜 유틸리티
 *
 * toISOString()은 UTC 기준 날짜를 반환하므로 KST(UTC+9) 환경에서
 * 로컬 날짜와 최대 1일 차이가 발생합니다.
 * 이 파일의 함수를 사용해 항상 로컬 타임존 기준으로 날짜를 처리합니다.
 */

/**
 * 로컬 타임존 기준 'YYYY-MM-DD' 문자열을 반환합니다.
 * toISOString().slice(0, 10) 대신 이 함수를 사용하세요.
 */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 'YYYY-MM-DD' 문자열을 로컬 자정 Date로 파싱합니다.
 * new Date('2026-03-03')은 UTC 자정(= KST 09:00)으로 파싱되므로
 * 반드시 이 함수를 사용해 로컬 자정으로 생성하세요.
 */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}
