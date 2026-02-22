# ALARM APP
## 모바일 알람 앱 기획서
*React Native / Expo 기반 iOS · Android 알람 & 타이머 앱*

| 구분 | 내용 |
|------|------|
| 프레임워크 | React Native (Expo) |
| 지원 플랫폼 | iOS / Android |
| 주요 기능 | 알람 관리, 타이머 (일반 모드 / 운동 모드), 앱 설정 |
| 문서 버전 | v1.1 |
| 작성 목적 | AI 바이브코딩 참조용 기획서 |

---

## 1. 프로젝트 개요

본 문서는 React Native(Expo) 기반의 모바일 알람 앱 개발을 위한 기획서입니다. iOS와 Android 모두에서 동작하며, 알람 설정 및 타이머 기능을 핵심으로 합니다. AI 바이브코딩에 활용 가능한 수준의 상세 스펙을 포함합니다.

### 1.1 기술 스택

| 구분 | 기술/라이브러리 | 용도 |
|------|---------------|------|
| 프레임워크 | React Native + Expo SDK | 크로스플랫폼 앱 개발 |
| 상태관리 | Zustand 또는 Redux Toolkit | 알람/타이머 전역 상태 |
| 로컬 저장소 | AsyncStorage / Expo SecureStore | 알람 데이터 영속성 |
| 알림 | expo-notifications | 알람 트리거 및 푸시 알림 |
| 오디오 | expo-av | 알람음 재생 |
| 진동 | expo-haptics | 진동 피드백 |
| 네비게이션 | React Navigation v6 | 화면 전환 |
| 날짜 처리 | date-fns / dayjs | 알람 시각 계산 |
| UI 컴포넌트 | React Native Paper 또는 NativeWind | UI 스타일링 |
| 지역화 | expo-localization | 기기 언어/지역 코드 감지 |
| 국제화(i18n) | i18next + react-i18next | 다국어(한국어/영어) 지원 |

### 1.2 앱 구조 (네비게이션)

앱은 하단 탭 네비게이터(Bottom Tab Navigator)를 기반으로 세 개의 주요 메뉴로 구성됩니다.

- **알람 탭 (Alarm Tab)**
  - 알람 목록 화면 (AlarmListScreen)
  - 알람 추가/편집 화면 (AlarmEditScreen) — Stack Navigator로 연결
- **타이머 탭 (Timer Tab)**
  - 타이머 메인 화면 (TimerScreen)
- **설정 탭 (Settings Tab)**
  - 설정 메인 화면 (SettingsScreen)

---

## 2. 알람 기능

### 2.1 알람 목록 화면 (AlarmListScreen)

알람 탭 진입 시 기본으로 보여지는 화면입니다.

#### 2.1.1 다음 알람 배너

화면 상단에 고정 배너 형태로 가장 빠르게 울릴 알람을 표시합니다.

- 표시 형식: `"{알람 이름}이(가) N시간 N분 뒤 울립니다."`
- 활성화된 알람이 없을 경우: `'설정된 알람이 없습니다.'` 표시
- 알람까지 24시간 이내: `'N분 뒤'`, 24시간 이상: `'N일 N시간 뒤'` 형식

#### 2.1.2 알람 추가 버튼

- 우측 하단 FAB(Floating Action Button) 또는 상단 우측 `+` 버튼
- 누르면 AlarmEditScreen으로 Stack Push

#### 2.1.3 알람 목록 아이템

각 알람은 카드 형태로 표시되며, 다음 정보를 포함합니다.

| 요소 | 설명 | 비고 |
|------|------|------|
| 알람 이름 | 사용자가 지정한 알람 명칭 | 최대 20자 |
| 알람 시각 | HH:mm 형식으로 크게 표시 | 24시간/12시간 설정 반영 |
| 울리는 날짜 | 요일제: 월화수목금토일 / 커스텀: 날짜 요약 | 비활성 요일은 흐리게 |
| 설정 옵션 뱃지 | 진동, 다시울림, 공휴일제외 등 ON된 것만 표시 | 아이콘+텍스트 |
| ON/OFF 토글 | 스위치 형태로 알람 활성화 여부 제어 | 토글 시 즉시 반영 |

- 알람 아이템 좌우 스와이프 → 삭제 액션 노출
- 알람 아이템 탭 → AlarmEditScreen으로 이동(수정 모드)

