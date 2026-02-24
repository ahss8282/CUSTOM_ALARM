import { Platform, Linking } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Application from 'expo-application';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BATTERY_OPT_ASKED_KEY = 'battery_opt_asked';

/**
 * Android에서 배터리 최적화 제외 설정 화면으로 이동합니다.
 *
 * 1차 시도: ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS (앱 지정 다이얼로그)
 * 2차 fallback: ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS (전체 목록 화면)
 * 3차 fallback: 앱 상세 설정 (Linking.openSettings)
 */
export const requestIgnoreBatteryOptimization = async () => {
  if (Platform.OS !== 'android') return;

  const packageName = Application.applicationId ?? 'com.custom_alarm';

  // 1차: 앱 지정 배터리 최적화 제외 다이얼로그
  try {
    await IntentLauncher.startActivityAsync(
      'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
      { data: `package:${packageName}` }
    );
    return;
  } catch {
    // 일부 기기에서 지원하지 않으면 fallback
  }

  // 2차: 배터리 최적화 전체 목록 화면
  try {
    await IntentLauncher.startActivityAsync(
      'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS'
    );
    return;
  } catch {
    // 이것도 실패하면 앱 상세 설정으로
  }

  // 3차: 앱 상세 설정 (Linking.openSettings)
  try {
    await Linking.openSettings();
  } catch {
    // 완전히 실패 시 무시
  }
};

/**
 * 설정 화면에서 명시적으로 호출하는 버전.
 * 이미 제외된 상태여도 항상 보이는 설정 화면으로 이동합니다.
 *
 * 1차: 앱 배터리 상세 설정 (APPLICATION_DETAILS_SETTINGS → 배터리 탭 바로 이동 가능)
 * 2차: 배터리 최적화 전체 목록
 * 3차: 앱 상세 설정
 */
export const openBatteryOptimizationSettings = async () => {
  if (Platform.OS !== 'android') return;

  const packageName = Application.applicationId ?? 'com.custom_alarm';

  // 1차: 앱 상세 설정 (배터리 항목 포함, 항상 열림)
  try {
    await IntentLauncher.startActivityAsync(
      'android.settings.APPLICATION_DETAILS_SETTINGS',
      { data: `package:${packageName}` }
    );
    return;
  } catch {}

  // 2차: 배터리 최적화 전체 목록
  try {
    await IntentLauncher.startActivityAsync(
      'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS'
    );
    return;
  } catch {}

  // 3차: 시스템 설정 일반
  try {
    await Linking.openSettings();
  } catch {}
};

/**
 * 앱 최초 실행 시 1회만 배터리 최적화 제외 요청을 합니다.
 * 이미 요청했으면 아무것도 하지 않습니다.
 */
export const requestBatteryOptimizationOnce = async () => {
  if (Platform.OS !== 'android') return;
  try {
    const asked = await AsyncStorage.getItem(BATTERY_OPT_ASKED_KEY);
    if (asked) return;
    await AsyncStorage.setItem(BATTERY_OPT_ASKED_KEY, 'true');
    await requestIgnoreBatteryOptimization();
  } catch {
    // 실패해도 앱 동작에 영향 없음
  }
};
