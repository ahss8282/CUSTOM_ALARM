# Phase 4 구현 계획

## 목표

**"화면이 꺼진 상태에서도 알람이 울리고, 잠금화면에 알람 전체화면이 표시된다."**
**"사용자가 원하는 사운드 파일을 직접 알람음으로 사용할 수 있다."**

iOS의 구조적 한계(무음 우회 불가, fullScreenIntent 미지원)는 인정하고,
Android에서 실제 알람 시계처럼 동작하는 것을 목표로 한다.

---

## Phase 4 구현 범위

| # | 기능 | 난이도 |
|---|------|--------|
| 4-1 | Android 배터리 최적화 제외 요청 | 낮음 |
| 4-2 | Android 잠금화면 전체화면 알람 (fullScreenIntent) | 높음 |
| 4-3 | Android 화면 자동 켜기 (Turn Screen On) | 중간 |
| 4-4 | 사용자 커스텀 알람음 추가 (파일 선택) | 중간 |
| 4-5 | 커스텀 알람음 목록 관리 (추가/삭제/미리듣기) | 중간 |
| 4-6 | 알람 울림 화면에서 커스텀 사운드 재생 | 낮음 |

---

## 현재 상태 (Phase 3 완료 기준)

- `expo-notifications`로 알람 스케줄 등록 완료
- `USE_EXACT_ALARM`, `SCHEDULE_EXACT_ALARM` 권한 app.json에 추가됨
- `USE_FULL_SCREEN_INTENT` 권한 추가됨
- Android 알림 채널 importance MAX, bypassDnd 설정 완료
- `alarm-ringing.tsx` 전체화면 UI 완료 (앱이 포그라운드일 때만 자동 표시)
- 기본 알람음 `alarm_default.mp3` 재생 완료

## 남은 문제

```
앱 종료 / 화면 OFF 상태
  → OS가 AlarmManager로 알림 발송
  → 알림 소리 재생 ✅
  → 알림 배너 표시 ✅ (잠금화면에서 탭 필요)
  → alarm-ringing 전체화면 자동 표시 ❌ ← Phase 4에서 해결
```

---

## 4-1. Android 배터리 최적화 제외 요청

### 배경
Android는 배터리 절약을 위해 백그라운드 앱을 임의로 종료한다.
AlarmManager는 앱이 종료되어도 동작하지만, 일부 제조사 커스텀 OS(삼성 One UI, 샤오미 MIUI 등)는
AlarmManager까지 차단한다. 배터리 최적화 제외를 요청하면 이를 방지할 수 있다.

### 구현 방법

```ts
// src/utils/battery-optimization.ts
import { Linking, Platform } from 'react-native';

export const requestBatteryOptimizationExempt = async () => {
  if (Platform.OS !== 'android') return;
  // android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
  // 패키지명을 포함한 딥링크로 이동
  await Linking.openSettings();
  // 또는 IntentLauncher 사용
};
```

더 정확한 방법: `expo-intent-launcher` 사용

```ts
import * as IntentLauncher from 'expo-intent-launcher';

export const requestIgnoreBatteryOptimization = async (packageName: string) => {
  await IntentLauncher.startActivityAsync(
    'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
    { data: `package:${packageName}` }
  );
};
```

### 적용 위치
- `app/_layout.tsx` 최초 실행 시 1회 요청
- 또는 설정 화면에 "배터리 최적화 제외" 안내 버튼 추가

### 설치 패키지
```bash
npx expo install expo-intent-launcher
```

---

## 4-2. Android 잠금화면 전체화면 알람 (fullScreenIntent)

### 배경
Android에서 화면이 꺼진 상태(잠금화면)에서 전체화면 알람을 자동으로 띄우려면
알림에 `fullScreenIntent`를 설정해야 한다.

`expo-notifications`는 `fullScreenIntent`를 직접 지원하지 않으므로,
**Expo Config Plugin**을 사용해 네이티브 코드를 수정한다.

### 구현 방법

#### Step 1: Expo Config Plugin 작성

```ts
// plugins/withFullScreenIntent.ts
const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withFullScreenIntent(config) {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults;
    const mainActivity = manifest.manifest.application[0].activity.find(
      (a) => a.$['android:name'] === '.MainActivity'
    );
    if (mainActivity) {
      // 잠금화면에서 표시 + 화면 켜기
      mainActivity.$['android:showWhenLocked'] = 'true';
      mainActivity.$['android:turnScreenOn'] = 'true';
    }
    return config;
  });
};
```

#### Step 2: app.json에 플러그인 등록

```json
"plugins": [
  "./plugins/withFullScreenIntent",
  ...
]
```

#### Step 3: 알림 발송 시 fullScreenIntent 설정