### 2.2 알람 추가/편집 화면 (AlarmEditScreen)

알람의 세부 설정을 구성하는 화면입니다. 스크롤 가능한 단일 화면으로 구성하며, 하단에 저장 버튼을 배치합니다.

#### 2.2.1 시간 설정

- 드럼롤(Drum Roll) 방식의 시/분 피커
- iOS: DateTimePicker(mode='time') 스타일 참고
- Android: 커스텀 스크롤 피커 구현 (TimePickerModal 활용)
- 12시간/24시간 포맷 전환 옵션

#### 2.2.2 동작 일정 설정

알람이 반복될 스케줄을 설정합니다. 3가지 모드 중 하나를 선택합니다.

**모드 1 — 요일제**

- 7개의 요일 칩(월/화/수/목/금/토/일)을 토글 선택
- 선택된 요일마다 매주 반복
- 아무 요일도 선택 안 하면 '한 번만' 울리고 자동 비활성화

**모드 2 — 캘린더제**

- 월별 캘린더 UI로 날짜를 복수 선택
- 기준 날짜 설정 후 주기 설정 가능:
  - N주마다 반복 (1~52주)
  - N개월마다 반복 (1~12개월)
- 선택된 날짜들이 하이라이트로 표시

**모드 3 — 공통 옵션: 공휴일 제외**

- 요일제/캘린더제 모두에 적용 가능한 토글 옵션
- 공휴일에 해당하는 날은 알람 스킵
- 공휴일 데이터: 설정에서 선택한 국가의 공휴일을 Google Calendar API로 획득 (섹션 8.3 참고)
- 공휴일 데이터는 앱 업데이트 또는 원격 fetch로 갱신

#### 2.2.3 알람음 설정

- 사전 제공 알람음 목록에서 선택 (expo-av로 미리 듣기 가능)
- 선택 시 짧게 미리 재생
- 시스템 기본음 포함
- 볼륨 슬라이더 (0~100%)

#### 2.2.4 진동 설정

- ON/OFF 토글 스위치
- ON 시: expo-haptics로 진동 패턴 실행

#### 2.2.5 다시 울림(Snooze) 설정

| 옵션 | 기본값 | 설정 범위 |
|------|--------|----------|
| 다시 울림 ON/OFF | ON | 토글 |
| 몇 분 뒤 다시 울림 | 5분 | 1분 / 3분 / 5분 / 10분 / 15분 / 30분 |
| 최대 반복 횟수 | 3회 | 1~10회 또는 무제한 |
| 다시 울림 끄기 강화 | OFF | ON 시 문제 풀기 또는 QR 스캔 등 후 해제 |

- '다시 울림 끄기 강화' ON 시: 간단한 수학 문제(덧셈/뺄셈) 정답 입력 후 스누즈 종료

#### 2.2.6 알람 배경

- 알람 울릴 때 표시될 배경 설정
- 기본 컬러 팔레트 (솔리드 컬러 선택)
- 갤러리에서 이미지 선택 (expo-image-picker)
- 선택된 배경은 알람 목록 아이템에도 소형 썸네일로 미리보기

---

## 3. 타이머 기능

타이머 탭에서 접근하며, 상단 토글 버튼으로 일반 모드와 운동 모드를 전환합니다.

### 3.1 공통 UI

- 상단 세그먼트 컨트롤(Segment Control): '일반 모드' | '운동 모드' 전환
- 모드 전환 시 현재 진행 중인 타이머는 정지 후 초기화

### 3.2 일반 모드

단일 카운트다운 타이머를 설정하고 실행합니다.

#### 3.2.1 시간 설정

- 드럼롤 피커: 시(0~23) / 분(0~59) / 초(0~59) 개별 선택
- 최대 설정 가능: 23시간 59분 59초

#### 3.2.2 타이머 컨트롤

| 버튼 | 동작 |
|------|------|
| 시작 | 카운트다운 시작. 백그라운드에서도 동작 (expo-task-manager 활용) |
| 일시정지 | 타이머 일시정지. 재개 버튼으로 전환 |
| 재개 | 일시정지된 타이머 재시작 |
| 취소 | 타이머 초기화 및 설정 화면으로 복귀 |

#### 3.2.3 종료 알람

