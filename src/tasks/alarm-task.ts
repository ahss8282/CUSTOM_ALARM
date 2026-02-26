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
   *
   * [주의] 동적 import().then() 안에서 등록하면 헤드리스 JS 실행 시
   * .then() 콜백이 완료되기 전에 이벤트가 지나칠 수 있습니다.
   * require()로 동기 로드하여 즉시 등록합니다.
   */
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const notifeeModule = require('@notifee/react-native');
  const notifee = notifeeModule.default;
  const EventType = notifeeModule.EventType;

  notifee.onBackgroundEvent(async ({ type, detail }: { type: number; detail: any }) => {
    // ── 백그라운드 '지금 해제' 버튼 처리 ──────────────────────────────────
    if (type === EventType.ACTION_PRESS &&
        detail.pressAction?.id === 'cancel_alarm') {
      const alarmId = detail.notification?.data?.alarmId as string | undefined;
      // triggerNotifId: 예정 알림 data에 저장된 대응 알람 트리거 알림 ID
      // 예: 'abc_w1' (매주 월요일 회차), 'abc_d2026-03-01' (캘린더 날짜), 'abc_once' (일회성)
      const triggerNotifId = detail.notification?.data?.triggerNotifId as string | undefined;
      const displayedNotifId = detail.notification?.id as string | undefined;
      if (!alarmId) return;

      if (triggerNotifId) {
        // ── 회차 단위 취소 ──────────────────────────────────────────────
        // 1. 해당 회차 알람 트리거만 취소 (다른 요일/날짜 알람은 유지)
        try { await notifee.cancelTriggerNotification(triggerNotifId); } catch {}

        // 2. 지금 표시된 예정 알림 닫기
        if (displayedNotifId) {
          try { await notifee.cancelDisplayedNotification(displayedNotifId); } catch {}
        }

        const weekdayMatch = triggerNotifId.match(/_w(\d+)$/);
        if (weekdayMatch) {
          // ── 요일 반복 알람: 다음 주 동일 요일 재등록 ──────────────────
          // isEnabled는 변경하지 않으므로 알람은 계속 활성 상태
          const weekday = parseInt(weekdayMatch[1]);
          try {
            const raw = await AsyncStorage.getItem('alarms');
            const alarms: any[] = raw ? JSON.parse(raw) : [];
            const alarm = alarms.find((a: any) => a.id === alarmId);
            if (alarm && alarm.isEnabled) {
              const { rescheduleWeekdayOccurrence } = await import('../utils/notification-notifee');
              await rescheduleWeekdayOccurrence(alarm, weekday);
            }
          } catch (e) {
            console.warn('[AlarmTask] 요일 반복 재등록 실패:', e);
          }
        } else if (triggerNotifId.endsWith('_once')) {
          // ── 일회성 알람: isEnabled = false ────────────────────────────
          try {
            const raw = await AsyncStorage.getItem('alarms');
            if (raw) {
              const alarms = JSON.parse(raw);
              const updated = alarms.map((a: any) =>
                a.id === alarmId ? { ...a, isEnabled: false } : a
              );
              await AsyncStorage.setItem('alarms', JSON.stringify(updated));
            }
          } catch (e) {
            console.warn('[AlarmTask] 알람 비활성화 실패:', e);
          }
        }
        // ── 캘린더 알람 (_d{date}): 해당 날짜 트리거만 취소됨(위에서 처리),
        //    나머지 날짜들은 이미 개별 등록되어 있으므로 추가 처리 불필요
      } else {
        // ── triggerNotifId 없음: 이전 버전 호환 fallback (전체 취소) ─────
        const triggers = await notifee.getTriggerNotifications();
        const toCancel = triggers
          .filter((n: any) => n.notification.id?.startsWith(`${alarmId}_`))
          .map((n: any) => n.notification.id as string);
        await Promise.all(toCancel.map((id: string) =>
          notifee.cancelTriggerNotification(id)
        ));
        await notifee.cancelDisplayedNotifications();
        try {
          const raw = await AsyncStorage.getItem('alarms');
          if (raw) {
            const alarms = JSON.parse(raw);
            const updated = alarms.map((a: any) =>
              a.id === alarmId ? { ...a, isEnabled: false } : a
            );
            await AsyncStorage.setItem('alarms', JSON.stringify(updated));
          }
        } catch {}
      }

      return;
    }

    // EventType.DELIVERED: 예약된 알림이 발동(전달)되었을 때
    if (type !== EventType.DELIVERED) return;

    const alarmId = detail.notification?.data?.alarmId as string | undefined;
    if (!alarmId) return;

    // [fallback용] 사용자가 알림을 직접 닫은 뒤 앱을 수동으로 열었을 때를 대비해 저장합니다.
    // 정상 경로(_layout.tsx의 getDisplayedNotifications)에서는 이 값을 사용하지 않습니다.
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
       * ID 패턴: `{alarmId}_w{weekday}` (예: "abc123_w1" = 월요일)
       */
      const notifId = detail.notification?.id ?? '';
      const match = notifId.match(/_w(\d+)$/);
      if (!match) return;

      const firedWeekday = parseInt(match[1]);

      const now = new Date();
      const next = new Date();
      next.setHours(alarm.hour, alarm.minute, 0, 0);
      next.setDate(now.getDate() + 7);

      const { setupNotifeeChannel } = await import('../utils/notification-notifee');
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
}
