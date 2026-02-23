/**
 * alarm-permissions.ts
 *
 * Android 알람 동작에 필요한 특수 권한을 확인하고 설정 화면으로 안내합니다.
 *
 * ── 필요한 권한 두 가지 ──────────────────────────────────────────────────
 *
 * 1) SCHEDULE_EXACT_ALARM (Android 12, API 31+)
 *    - notifee AlarmManager 트리거가 정확한 시각에 발동하려면 반드시 필요합니다.
 *    - 시스템이 자동 부여하지 않고 사용자가 직접 허가해야 합니다.
 *    - 설정 경로: 설정 → 앱 → [앱 이름] → 알람 및 리마인더 → 허용
 *
 * 2) USE_FULL_SCREEN_INTENT (Android 14, API 34+)
 *    - 화면이 꺼진 잠금화면 상태에서 전체화면 알람 팝업을 띄우려면 필요합니다.
 *    - Android 14부터 사용자가 직접 허가해야 합니다.
 *    - 설정 경로: 설정 → 앱 → [앱 이름] → 전체화면 인텐트 허용
 */
import { Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Application from 'expo-application';

/** SCHEDULE_EXACT_ALARM 권한 설정 화면으로 이동 (Android 12+) */
export const openExactAlarmSettings = async (): Promise<void> => {
  if (Platform.OS !== 'android') return;

  const packageName = Application.applicationId ?? 'com.custom_alarm';

  // ACTION_REQUEST_SCHEDULE_EXACT_ALARM: 앱별 알람 권한 설정 화면
  try {
    await IntentLauncher.startActivityAsync(
      'android.settings.REQUEST_SCHEDULE_EXACT_ALARM',
      { data: `package:${packageName}` }
    );
    return;
  } catch {}

  // fallback: 앱 상세 설정
  try {
    await IntentLauncher.startActivityAsync(
      'android.settings.APPLICATION_DETAILS_SETTINGS',
      { data: `package:${packageName}` }
    );
  } catch {}
};

/** USE_FULL_SCREEN_INTENT 권한 설정 화면으로 이동 (Android 14+) */
export const openFullScreenIntentSettings = async (): Promise<void> => {
  if (Platform.OS !== 'android') return;

  const packageName = Application.applicationId ?? 'com.custom_alarm';

  // MANAGE_APP_USE_FULL_SCREEN_INTENT: Android 14에서 추가된 전체화면 인텐트 설정
  try {
    await IntentLauncher.startActivityAsync(
      'android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT',
      { data: `package:${packageName}` }
    );
    return;
  } catch {}

  // fallback: 앱 상세 설정
  try {
    await IntentLauncher.startActivityAsync(
      'android.settings.APPLICATION_DETAILS_SETTINGS',
      { data: `package:${packageName}` }
    );
  } catch {}
};

/**
 * 현재 기기가 Android 12 이상인지 확인합니다.
 * SCHEDULE_EXACT_ALARM이 필요한 최소 버전입니다.
 */
export const needsExactAlarmPermission = (): boolean => {
  if (Platform.OS !== 'android') return false;
  // Android 12 = API 31
  return (Platform.Version as number) >= 31;
};

/**
 * 현재 기기가 Android 14 이상인지 확인합니다.
 * USE_FULL_SCREEN_INTENT 사용자 허가가 필요한 최소 버전입니다.
 */
export const needsFullScreenIntentPermission = (): boolean => {
  if (Platform.OS !== 'android') return false;
  // Android 14 = API 34
  return (Platform.Version as number) >= 34;
};