- 설정 시간 도달 시 알람음 재생 + 진동 (사용자 설정 반영)
- 화면에 '타이머 종료' 알림 모달 표시
- 알림 모달에서 '확인' 누르면 초기화

### 3.3 운동 모드

여러 개의 타이머를 순차적으로 실행하여 세트 운동을 지원합니다.

#### 3.3.1 타이머 목록 구성

- 최대 10개의 타이머 슬롯 추가 가능
- 각 슬롯: 시/분/초 설정 + 레이블(운동명, 휴식 등) 입력
- 드래그 앤 드롭으로 순서 변경
- 슬롯 우측 삭제 버튼
- `+` 버튼으로 슬롯 추가 (10개 초과 시 비활성화)

#### 3.3.2 운동 모드 실행 로직

'시작' 버튼을 누르면 첫 번째 타이머부터 순차 실행됩니다.

- 각 타이머 종료 시: 짧은 알람음(비프음) 재생 → 즉시 다음 타이머 시작
- 마지막 타이머 종료 시: 긴 알람음 재생 + '운동 완료' 모달 표시
- 현재 몇 번째 타이머인지 진행 표시 (예: 2 / 4)
- 각 타이머 남은 시간 크게 표시
- 알람 사이 간격이 없으므로 알람음은 0.5~1초의 짧은 사운드 사용
- 백그라운드 실행: expo-task-manager + expo-background-fetch 활용

| 단계 | 동작 | 사운드 |
|------|------|--------|
| 타이머 N 종료 | 즉시 타이머 N+1 시작 | 짧은 비프음 (0.5~1초) |
| 마지막 타이머 종료 | '운동 완료' 모달 표시 | 완료 알람음 (3초) |
| 사용자가 '확인' 탭 | 타이머 목록 화면으로 초기화 | 없음 |

---

## 4. 설정 기능 (Settings)

설정 탭(Settings Tab)에서 접근하는 화면으로, 앱 전반의 동작 방식을 사용자가 직접 제어할 수 있습니다. 설정값은 AsyncStorage에 저장되어 앱 재실행 후에도 유지됩니다.

### 4.1 설정 화면 구성 (SettingsScreen)

설정 항목은 그룹별로 섹션을 나누어 표시하며, 각 항목은 레이블 + 컨트롤(토글/선택지/드롭다운) 형태로 구성합니다.

| 섹션 | 항목 | 컨트롤 유형 |
|------|------|------------|
| 화면 | 다크 모드 / 라이트 모드 | 세그먼트 또는 드롭다운 |
| 언어 | 언어 선택 (한국어 / 영어) | 드롭다운(Picker) |
| 공휴일 | 공휴일 국가 선택 | 드롭다운(Picker) |
| 정보 | 앱 버전 / 오픈소스 라이선스 | 텍스트 / 탭으로 이동 |

### 4.2 다크 모드 / 라이트 모드

#### 4.2.1 기능 설명

- 앱 전체 색상 테마를 다크 모드 또는 라이트 모드로 전환합니다.
- 선택지: `'라이트'`, `'다크'`, `'시스템 설정 따름'` (3가지 옵션)
  - '시스템 설정 따름'은 단말기의 OS 다크모드 설정을 자동 반영 (`useColorScheme` 훅 활용)
- 선택 즉시 앱 전체에 테마가 적용되며, 별도 재시작 불필요
- 초기 기본값: `'시스템 설정 따름'`

#### 4.2.2 구현 참고사항

- React Navigation의 `DarkTheme` / `DefaultTheme`을 활용하여 네비게이션 바 테마 통일
- 커스텀 `ThemeContext`(또는 Zustand 슬라이스)로 앱 전역에 테마 값 공유
- NativeWind 사용 시 `dark:` 접두사 클래스로 다크 모드 스타일 적용
- 선택값은 AsyncStorage에 `'theme'` 키로 저장 (`'light' | 'dark' | 'system'`)

### 4.3 언어 변경

#### 4.3.1 지원 언어

| 언어 | 코드 | 비고 |
|------|------|------|
| 한국어 | ko | 기본 언어 (단말기 언어가 한국어인 경우) |
| 영어 | en | 기본 언어 (단말기 언어가 한국어가 아닌 경우) |

#### 4.3.2 초기 언어 감지 로직

