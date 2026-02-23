/**
 * alarm-task.ts
 *
 * notifee.onBackgroundEvent — 앱이 종료/백그라운드 상태에서 알람이 발동했을 때 처리합니다.
 *
 * 역할:
 *   1. 요일 반복 알람이 발동하면 다음 주 해당 요일로 재등록합니다.
 *   2. (자동 팝업은 notifee createTriggerNotification의 fullScreenAction이 처리합니다.)
 *
 * 반드시 앱 진입점 최상위 레벨에서 import 되어야 합니다.
 * → app/_layout.tsx 최상단에서 import '@/src/tasks/alarm-task'
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const isExpoGo = Constants.executionEnvironment === 'storeClient';

if (!isExpoGo && Platform.OS === 'android') {
  /**
   * onBackgroundEvent는 반드시 모듈 최상위 레벨에서 동기적으로 호출해야 합니다.
   * React 컴포넌트 안이나 useEffect 안에서 호출하면 동작하지 않습니다.
   */
  import('@notifee/react-native').then(({ default: notifee, EventType }) => {
    notifee.onBackgroundEvent(async ({ type, detail }) => {
      // EventType.DELIVERED: 예약된 알림이 발동(전달)되었을 때
      if (type !== EventType.DELIVERED) return;

      const alarmId = detail.notification?.data?.alarmId as string | undefined;
      if (!alarmId) return;

      // 앱이 백그라운드에서 포그라운드로 전환될 때 _layout.tsx의 AppState
      // 리스너가 이 값을 읽어 alarm-ringing 화면으로 이동합니다.
      await AsyncStorage.setItem('pending_alarm_id', alarmId);

      try {
        // AsyncStorage에서 해당 알람 데이터 조회
        const raw = await AsyncStorage.getItem('alarms');
        const alarms: any[] = raw ? JSON.parse(raw) : [];
        const alarm = alarms.find((a) => a.id === alarmId);

        // 비활성화된 알람이거나 요일 반복이 없으면 재등록 불필요
        if (!alarm || !alarm.isEnabled || !alarm.weekdays?.length) return;

        /**
         * 요일 반복 알람: 발동한 요일의 다음 주 발동 시각으로 재등록합니다.
         * notifee는 반복 알람을 지원하지만, USE_EXACT_ALARM과 함께
         * 수동 재등록이 더 정확합니다.
         *
         * 어떤 요일 알람이 발동했는지는 notification.id로 파악합니다.
         * ID 패턴: `{alarmId}_w{weekday}` (예: "abc123_w1" = 월요일)
         */
        const notifId = detail.notification?.id ?? '';
        const match = notifId.match(/_w(\d+)$/);
        if (!match) return; // 요일 알람이 아니면 무시

        const firedWeekday = parseInt(match[1]); // 0=일 ~ 6=토

        // 다음 발동 시각 계산 (7일 뒤 같은 요일)
        const now = new Date();
        const next = new Date();
        next.setHours(alarm.hour, alarm.minute, 0, 0);
        next.setDate(now.getDate() + 7); // 정확히 1주일 뒤

        const { scheduleAlarmWithNotifee, setupNotifeeChannel } = await import('../utils/notification-notifee');
        const {
          TriggerType,
          AndroidImportance,
          AndroidVisibility,
          AndroidCategory,
        } = await import('@notifee/react-native');

        const channelId = await setupNotifeeChannel();
        const hh = String(alarm.hour).padStart(2, '0');
        const mm = String(alarm.minute).padStart(2, '0');

        await notifee.createTriggerNotification(
          {
            id: `${alarmId}_w${firedWeekday}`,
            title: alarm.name || '알람',
            body: `${hh}:${mm}`,
            data: { alarmId },
            android: {
              channelId,
              category: AndroidCategory.ALARM,
              fullScreenAction: { id: 'alarm_fullscreen', launchActivity: 'default' },
              importance: AndroidImportance.HIGH,
              visibility: AndroidVisibility.PUBLIC,
              pressAction: { id: 'default', launchActivity: 'default' },
              bypassDnd: true,
            },
          },
          {
            type: TriggerType.TIMESTAMP,
            timestamp: next.getTime(),
            alarmManager: { allowWhileIdle: true },
          }
        );
      } catch (e) {
        console.warn('[AlarmTask] 재등록 실패:', e);
      }
    });
  }).catch(() => {
    // notifee 미설치 환경에서는 무시
  });
}
