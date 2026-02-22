# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

React Native(Expo) 기반 iOS/Android 알람 & 타이머 앱입니다. Expo SDK 54, React Native 0.81.5, Expo Router v6 파일 기반 라우팅을 사용합니다.

## 주요 명령어

```bash
# 개발 서버 시작
npx expo start

# 플랫폼별 실행
npx expo start --android
npx expo start --ios

# 린트 검사
npx expo lint

# 프로젝트 초기화 (app 디렉토리 내용을 기본값으로 리셋)
node ./scripts/reset-project.js
```

> **중요**: 알람 정확도 테스트는 Expo Go가 아닌 EAS Build를 통한 실제 빌드에서 진행해야 합니다.

## 앱 아키텍처

### 네비게이션 구조

Expo Router의 파일 기반 라우팅을 사용합니다. 최종 목표 구조는 아래와 같습니다.

```
app/
  _layout.tsx          # 루트 레이아웃 (ThemeProvider, Stack Navigator)
  modal.tsx            # 모달 화면
  (tabs)/
    _layout.tsx        # 하단 탭 네비게이터 (알람 | 타이머 | 설정)
    index.tsx          # 알람 목록 화면 (AlarmListScreen)
    timer.tsx          # 타이머 화면 (TimerScreen)
    settings.tsx       # 설정 화면 (SettingsScreen)
  alarm/
    [id].tsx           # 알람 추가/편집 화면 (AlarmEditScreen)
  alarm-ringing.tsx    # 알람 울림 전체화면 오버레이
```

### 구현해야 할 디렉토리 구조 (미구현 상태)

```
src/
  store/               # Zustand 상태 관리 (알람, 타이머, 설정)
  locales/             # i18n 번역 파일 (ko.json, en.json)
  utils/               # 알람 스케줄 계산, 공휴일 API 유틸
  hooks/               # 커스텀 훅
components/            # 재사용 가능한 UI 컴포넌트
constants/
  theme.ts             # Colors(light/dark), Fonts 정의
```

### 현재 구현 상태

- 기본 Expo 프로젝트 구조만 존재 (탭 2개: index, explore)
- `constants/theme.ts`에 `Colors`, `Fonts` 정의됨
- `hooks/use-color-scheme.ts`, `hooks/use-theme-color.ts` 존재
- `components/` 에 기본 컴포넌트들 존재 (ThemedText, ThemedView 등)

## 핵심 기술 스택 (구현 예정)

| 역할 | 라이브러리 |
|------|-----------|
| 상태 관리 | Zustand 또는 Redux Toolkit |
| 로컬 저장소 | AsyncStorage |
| 알림/알람 트리거 | expo-notifications |
| 오디오 | expo-av |
| i18n | i18next + react-i18next |
| 날짜 처리 | date-fns 또는 dayjs |
| 공휴일 | Google Calendar API |
| 이미지 선택 | expo-image-picker |
| 백그라운드 타이머 | expo-task-manager + expo-background-fetch |

현재 package.json에는 위 라이브러리들이 아직 추가되지 않았습니다. 기능 구현 시 설치가 필요합니다.

## 데이터 모델

### Alarm

```typescript
interface Alarm {
  id: string;                        // UUID
  name: string;                      // 최대 20자
  hour: number;                      // 0-23
  minute: number;                    // 0-59
  isEnabled: boolean;
  scheduleType: 'weekly' | 'calendar';
  weekdays?: number[];               // 0=일, 1=월 ... 6=토
  calendarDates?: string[];          // ISO date strings
  repeatEvery?: { value: number; unit: 'week' | 'month' };
  excludeHolidays: boolean;
  soundId: string;
  volume: number;                    // 0-100
  vibration: boolean;
  snooze: {
    enabled: boolean;
    intervalMinutes: number;         // 1/3/5/10/15/30
    maxCount: number;                // -1 = 무제한
    enforced: boolean;               // true시 수학 문제 풀기 후 해제
  };
  background: {
    type: 'color' | 'image';
    value: string;                   // hex color 또는 image URI
  };
  createdAt: string;
  updatedAt: string;
}
```

### AppSettings

```typescript
interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  language: 'ko' | 'en';
  holidayCountry: string;            // ISO 3166-1 alpha-2 (예: 'KR', 'US')
}
```

AsyncStorage 키: `theme`, `language`, `holidayCountry`, `holidays_{countryCode}_{year}`

## 디자인 가이드

`design_guide/stitch/` 폴더의 HTML/PNG 파일을 참고하여 UI를 구현합니다.

| 파일명 | 해당 화면 |
|--------|---------|
| `alarm_list_dashboard` | 알람 목록 화면 |
| `edit_alarm_settings_1` | 알람 추가/편집 (요일제 모드) |
| `edit_alarm_settings_2` | 알람 추가/편집 (캘린더 모드) |
| `workout_timer_mode_1` | 운동 타이머 화면 |
| `workout_timer_mode_2` | 일반 타이머 화면 |
| `incoming_alarm_overlay` | 알람 울림 화면 (다시 울림 강화) |
| `app_settings_overview` | 설정 화면 |

## 구현 우선순위 (MVP → 고도화)

- **Phase 1 (MVP)**: 알람 목록/추가(시간+요일제)/ON-OFF 토글, 일반 타이머, expo-notifications 알림, 설정 화면(다크모드+언어)
- **Phase 2**: 캘린더제, 공휴일 제외, 알람음, 진동, Snooze, 운동 타이머, Google Calendar API
- **Phase 3**: 알람 배경, Snooze 강화(수학문제), Android Exact Alarm

## 주요 구현 주의사항

- **Android 알람 정확도**: Android 12+에서 `USE_EXACT_ALARM` 권한 필요. `AlarmManager(Exact)` 필요
- **iOS 백그라운드**: Local Notification으로 스케줄 등록 방식 사용 (앱이 꺼져 있어도 동작)
- **공휴일 API Key**: `expo-constants`의 `extra` 필드 또는 `.env`로 관리, 소스코드에 직접 노출 금지
- **초기 언어 감지**: `expo-localization`의 `getLocales()`로 감지, 언어 코드 `'ko'`로 시작하면 한국어, 그 외 영어
- **i18n 번역 파일 위치**: `/src/locales/ko.json`, `/src/locales/en.json`
- **테마**: React Navigation의 `DarkTheme`/`DefaultTheme` + 커스텀 ThemeContext(또는 Zustand 슬라이스) 조합으로 구현
