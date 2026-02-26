# Custom Alarm

React Native(Expo) 기반 iOS/Android 알람 & 타이머 앱입니다.

## 기술 스택

| 역할 | 라이브러리 |
|------|-----------|
| 프레임워크 | Expo SDK 54, React Native 0.81.5 |
| 네비게이션 | Expo Router v6 (파일 기반 라우팅) |
| 상태 관리 | Zustand + AsyncStorage |
| 알림/알람 트리거 | @notifee/react-native (Android), expo-notifications (iOS) |
| 오디오 | expo-av + AlarmAudioModule (커스텀 네이티브 모듈) |
| 파일 시스템 | expo-file-system (OOP API) |
| 파일 선택 | expo-document-picker |
| i18n | i18next + react-i18next + expo-localization |
| 날짜 처리 | date-fns |
| 공휴일 | Google Calendar API |
| 배터리 | expo-battery |

## 주요 명령어

```bash
# 의존성 설치
npm install

# 개발 서버 시작
npx expo start

# Android 빌드 및 실행 (알람 기능 테스트는 이 방법 필요)
npx expo run:android

# iOS 빌드 및 실행
npx expo run:ios

# 린트 검사
npx expo lint
```

> **중요**: 알람 정확도 테스트는 Expo Go가 아닌 `npx expo run:android` 또는 EAS Build를 통한 실제 빌드에서 진행해야 합니다. @notifee/react-native는 Expo Go를 지원하지 않습니다.

## 앱 구조

```
app/
  _layout.tsx          # 루트 레이아웃 — ThemeProvider, 알림 리스너, 권한 요청
  alarm-ringing.tsx    # 알람 울림 전체화면 오버레이
  (tabs)/
    index.tsx          # 알람 목록 화면
    timer.tsx          # 타이머 화면 (일반 / 운동)
    settings.tsx       # 설정 화면
  alarm/
    [id].tsx           # 알람 추가 / 편집 화면

src/
  store/
    alarm-store.ts     # 알람 CRUD (Zustand + AsyncStorage)
    settings-store.ts  # 앱 설정 (테마 / 언어 / 공휴일 국가)
    timer-store.ts     # 운동 타이머 슬롯 관리
    sound-store.ts     # 커스텀 알람음 관리 (파일 복사 + AsyncStorage)
  tasks/
    alarm-task.ts      # notifee onBackgroundEvent — 요일 반복 재등록 + 백그라운드 알람 해제
  utils/
    notification.ts          # expo-notifications 알람 스케줄 (iOS + fallback)
    notification-notifee.ts  # notifee 채널 생성 + 알람 스케줄 + 예정 알림 (Android)
    notification-android.ts  # notifee fullScreenIntent 알림 발송 유틸
    battery-optimization.ts  # 배터리 최적화 제외 요청 (Android)
    alarm-permissions.ts     # SCHEDULE_EXACT_ALARM / USE_FULL_SCREEN_INTENT 권한
    holiday.ts               # Google Calendar API 공휴일 + AsyncStorage 캐싱
    pick-sound.ts            # expo-document-picker 오디오 파일 선택
  types/
    alarm.ts           # Alarm 인터페이스
    settings.ts        # AppSettings + SUPPORTED_COUNTRIES

plugins/
  withFullScreenIntent.js  # Expo Config Plugin — Android 잠금화면 알람 지원

android/app/src/main/java/com/customalarm/app/
  MainActivity.kt        # WakeLock + setShowWhenLocked/setTurnScreenOn
  AlarmAudioModule.kt    # STREAM_ALARM 재생, moveToBackground 네이티브 모듈

assets/sounds/
  alarm_default.mp3  # 기본 알람음 (soundId: 'default')
  alarm_bell.mp3     # 벨 알람음 (soundId: 'bell')
  alarm_digital.mp3  # 디지털 알람음 (soundId: 'digital')
  alarm_soft.mp3     # 부드러운 알람음 (soundId: 'gentle')
```

## 알람 데이터 모델