`expo-notifications`의 `NotificationContentInput`에는 현재 `fullScreenIntent`가 없다.
대안: **`@notifee/react-native`** 라이브러리 사용 (fullScreenIntent 공식 지원)

```bash
npm install @notifee/react-native
```

```ts
// src/utils/notification-android.ts
import notifee, {
  AndroidImportance,
  AndroidVisibility,
  AndroidCategory,
} from '@notifee/react-native';

export const scheduleAlarmWithFullScreen = async (alarm: Alarm) => {
  const channelId = await notifee.createChannel({
    id: 'alarm',
    name: '알람',
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PUBLIC,
    bypassDnd: true,
    vibration: true,
  });

  await notifee.displayNotification({
    title: alarm.name || '알람',
    body: `${String(alarm.hour).padStart(2,'0')}:${String(alarm.minute).padStart(2,'0')}`,
    data: { alarmId: alarm.id },
    android: {
      channelId,
      category: AndroidCategory.ALARM,
      fullScreenAction: {
        id: 'alarm_fullscreen',
        // alarm-ringing 화면으로 연결하는 Activity
      },
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
    },
  });
};
```

#### Step 4: HeadlessJS 백그라운드 태스크 연결

`expo-task-manager`로 알림 수신 시 JS 코드 실행:

```ts
// src/tasks/alarm-task.ts
import * as TaskManager from 'expo-task-manager';

const ALARM_TASK = 'ALARM_BACKGROUND_TASK';

TaskManager.defineTask(ALARM_TASK, ({ data, error }) => {
  if (error) return;
  // 여기서 alarm-ringing 화면으로 이동하는 딥링크 발송
  // Linking.openURL('customalarm://alarm-ringing?alarmId=...');
});
```

### 설치 패키지
```bash
npm install @notifee/react-native
npx expo install expo-task-manager expo-background-fetch
```

> **주의**: `@notifee/react-native`는 bare workflow 또는 development build에서만 동작한다.
> EAS Build로 빌드하거나 `expo prebuild`로 네이티브 코드를 생성해야 한다.

---

## 4-3. Android 화면 자동 켜기 (Turn Screen On)

### 배경
`fullScreenIntent` 알람이 발송되면 Android는 화면을 자동으로 켜려고 시도한다.
하지만 일부 기기에서는 Activity 플래그를 명시적으로 설정해야 한다.

### 구현 방법

Config Plugin으로 MainActivity에 플래그 추가 (Step 4-2에 포함):

```ts
mainActivity.$['android:showWhenLocked'] = 'true';
mainActivity.$['android:turnScreenOn'] = 'true';
```

또는 `alarm-ringing.tsx`에서 직접 처리:

```ts
// alarm-ringing.tsx 내부
import { useEffect } from 'react';
import { Platform, NativeModules } from 'react-native';

useEffect(() => {
  if (Platform.OS === 'android') {
    // Kotlin 네이티브 모듈로 window flag 설정
    // FLAG_KEEP_SCREEN_ON | FLAG_SHOW_WHEN_LOCKED | FLAG_TURN_SCREEN_ON
    NativeModules.AlarmModule?.acquireWakeLock();
  }
  return () => {
    NativeModules.AlarmModule?.releaseWakeLock();
  };
}, []);
```

이를 위한 최소 Kotlin 네이티브 모듈 작성 또는 `expo-keep-awake` 활용:

```ts
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

useEffect(() => {
  activateKeepAwakeAsync();
  return () => deactivateKeepAwake();
}, []);
```

```bash
npx expo install expo-keep-awake
```

---

## 4-4. 사용자 커스텀 알람음 추가

### 배경
현재는 `assets/sounds/alarm_default.mp3` 1개만 지원한다.
사용자가 기기에 저장된 MP3/AAC 파일을 선택해 알람음으로 등록할 수 있게 한다.

### 구현 방법

#### Step 1: 파일 선택

`expo-document-picker`로 오디오 파일 선택:

```ts
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

export const pickCustomSound = async (): Promise<{ name: string; uri: string } | null> => {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['audio/mpeg', 'audio/aac', 'audio/wav', 'audio/*'],
    copyToCacheDirectory: false,
  });

  if (result.canceled) return null;
  const asset = result.assets[0];

  // 앱 전용 영구 저장 경로로 복사
  const destDir = `${FileSystem.documentDirectory}sounds/`;
  await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
  const destUri = `${destDir}${asset.name}`;
  await FileSystem.copyAsync({ from: asset.uri, to: destUri });

  return { name: asset.name, uri: destUri };
};
```

#### Step 2: 커스텀 사운드 목록 저장

`AsyncStorage`에 커스텀 사운드 목록을 저장:

