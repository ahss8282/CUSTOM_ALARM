/**
 * alarm-audio-native.ts
 *
 * Android 전용 AlarmAudio 네이티브 모듈 브릿지입니다.
 * STREAM_ALARM을 사용하므로 기기가 무음/진동 모드여도 알람 볼륨이 0이 아니면 재생됩니다.
 *
 * iOS에서는 expo-audio의 playsInSilentModeIOS: true 설정으로 처리합니다.
 */
import { Platform, NativeModules } from 'react-native';

const { AlarmAudio } = NativeModules as {
  AlarmAudio?: {
    play: (uri: string, volume: number) => Promise<void>;
    stop: () => Promise<void>;
    moveToBackground: () => Promise<void>;
  };
};

/** Android에서 STREAM_ALARM으로 오디오를 재생합니다. */
export const playAlarmNative = async (uri: string, volume: number): Promise<boolean> => {
  if (Platform.OS !== 'android' || !AlarmAudio) return false;
  try {
    await AlarmAudio.play(uri, volume);
    return true;
  } catch {
    return false;
  }
};

/** Android 네이티브 알람 오디오를 멈춥니다. */
export const stopAlarmNative = async (): Promise<void> => {
  if (Platform.OS !== 'android' || !AlarmAudio) return;
  try {
    await AlarmAudio.stop();
  } catch {
    // 무시
  }
};

/**
 * 앱을 백그라운드로 이동합니다 (Android 전용).
 * BackHandler.exitApp() 대신 사용하여 AlarmManager가 앱을 재시작할 수 있도록 합니다.
 * 네이티브 모듈이 없으면 아무 동작도 하지 않습니다.
 */
export const moveAppToBackground = async (): Promise<void> => {
  if (Platform.OS !== 'android' || !AlarmAudio) return;
  try {
    await AlarmAudio.moveToBackground();
  } catch {
    // 무시
  }
};

export const isNativeAlarmAudioAvailable = () =>
  Platform.OS === 'android' && !!AlarmAudio;
