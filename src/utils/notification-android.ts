/**
 * notification-android.ts
 * Android 전용 — @notifee/react-native를 사용한 fullScreenIntent 알람 알림
 *
 * fullScreenIntent란?
 * - 화면이 꺼진 상태(잠금화면)에서 알람이 발생하면,
 *   일반 알림 배너 대신 알람 울림 화면(alarm-ringing)을 자동으로 전체화면으로 띄우는 기능입니다.
 * - expo-notifications는 fullScreenIntent를 지원하지 않으므로
 *   이 파일에서 @notifee/react-native를 사용합니다.
 *
 * 주의: @notifee/react-native는 Expo Go에서 동작하지 않습니다.
 *       EAS Build(Development Build) 또는 expo prebuild 후 실제 기기에서 테스트해야 합니다.
 */
import { Platform } from 'react-native';
import type { Alarm } from '../types/alarm';

/**
 * Android에서 fullScreenIntent 알람 알림을 발송합니다.
 * @param alarm 울릴 알람 데이터
 *
 * fullScreenAction은 alarm-ringing 화면으로 딥링크를 통해 이동합니다.
 * Expo Router의 딥링크 스킴: customalarm://alarm-ringing?alarmId={id}
 */
export const displayFullScreenAlarmNotification = async (alarm: Alarm) => {
  if (Platform.OS !== 'android') return;

  try {
    // @notifee/react-native는 네이티브 빌드에서만 사용 가능하므로 동적으로 import
    const notifee = (await import('@notifee/react-native')).default;
    const { AndroidImportance, AndroidVisibility, AndroidCategory } =
      await import('@notifee/react-native');

    // 알람 전용 알림 채널 생성
    // 채널은 앱당 1회만 생성되며, 이후 호출 시 기존 채널이 재사용됩니다.
    const channelId = await notifee.createChannel({
      id: 'alarm_fullscreen',
      name: '알람 (전체화면)',
      importance: AndroidImportance.HIGH,   // 최고 중요도 (화면 상단 팝업)
      visibility: AndroidVisibility.PUBLIC, // 잠금화면에서도 내용 표시
      bypassDnd: true,                      // 방해 금지 모드 무시
      vibration: alarm.vibration,
    });

    const hh = String(alarm.hour).padStart(2, '0');
    const mm = String(alarm.minute).padStart(2, '0');

    await notifee.displayNotification({
      title: alarm.name || '알람',
      body: `${hh}:${mm}`,
      data: { alarmId: alarm.id },
      android: {
        channelId,
        // AndroidCategory.ALARM: 방해 금지 모드에서도 표시되는 알람 카테고리
        category: AndroidCategory.ALARM,
        // fullScreenAction: 화면이 꺼진 상태에서 이 Activity를 전체화면으로 실행
        // launchActivity: 'default' → MainActivity를 실행 후 딥링크로 이동
        fullScreenAction: {
          id: 'alarm_fullscreen',
          launchActivity: 'default',
        },
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        pressAction: {
          id: 'default',
          launchActivity: 'default',
        },
      },
    });
  } catch (e) {
    // notifee 미설치(Expo Go) 또는 네이티브 오류 시 무시
    // expo-notifications의 기본 알람이 이미 등록되어 있으므로 알람 자체는 울립니다
    console.warn('[notifee] fullScreenIntent 알림 발송 실패:', e);
  }
};