```typescript
interface Alarm {
  id: string;
  name: string;                        // 최대 20자
  hour: number;                        // 0–23
  minute: number;                      // 0–59
  isEnabled: boolean;
  scheduleType: 'weekly' | 'calendar';
  weekdays?: number[];                 // 0=일, 1=월 … 6=토
  calendarDates?: string[];            // ISO date strings
  excludeHolidays: boolean;
  soundId: string;                     // 'default'|'bell'|'digital'|'gentle'|'custom:{id}'
  volume: number;                      // 0–100
  vibration: boolean;
  snooze: {
    enabled: boolean;
    intervalMinutes: number;           // 1/3/5/10/15/30
    maxCount: number;                  // -1 = 무제한
    enforced: boolean;                 // true 시 수학 문제 풀기 후 해제
  };
  background: {
    type: 'color' | 'image';
    value: string;                     // hex color 또는 image URI
  };
}
```

## 내장 알람음 soundId 규칙

| soundId | 파일 | 설명 |
|---------|------|------|
| `default` | alarm_default.mp3 | 기본 알람음 |
| `bell` | alarm_bell.mp3 | 벨 |
| `digital` | alarm_digital.mp3 | 디지털 |
| `gentle` | alarm_soft.mp3 | 부드러운 알람음 |
| `custom:{id}` | document/sounds/{id}.ext | 사용자 추가 파일 |

## Android 알람 신뢰도 구조

```
AlarmManager (notifee TriggerType.TIMESTAMP)
  └── fullScreenAction → MainActivity.onNewIntent()
        └── setShowWhenLocked(true) + setTurnScreenOn(true)
        └── PowerManager.WakeLock (ACQUIRE_CAUSES_WAKEUP)
              └── alarm-ringing.tsx 전체화면 표시
```

- **앱 종료 상태**: `getInitialNotification()` → alarmId 추출 → alarm-ringing 라우팅
- **백그라운드 상태**: `onForegroundEvent(DELIVERED)` → alarm-ringing 라우팅
- **포그라운드 복귀**: `getDisplayedNotifications()` (1순위) → `pending_alarm_id` AsyncStorage (2순위)

## Android 필수 권한

| 권한 | 용도 | Android 버전 |
|------|------|-------------|
| SCHEDULE_EXACT_ALARM | 정확한 시각 알람 | 12+ |
| USE_FULL_SCREEN_INTENT | 잠금화면 전체화면 표시 | 14+ |
| FOREGROUND_SERVICE | fullScreenIntent 동작 | 전체 |
| REQUEST_IGNORE_BATTERY_OPTIMIZATIONS | 배터리 최적화 제외 | 전체 |

권한은 앱 최초 실행 시 자동으로 안내됩니다.

## 환경 변수

```
EXPO_PUBLIC_GOOGLE_CALENDAR_API_KEY=...  # 공휴일 API (선택)
```

`.env` 파일로 관리하며 소스코드에 직접 노출하지 않습니다.

## 알람 예정 알림 (30분 전)

알람 발동 30분 전에 조용한 알림을 표시합니다. 알림에는 **'지금 해제'** 액션 버튼이 포함되어 있어, 앱을 열지 않고 바로 해당 알람을 취소할 수 있습니다.

| 알람 종류 | '지금 해제' 동작 |
|---|---|
| 일회성 알람 | 알람 비활성화 (`isEnabled: false`) |
| 요일 반복 알람 | 이번 주 해당 회차만 건너뜀, **다음 주는 정상 동작** |
| 캘린더 알람 | 해당 날짜만 취소, **다른 날짜는 정상 동작** |

- Android (notifee) 전용 기능입니다.
- 알림 채널: `alarm_upcoming` (무음, 진동 없음, 방해금지 모드 준수)

## 구현 단계

| Phase | 내용 | 상태 |
|-------|------|------|
| Phase 1 | 알람 목록/추가(요일제)/ON-OFF, 일반 타이머, 설정(다크모드+언어) | 완료 |
| Phase 2 | 캘린더제, 공휴일 제외, 알람음, 진동, 스누즈, 운동 타이머 | 완료 |
| Phase 3 | 알람 배경, 스누즈 강화(수학문제), 전체화면 알람 오버레이 | 완료 |
| Phase 4 | Android 알람 신뢰도 강화 (fullScreenIntent, WakeLock, 커스텀 알람음) | 완료 |
| Phase 4 버그수정 | 알람 화면 중복 표시, 화면 미기동, 커스텀 알람음 저장 버그 수정 | 완료 |
| Phase 5 | 타이머 배터리 경고, 예정 알람 알림(30분 전 + 지금 해제) | 완료 |