- `expo-localization`의 `Localization.locale` 또는 `Localization.getLocales()`를 사용하여 단말기 언어 코드를 가져옵니다.
- 언어 코드가 `'ko'` 또는 `'ko-KR'`로 시작하면 초기값을 한국어(`ko`)로 설정합니다.
- 그 외 모든 언어 코드는 초기값을 영어(`en`)로 설정합니다.
- 최초 앱 설치 시 한 번만 감지하며, 이후에는 AsyncStorage에 저장된 사용자 선택값을 우선 적용합니다.

```typescript
import * as Localization from 'expo-localization';

const getInitialLanguage = () => {
  const locales = Localization.getLocales();
  const languageCode = locales[0]?.languageCode ?? 'en';
  return languageCode.startsWith('ko') ? 'ko' : 'en';
};
```

#### 4.3.3 구현 참고사항

- 국제화 라이브러리: `i18next` + `react-i18next` 사용
- 번역 파일은 `/locales/ko.json` 및 `/locales/en.json`으로 관리
- 언어 변경 즉시 적용 (`i18n.changeLanguage()` 호출), 재시작 불필요
- 선택값은 AsyncStorage에 `'language'` 키로 저장 (`'ko' | 'en'`)
- 날짜/시간 포맷도 언어에 맞춰 변경 (date-fns의 `locale` 파라미터 활용)

### 4.4 공휴일 국가 선택

#### 4.4.1 기능 설명

- 알람의 '공휴일 제외' 기능에 사용할 국가를 설정합니다.
- 지원 국가는 Google Calendar API에서 공휴일 캘린더를 제공하는 국가로 제한됩니다.
- 국가 목록은 드롭다운(Picker) 형태로 표시하며, 국가명은 현재 설정된 언어로 표시합니다.

#### 4.4.2 초기 국가 코드 감지 로직

- 위치 권한(Location Permission)을 요청하지 않습니다.
- `expo-localization`의 `Localization.getLocales()`를 통해 단말기의 지역(Region) 코드를 가져옵니다.
- 지역 코드를 정상적으로 가져온 경우: 해당 코드를 초기 공휴일 국가로 설정합니다. (예: `'KR'`, `'US'`, `'JP'`)
- 지역 코드를 가져오지 못한 경우: 기본값 `'KR'`(대한민국)로 설정합니다.
- 최초 앱 설치 시 한 번만 감지하며, 이후에는 AsyncStorage에 저장된 사용자 선택값을 우선 적용합니다.

```typescript
import * as Localization from 'expo-localization';

const getInitialRegion = () => {
  const locales = Localization.getLocales();
  const regionCode = locales[0]?.regionCode;
  return regionCode ?? 'KR';
};
```

#### 4.4.3 Google Calendar API 연동

- Google Calendar API의 공휴일 캘린더를 사용하여 선택된 국가의 공휴일 목록을 가져옵니다.
- 캘린더 ID 형식: `{언어코드}.{국가코드}#holiday@group.v.calendar.google.com`
  - 예시 (한국): `ko.south_korea#holiday@group.v.calendar.google.com`
  - 예시 (미국): `en.usa#holiday@group.v.calendar.google.com`
- API 호출 시점: 앱 시작 시 + 국가 변경 시 + 새해 첫 실행 시
- 가져온 공휴일 데이터는 AsyncStorage에 연도별로 캐싱하여 불필요한 API 호출을 최소화합니다.
- API 호출 실패 시: 캐시된 이전 데이터를 사용하며, 캐시도 없을 경우 공휴일 제외 기능을 비활성화하고 사용자에게 안내 메시지를 표시합니다.

| 항목 | 내용 |
|------|------|
| API 엔드포인트 | `https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events` |
| 인증 방식 | Google API Key (제한된 도메인/번들 ID로 제한 설정 권장) |
| 요청 파라미터 | `timeMin`, `timeMax` (연도 범위), `singleEvents=true`, `orderBy=startTime` |
| 응답 필드 | `summary`(공휴일명), `start.date`(날짜), 필요 시 `description` |
| 캐시 키 | `holidays_{countryCode}_{year}` (AsyncStorage) |
| 캐시 갱신 주기 | 연 1회 (1월 1일 이후 첫 실행 시 자동 갱신) |

#### 4.4.4 구현 참고사항

