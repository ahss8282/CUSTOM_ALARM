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
    // ── 백그라운드 알림 탭 처리 (화면 ON 상태에서 헤드업 알림 탭) ────────────
    // 화면이 ON일 때 알람이 울리면 fullScreenIntent 대신 헤드업 알림이 표시됩니다.
    // 사용자가 탭하면 EventType.PRESS가 발생합니다.
    // 이 경우 알람 울림 화면을 띄우지 않고 알람 목록 화면으로 이동합니다.
    // _layout.tsx의 handleAppStateChange에서 이 키를 읽어 분기 처리합니다.
    if (type === EventType.PRESS) {
      const alarmId = detail.notification?.data?.alarmId as string | undefined;
      const notifDataType = detail.notification?.data?.type as string | undefined;
      if (alarmId && notifDataType !== 'upcoming') {
        // 알림 탭 플래그 저장: handleAppStateChange에서 알람 목록으로 이동하도록 지시
        await AsyncStorage.setItem('alarm_notif_pressed', alarmId);
        // pending_alarm_id, alarm_delivered_at 정리: 앱 재실행 시 알람 울림 화면 재진입 방지
        await AsyncStorage.removeItem('pending_alarm_id');
        await AsyncStorage.removeItem('alarm_delivered_at');
        // 탭된 알림 취소 (중복 처리 방지)
        try {
          const notifId = detail.notification?.id as string | undefined;
          if (notifId) await notifee.cancelDisplayedNotification(notifId);
        } catch {}
      }
      return;
    }

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
    // 예정 알림(type: 'upcoming')은 재등록 처리 대상이 아님
    const notifDataType = detail.notification?.data?.type as string | undefined;
    if (!alarmId || notifDataType === 'upcoming') return;

    // fullScreenIntent 감지용: 알림 발동 시각을 저장합니다.
    // handleAppStateChange에서 15초 이내 포그라운드 전환 = fullScreenIntent(화면 OFF)로 판단합니다.
    await AsyncStorage.setItem('pending_alarm_id', alarmId);
    await AsyncStorage.setItem('alarm_delivered_at', String(Date.now()));

    // 알람 발동 시 대응하는 예정 알림(30분 전 알림)을 자동 제거합니다.
    // 예: 알람 ID 'abc_w1' → 예정 알림 ID 'abc_up_w1'
    const notifId = detail.notification?.id as string | undefined;
    if (notifId) {
      const upcomingId = notifId.replace(`${alarmId}_`, `${alarmId}_up_`);
      try { await notifee.cancelTriggerNotification(upcomingId); } catch {}
      try { await notifee.cancelDisplayedNotification(upcomingId); } catch {}
    }

    try {
      // AsyncStorage에서 해당 알람 데이터 조회
      const raw = await AsyncStorage.getItem('alarms');
      const alarms: any[] = raw ? JSON.parse(raw) : [];
      const alarm = alarms.find((a) => a.id === alarmId);

      if (!alarm || !alarm.isEnabled) return;

      const firedNotifId = detail.notification?.id ?? '';

      const { setupNotifeeChannel, rescheduleWeekdayOccurrence } =
        await import('../utils/notification-notifee');
      const {
        TriggerType,
        AndroidImportance,
        AndroidVisibility,
        AndroidCategory,
      } = await import('@notifee/react-native');

      const channelId = await setupNotifeeChannel();
      const hh = String(alarm.hour).padStart(2, '0');
      const mm = String(alarm.minute).padStart(2, '0');

      const baseNotif = {
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
      };
      const alarmManagerOpts = { allowWhileIdle: true };

      /**
       * 요일 반복 알람 (_w{weekday}):
       * 발동 후 다음 유효 날짜로 재등록합니다.
       * excludeHolidays/excludeWeekends가 있으면 rescheduleWeekdayOccurrence가 처리합니다.
       */
      const weekdayMatch = firedNotifId.match(/_w(\d+)$/);
      if (weekdayMatch && alarm.weekdays?.length) {
        const firedWeekday = parseInt(weekdayMatch[1]);
        if (alarm.excludeHolidays || alarm.excludeWeekends) {
          // 제외 조건 있음: rescheduleWeekdayOccurrence가 유효한 다음 날짜를 계산해 등록
          await rescheduleWeekdayOccurrence(alarm, firedWeekday);
        } else {
          // 제외 조건 없음: 기존 로직 (정확히 7일 후)
          const now = new Date();
          const next = new Date();
          next.setHours(alarm.hour, alarm.minute, 0, 0);
          next.setDate(now.getDate() + 7);
          await notifee.createTriggerNotification(
            { ...baseNotif, id: `${alarmId}_w${firedWeekday}` },
            { type: TriggerType.TIMESTAMP, timestamp: next.getTime(), alarmManager: alarmManagerOpts }
          );
        }
        return;
      }

      /**
       * 캘린더 반복 주기 알람 (_rep_{date}):
       * repeatEvery 주기만큼 다음 날짜를 계산해 `_rep_` ID로 재등록합니다.
       */
      const repMatch = firedNotifId.match(/_rep_(\d{4}-\d{2}-\d{2})$/);
      if (repMatch && alarm.repeatEvery) {
        const firedDateStr = repMatch[1];
        const { parseLocalDate, toLocalDateString } = await import('../utils/date-utils');
        const firedDate = parseLocalDate(firedDateStr);
        const { getHolidays } = await import('../utils/holiday');
        const holidayCountry =
          (await AsyncStorage.getItem('holidayCountry')) ?? 'KR';
        const holidaySet = await getHolidays(holidayCountry, new Date().getFullYear());

        // repeatEvery 주기로 다음 날짜 계산 (최대 52회 탐색해 유효한 날짜 찾기)
        let candidate = new Date(firedDate);
        const now = new Date();
        for (let i = 0; i < 52; i++) {
          if (alarm.repeatEvery.unit === 'week') {
            candidate.setDate(candidate.getDate() + 7 * alarm.repeatEvery.value);
          } else {
            candidate.setMonth(candidate.getMonth() + alarm.repeatEvery.value);
          }
          candidate.setHours(alarm.hour, alarm.minute, 0, 0);
          if (candidate <= now) continue;
          const dateStr = toLocalDateString(candidate);
          const day = candidate.getDay();
          const skip =
            (alarm.excludeHolidays && holidaySet.has(dateStr)) ||
            (alarm.excludeWeekends && (day === 0 || day === 6));
          if (!skip) {
            await notifee.createTriggerNotification(
              { ...baseNotif, id: `${alarmId}_rep_${dateStr}` },
              { type: TriggerType.TIMESTAMP, timestamp: candidate.getTime(), alarmManager: alarmManagerOpts }
            );
            break;
          }
        }
        return;
      }

      /**
       * 반복 일자 제외 알람 (_excl_{date}):
       * 기존 _excl_ 트리거를 모두 취소한 뒤 scheduleAlarmWithNotifee를 재호출해
       * 다음 유효 날짜들을 새로 등록합니다.
       */
      const exclMatch = firedNotifId.match(/_excl_(\d{4}-\d{2}-\d{2})$/);
      if (exclMatch) {
        // 기존에 예약된 _excl_ 트리거들을 모두 취소하고 재등록
        const triggers = await notifee.getTriggerNotifications();
        const exclIds = triggers
          .filter((n: any) => n.notification.id?.startsWith(`${alarmId}_excl_`))
          .map((n: any) => n.notification.id as string);
        await Promise.all(exclIds.map((id: string) => notifee.cancelTriggerNotification(id)));
        const { scheduleAlarmWithNotifee: reschedule } = await import('../utils/notification-notifee');
        await reschedule(alarm);
        return;
      }

      // _once, _d{date} 등 나머지 패턴: 재등록 불필요 (일회성 또는 이미 개별 등록됨)
    } catch (e) {
      console.warn('[AlarmTask] 재등록 실패:', e);
    }
  });
}