```ts
// src/store/sound-store.ts
interface CustomSound {
  id: string;     // uuid
  name: string;   // 파일명
  uri: string;    // FileSystem.documentDirectory 경로
}

// AsyncStorage 키: 'custom_sounds'
```

#### Step 3: 사운드 타입 구분

```ts
// alarm.soundId 값 규칙
// 'default'          → assets/sounds/alarm_default.mp3
// 'bell'             → assets/sounds/alarm_bell.mp3
// 'custom:{uuid}'    → FileSystem.documentDirectory/sounds/{filename}
```

### 설치 패키지
```bash
npx expo install expo-document-picker expo-file-system
```

---

## 4-5. 커스텀 알람음 목록 관리

### 알람 편집 화면 (`alarm/[id].tsx`) 변경

**기존 사운드 선택 영역에 "파일 추가" 버튼 추가:**

```
┌─────────────────────────────────┐
│ 알람음                           │
│ ○ 기본음     ○ 벨     ○ 디지털   │
│ ─── 내 사운드 ───                │
│ ○ morning_alarm.mp3  [삭제]      │
│ ○ custom_sound.aac   [삭제]      │
│ [+ 파일에서 추가]                │
└─────────────────────────────────┘
```

### 사운드 삭제

```ts
const deleteCustomSound = async (soundId: string) => {
  const sound = customSounds.find(s => s.id === soundId);
  if (sound) {
    await FileSystem.deleteAsync(sound.uri, { idempotent: true });
    // 이 사운드를 사용 중인 알람은 기본음으로 초기화
  }
};
```

---

## 4-6. 알람 울림 화면에서 커스텀 사운드 재생

```ts
// alarm-ringing.tsx
// soundId에 따라 다른 소스 로드
const getAudioSource = (soundId: string, customSounds: CustomSound[]) => {
  if (soundId.startsWith('custom:')) {
    const id = soundId.replace('custom:', '');
    const sound = customSounds.find(s => s.id === id);
    return sound ? { uri: sound.uri } : require('@/assets/sounds/alarm_default.mp3');
  }
  // 내장 사운드 맵
  const builtinMap: Record<string, object> = {
    default: require('@/assets/sounds/alarm_default.mp3'),
    bell: require('@/assets/sounds/alarm_bell.mp3'),
  };
  return builtinMap[soundId] ?? require('@/assets/sounds/alarm_default.mp3');
};
```

---

## 구현 순서 (권장)

```
Step 1  4-1  배터리 최적화 제외 요청        ← 가장 쉽고 효과 큼
Step 2  4-4  expo-document-picker 파일 선택
Step 3  4-5  커스텀 사운드 목록 관리
Step 4  4-6  알람 울림 화면 사운드 연동
Step 5  4-3  expo-keep-awake 화면 켜기
Step 6  4-2  @notifee fullScreenIntent       ← 가장 복잡, EAS Build 필요
```

---

## 설치 패키지 전체 목록

```bash
# 배터리 최적화 제외
npx expo install expo-intent-launcher

# fullScreenIntent (bare workflow 필요)
npm install @notifee/react-native
npx expo install expo-task-manager expo-background-fetch

# 화면 켜기
npx expo install expo-keep-awake

# 커스텀 사운드
npx expo install expo-document-picker expo-file-system
```

---

## Android 기기별 추가 조치 (사용자 안내)

`fullScreenIntent`를 구현하더라도 일부 제조사 OS는 추가 설정이 필요하다.

| 제조사 | 필요 설정 |
|--------|----------|
| 삼성 One UI | 설정 → 배터리 → 백그라운드 앱 제한 → 앱 제외 |
| 삼성 One UI | 설정 → 앱 → Custom Alarm → 배터리 → 제한 없음 |
| 삼성 One UI | 설정 → 알림 → 잠금화면 알림 허용 |
| MIUI (샤오미) | 설정 → 앱 → 잠금화면에서 팝업 허용 |
| 공통 | 설정 → 앱 → Custom Alarm → 알림 → 잠금화면 표시 허용 |

이 안내를 **앱 최초 실행 시 온보딩 화면** 또는 **설정 화면 "알람 신뢰도" 섹션**으로 제공한다.

---

## iOS 대응 방침

- iOS는 `fullScreenIntent` 미지원, 무음 모드 우회 불가 (정책적 제한)
- `playsInSilentMode: true` (expo-audio)로 무음 모드에서도 재생 시도
- iOS 사용자에게 "알람 소리가 안 들리면 무음 스위치를 확인하세요" 안내
- Phase 4에서 iOS 전용 추가 구현 없음

---

*Phase 4는 `@notifee/react-native` 도입으로 인해 EAS Build(개발 빌드 재생성)가 필수입니다.*