- Google Cloud Console에서 Calendar API 활성화 및 API Key 발급 필요
- API Key는 `expo-constants`의 `extra` 필드 또는 환경 변수(`.env`)로 관리하며, 소스코드에 직접 노출 금지
- 선택값은 AsyncStorage에 `'holidayCountry'` 키로 저장 (ISO 3166-1 alpha-2 국가 코드)
- 지원 국가 목록은 앱에 하드코딩하거나 별도 JSON 파일로 관리 (Google Calendar API가 지원하는 국가 기준)

### 4.5 설정 데이터 구조

```typescript
interface AppSettings {
  theme: 'light' | 'dark' | 'system';  // 다크/라이트 모드
  language: 'ko' | 'en';               // 앱 언어
  holidayCountry: string;              // ISO 3166-1 alpha-2 국가 코드 (예: 'KR', 'US')
}

const defaultSettings: AppSettings = {
  theme: 'system',
  language: getInitialLanguage(),    // expo-localization 기반 감지
  holidayCountry: getInitialRegion(), // expo-localization 기반 감지, 기본값 'KR'
};
```

---

## 5. 데이터 모델

### 5.1 Alarm 데이터 구조

AsyncStorage에 JSON 형태로 저장됩니다.

```typescript
interface Alarm {
  id: string;                        // UUID
  name: string;                      // 알람 이름
  hour: number;                      // 0-23
  minute: number;                    // 0-59
  isEnabled: boolean;                // ON/OFF
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
    intervalMinutes: number;
    maxCount: number;                // -1 = 무제한
    enforced: boolean;
  };
  background: {
    type: 'color' | 'image';
    value: string;                   // hex color 또는 image URI
  };
  createdAt: string;
  updatedAt: string;
}
```

### 5.2 Timer 데이터 구조

```typescript
interface TimerSlot {
  id: string;
  label: string;                     // 슬롯 이름 (예: '운동', '휴식')
  hours: number;
  minutes: number;
  seconds: number;
}

interface TimerState {
  mode: 'normal' | 'workout';
  normal: { hours: number; minutes: number; seconds: number };
  workout: TimerSlot[];
  status: 'idle' | 'running' | 'paused' | 'finished';
  currentSlotIndex: number;          // 운동 모드 전용
  remainingSeconds: number;
}
```

---

## 6. 화면 흐름 및 UX 가이드

### 6.1 화면 구성 요약

| 화면명 | 라우트 | 진입 경로 |
|--------|--------|----------|
| 알람 목록 | AlarmList | 하단 탭 '알람' |
| 알람 추가/편집 | AlarmEdit | 목록 '+' 버튼 / 아이템 탭 |
| 타이머 | Timer | 하단 탭 '타이머' |
| 설정 | Settings | 하단 탭 '설정' |
| 알람 울림 화면 | AlarmRinging | 알람 트리거 시 전체화면 오버레이 |

### 6.2 알람 울림 화면

- 알람 울리면 설정된 배경으로 전체화면 표시
- 알람 이름 + 현재 시각 크게 표시
- '끄기' 버튼: 다시울림 강화가 설정된 경우 문제 풀기 UI 표시 후 종료
- '다시 울림' 버튼: 스누즈 설정에 따라 N분 뒤 재알림, 최대 횟수 초과 시 버튼 숨김

### 6.3 권한 처리

| 권한 | 용도 | 요청 시점 |
|------|------|----------|
| 알림(Notification) | 알람/타이머 푸시 알림 | 앱 최초 실행 |
| 갤러리(MediaLibrary) | 알람 배경 이미지 선택 | 배경 이미지 선택 시 |
| 배터리 최적화 제외(Android) | 백그라운드 정확한 알람 | 앱 최초 실행 안내 |

> ※ 공휴일 국가 감지는 `expo-localization`을 활용하여 위치 권한(Location Permission) 없이 처리합니다.

---

## 7. 구현 우선순위 (MVP → 고도화)

| Phase | 기능 | 우선도 |
|-------|------|--------|
| Phase 1 (MVP) | 알람 목록 UI, 알람 추가(시간+요일제), ON/OFF 토글 | 필수 |
| Phase 1 (MVP) | 일반 타이머 (시/분/초 카운트다운) | 필수 |
| Phase 1 (MVP) | expo-notifications로 정시 알림 | 필수 |
| Phase 1 (MVP) | 설정 화면 기본 구조, 다크/라이트 모드, 언어 설정 | 필수 |
| Phase 2 | 캘린더제, 공휴일 제외, 알람음 선택, 진동 | 중요 |
| Phase 2 | 다시울림(Snooze), 운동 타이머 | 중요 |
| Phase 2 | 공휴일 국가 선택 (Google Calendar API 연동) | 중요 |
| Phase 3 | 알람 배경, 다시울림 강화(수학문제) | 선택 |
| Phase 3 | 백그라운드 정확한 알람(Android Exact Alarm) | 선택 |

---

## 8. 주요 구현 참고사항

### 8.1 알람 정확도 (Android)

- Android 12+ : `USE_EXACT_ALARM` 권한 필요
- `expo-notifications`의 `scheduleNotificationAsync` 사용
- 백그라운드 킬 시에도 알람이 울리려면 `AlarmManager(Exact)` 필요
- Expo Go에서는 제한 있음 → 실제 빌드(EAS Build) 후 테스트 권장

### 8.2 iOS 알람 제한

- iOS는 백그라운드 실행이 엄격히 제한됨
- Local Notification으로 스케줄 등록 → 알람 시각에 시스템이 트리거
- 앱이 꺼져 있어도 등록된 Notification은 동작
- 운동 타이머 중간 알람: 앱 실행 중일 때는 in-app, 백그라운드는 Local Notification

### 8.3 Google Calendar API 공휴일 데이터

- Google Cloud Console에서 Calendar API 활성화 및 API Key 발급 필요
- 캘린더 ID는 국가별로 다르며, 지원 국가 목록은 Google Calendar에서 확인
- API 응답의 `start.date` 필드(`YYYY-MM-DD`)를 파싱하여 공휴일 날짜 Set으로 관리
- 알람 스케줄 계산 시 해당 날짜가 공휴일 Set에 포함되면 해당 회차 스킵
- 연간 API 호출 횟수를 줄이기 위해 연도별 캐싱 필수 (AsyncStorage)

### 8.4 다국어(i18n) 구현 구조

- 번역 파일 위치: `/src/locales/ko.json`, `/src/locales/en.json`
- 알람 관련 텍스트, 타이머 텍스트, 설정 텍스트, 에러 메시지 모두 번역 파일로 관리
- 날짜/시간 표시: 언어가 `'ko'`이면 date-fns의 `ko` locale, `'en'`이면 `enUS` locale 사용
- 공휴일 국가 이름: i18n 번역 파일에 국가코드별 현지화 이름 포함

### 8.5 AI 바이브코딩 활용 팁

- 각 컴포넌트를 명확히 분리하여 AI에게 단일 책임 원칙으로 요청
- 데이터 모델(섹션 5)을 먼저 구현 요청 후 UI 요청
- 알람 스케줄 로직은 별도 util 함수로 분리 요청
- `'Expo SDK 51 기준 expo-notifications로 알람 스케줄 구현해줘'` 와 같이 버전 명시
- 화면별로 요청: `'AlarmListScreen 컴포넌트 구현. 위 데이터 모델 기준으로'`
- 설정 기능 요청: `'i18next + expo-localization으로 한국어/영어 초기 언어 감지 및 전환 구현해줘'`
- 공휴일 요청: `'Google Calendar API로 KR 공휴일 가져와 AsyncStorage에 연도별 캐싱하는 util 구현해줘'`

### 9 디자인 가이드 참고

- Design_guide 폴더 안에 있는 html/png 파일을 활용하여 구현할것
- alarm_list_dashboard : 알람 목록 화면 디자인
- edit_alarm_settings_1 : 알람 추가/편집 화면 디자인_일반 모드
- edit_alarm_settings_2 : 알람 추가/편집 화면 디자인_캘린더 모드
- workout_timer_mode_1 : 운동 타이머 화면 디자인
- workout_timer_mode_2 : 일반 타이머 화면 디자인
- incoming_alarm_overlay : '다시 울림 끄기 강화' 디자인
- app_settings_overview : 설정 화면 디자인

---

*본 기획서는 AI 바이브코딩 참조용으로 작성되었습니다. 구현 시 Expo SDK 버전 및 라이브러리 최신 문서를 함께 참조하세요.*