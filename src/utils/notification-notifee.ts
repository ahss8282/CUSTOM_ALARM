/**
 * notification-notifee.ts
 * Android 전용 — @notifee/react-native 기반 알람 스케줄링
 *
 * expo-notifications는 fullScreenAction(전체화면 자동 팝업)을 지원하지 않습니다.
 * notifee의 createTriggerNotification + AlarmManager를 사용하면:
 *   - 화면이 꺼진 잠금화면 상태에서도 알람 울림 화면이 자동으로 전체화면으로 뜹니다.
 *   - USE_EXACT_ALARM 권한으로 정확한 시각에 발동합니다.
 *   - bypassDnd: true로 방해금지 모드를 우회합니다.
 *
 * 주의: EAS Development Build 또는 실제 APK에서만 동작합니다.
 */
import { Platform, NativeModules } from 'react-native';
import Constants from 'expo-constants';
import type { Alarm } from '../types/alarm';

const isExpoGo = Constants.executionEnvironment === 'storeClient';

/**
 * Android + Development Build + notifee 네이티브 모듈 실제 탑재 여부를 확인합니다.
 *
 * @notifee/react-native는 설치 후 반드시 재빌드해야 네이티브 모듈이 APK에 포함됩니다.
 * 재빌드 전에는 JS 번들에는 포함되지만 NativeModules에 NotifeeApiModule이 없어서
 * 네이티브 메서드를 호출하면 "Native module not found" 오류가 발생합니다.
 * 이 함수로 실제 사용 가능 여부를 런타임에 확인합니다.
 */
export const canUseNotifee = (): boolean => {
  if (Platform.OS !== 'android' || isExpoGo) return false;
  // 네이티브 모듈 실제 탑재 여부 런타임 체크
  return !!NativeModules.NotifeeApiModule;
};

export const NOTIFEE_CHANNEL_ID = 'alarm_fullscreen';
export const UPCOMING_CHANNEL_ID = 'alarm_upcoming_v4';

/* ─── 채널 초기화 ─── */
export const setupNotifeeChannel = async (): Promise<string> => {
  if (!canUseNotifee()) return NOTIFEE_CHANNEL_ID;

  const notifee = (await import('@notifee/react-native')).default;
  const { AndroidImportance, AndroidVisibility } = await import('@notifee/react-native');

  // ── 알람 채널 (fullScreenIntent 용) ──────────────────────────────────────
  // 각 채널을 독립 try-catch로 분리: 한 채널 실패가 다른 채널 생성을 막지 않도록 합니다.
  try {
    await notifee.createChannel({
      id: NOTIFEE_CHANNEL_ID,
      name: '알람',
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      bypassDnd: true,
      sound: 'default',
      vibration: true,
      vibrationPattern: [300, 500, 200, 500],
    });
  } catch (e) {
    console.warn('[notifee] 알람 채널 생성 실패:', e);
  }

  // ── 예정 알람 채널 (30분 전 무음 알림) ─────────────────────────────────
  // importance: LOW → 소리·진동 원천 차단, 헤드업 배너 미표시, 알림 트레이에만 표시
  // 예정 알림은 헤드업이 불필요하므로 LOW가 가장 적합
  try {
    await notifee.createChannel({
      id: UPCOMING_CHANNEL_ID,
      name: '예정된 알람',
      importance: AndroidImportance.LOW,
      visibility: AndroidVisibility.PUBLIC,
      sound: '',
      vibration: false,
    });
  } catch (e) {
    console.warn('[notifee] 예정 알람 채널 생성 실패:', e);
  }

  return NOTIFEE_CHANNEL_ID;
};

/* ─── 다음 특정 요일 발동 시각 계산 ─── */
function getNextWeekdayTimestamp(hour: number, minute: number, weekday: number): number {
  // weekday: 0=일, 1=월 ... 6=토
  const now = new Date();
  const target = new Date();
  target.setHours(hour, minute, 0, 0);

  const daysUntil = (weekday - now.getDay() + 7) % 7;
  if (daysUntil === 0 && target <= now) {
    target.setDate(target.getDate() + 7); // 오늘 이미 지났으면 다음 주
  } else {
    target.setDate(target.getDate() + daysUntil);
  }
  return target.getTime();
}

/* ─── 알람 등록 ─── */
export const scheduleAlarmWithNotifee = async (alarm: Alarm): Promise<void> => {
  if (!canUseNotifee()) return;
  try {
    const notifee = (await import('@notifee/react-native')).default;
    const {
      TriggerType,
      AndroidImportance,
      AndroidVisibility,
      AndroidCategory,
    } = await import('@notifee/react-native');

    const channelId = await setupNotifeeChannel();
    const hh = String(alarm.hour).padStart(2, '0');
    const mm = String(alarm.minute).padStart(2, '0');

    /**
     * 공통 알림 내용
     * fullScreenAction.launchActivity: 'default' → MainActivity를 시작합니다.
     * Android는 이 Activity를 fullScreenIntent로 실행해 잠금화면 위에 전체화면으로 표시합니다.
     */
    const baseNotif = {
      title: alarm.name || '알람',
      body: `${hh}:${mm}`,
      data: { alarmId: alarm.id },
      android: {
        channelId,
        category: AndroidCategory.ALARM,
        fullScreenAction: {
          id: 'alarm_fullscreen',
          launchActivity: 'default',
        },
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        pressAction: { id: 'default', launchActivity: 'default' },
        bypassDnd: true,
      },
    };

    /** AlarmManager 설정: Doze 모드에서도 동작하는 정확한 알람 */
    const alarmManagerOpts = { allowWhileIdle: true };

    if (alarm.scheduleType === 'weekly') {
      if (alarm.weekdays.length === 0) {
        // 한 번만 알람
        const now = new Date();
        const target = new Date();
        target.setHours(alarm.hour, alarm.minute, 0, 0);
        if (target <= now) target.setDate(target.getDate() + 1);

        await notifee.createTriggerNotification(
          { ...baseNotif, id: `${alarm.id}_once` },
          { type: TriggerType.TIMESTAMP, timestamp: target.getTime(), alarmManager: alarmManagerOpts }
        );
      } else {
        // 요일 반복: 각 요일의 다음 발동 시각을 개별 등록
        for (const weekday of alarm.weekdays) {
          const timestamp = getNextWeekdayTimestamp(alarm.hour, alarm.minute, weekday);
          await notifee.createTriggerNotification(
            { ...baseNotif, id: `${alarm.id}_w${weekday}` },
            { type: TriggerType.TIMESTAMP, timestamp, alarmManager: alarmManagerOpts }
          );
        }
      }
    } else {
      // calendar 모드
      const now = new Date();
      for (const dateStr of alarm.calendarDates) {
        const trigger = new Date(`${dateStr}T${hh}:${mm}:00`);
        if (trigger > now) {
          await notifee.createTriggerNotification(
            { ...baseNotif, id: `${alarm.id}_d${dateStr}` },
            { type: TriggerType.TIMESTAMP, timestamp: trigger.getTime(), alarmManager: alarmManagerOpts }
          );
        }
      }
    }
  } catch (e) {
    console.warn('[notifee] 알람 스케줄 실패:', e);
  }
};

/* ─── 알람 취소 ─── */
export const cancelAlarmWithNotifee = async (alarmId: string): Promise<void> => {
  if (!canUseNotifee()) return;
  try {
    const notifee = (await import('@notifee/react-native')).default;
    const triggers = await notifee.getTriggerNotifications();
    const toCancel = triggers
      .filter((n) => n.notification.id?.startsWith(`${alarmId}_`))
      .map((n) => n.notification.id!);
    await Promise.all(toCancel.map((id) => notifee.cancelTriggerNotification(id)));
  } catch (e) {
    console.warn('[notifee] 알람 취소 실패:', e);
  }
};

/* ─── 예정 알람 알림 (30분 전, '지금 해제' 액션 포함) ─── */
/**
 * 알람 발동 30분 전에 조용한 알림을 표시합니다.
 * 이미 30분 이내인 경우에는 즉시 알림을 표시합니다.
 * '지금 해제' 버튼으로 알람을 취소할 수 있습니다.
 *
 * 알림 ID 규칙: {alarmId}_up_once / {alarmId}_up_w{weekday} / {alarmId}_up_d{date}
 * cancelAlarmWithNotifee()의 startsWith(`${alarmId}_`) 패턴이 이 ID도 포괄합니다.
 */
export async function scheduleUpcomingNotifications(alarm: Alarm): Promise<void> {
  if (!canUseNotifee()) return;
  try {
    // 채널이 반드시 존재하도록 보장 (앱 재설치 후 채널 미생성 방어)
    await setupNotifeeChannel();

    const notifee = (await import('@notifee/react-native')).default;
    const { TriggerType, AndroidImportance, AndroidVisibility } =
      await import('@notifee/react-native');

    const hh = String(alarm.hour).padStart(2, '0');
    const mm = String(alarm.minute).padStart(2, '0');
    const THIRTY_MIN_MS = 30 * 60 * 1000;
    const now = Date.now();

    /**
     * triggerNotifId: '지금 해제' 버튼을 눌렀을 때 어떤 회차 알람을 취소해야 하는지 식별합니다.
     * 예: alarmId가 'abc'이고 매주 월요일 알람이면 triggerNotifId = 'abc_w1'
     */
    const buildUpcomingNotif = (id: string, triggerNotifId: string) => ({
      id,
      title: '예정된 알람',
      body: `${hh}:${mm}${alarm.name ? ` — ${alarm.name}` : ''}`,
      data: { alarmId: alarm.id, type: 'upcoming', triggerNotifId },
      android: {
        channelId: UPCOMING_CHANNEL_ID,
        visibility: AndroidVisibility.PUBLIC,
        vibrationPattern: [],   // 알림 레벨에서도 진동 없음 명시
        pressAction: { id: 'default', launchActivity: 'default' },
        actions: [
          {
            title: '지금 해제',
            pressAction: { id: 'cancel_alarm' },
          },
        ],
      },
    });

    const scheduleOne = async (notifId: string, triggerNotifId: string, alarmTimestamp: number) => {
      const upcomingTimestamp = alarmTimestamp - THIRTY_MIN_MS;
      // 알람 발동까지 30분 이내 = 즉시 표시 (단, 알람 시각이 아직 미래일 때만)
      if (upcomingTimestamp <= now) {
        if (alarmTimestamp > now) {
          await notifee.displayNotification(buildUpcomingNotif(notifId, triggerNotifId));
        }
        return;
      }
      await notifee.createTriggerNotification(
        buildUpcomingNotif(notifId, triggerNotifId),
        {
          type: TriggerType.TIMESTAMP,
          timestamp: upcomingTimestamp,
          alarmManager: { allowWhileIdle: true },
        }
      );
    };

    if (alarm.scheduleType === 'weekly') {
      if (alarm.weekdays.length === 0) {
        // 한 번만 울리는 알람
        const target = new Date();
        target.setHours(alarm.hour, alarm.minute, 0, 0);
        if (target.getTime() <= now) target.setDate(target.getDate() + 1);
        await scheduleOne(`${alarm.id}_up_once`, `${alarm.id}_once`, target.getTime());
      } else {
        // 요일 반복 알람
        for (const weekday of alarm.weekdays) {
          const timestamp = getNextWeekdayTimestamp(alarm.hour, alarm.minute, weekday);
          await scheduleOne(`${alarm.id}_up_w${weekday}`, `${alarm.id}_w${weekday}`, timestamp);
        }
      }
    } else {
      // calendar 모드
      for (const dateStr of alarm.calendarDates) {
        const trigger = new Date(`${dateStr}T${hh}:${mm}:00`).getTime();
        if (trigger > now) {
          await scheduleOne(`${alarm.id}_up_d${dateStr}`, `${alarm.id}_d${dateStr}`, trigger);
        }
      }
    }
  } catch (e) {
    console.warn('[notifee] 예정 알람 알림 스케줄 실패:', e);
  }
}

/* ─── 요일 반복 알람 단일 회차 재등록 ─── */
/**
 * '지금 해제'로 이번 주 특정 요일 회차를 건너뛴 뒤 다음 주 동일 요일을 재등록합니다.
 * isEnabled는 건드리지 않으므로 알람 자체는 계속 활성 상태입니다.
 */
export async function rescheduleWeekdayOccurrence(alarm: Alarm, weekday: number): Promise<void> {
  if (!canUseNotifee()) return;
  try {
    const notifee = (await import('@notifee/react-native')).default;
    const {
      TriggerType,
      AndroidImportance,
      AndroidVisibility,
      AndroidCategory,
    } = await import('@notifee/react-native');

    const channelId = await setupNotifeeChannel();
    const hh = String(alarm.hour).padStart(2, '0');
    const mm = String(alarm.minute).padStart(2, '0');
    const now = Date.now();

    // 다음 주 해당 요일 발동 시각 계산
    // (이번 주 회차를 방금 취소했으므로 무조건 +7일 기준으로 계산)
    const next = new Date();
    next.setHours(alarm.hour, alarm.minute, 0, 0);
    const daysUntil = (weekday - next.getDay() + 7) % 7;
    next.setDate(next.getDate() + (daysUntil === 0 ? 7 : daysUntil));
    // 계산 결과가 여전히 과거라면(엣지케이스) 7일 추가
    if (next.getTime() <= now) next.setDate(next.getDate() + 7);

    const triggerNotifId = `${alarm.id}_w${weekday}`;

    // 알람 본체 재등록
    await notifee.createTriggerNotification(
      {
        id: triggerNotifId,
        title: alarm.name || '알람',
        body: `${hh}:${mm}`,
        data: { alarmId: alarm.id },
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
      { type: TriggerType.TIMESTAMP, timestamp: next.getTime(), alarmManager: { allowWhileIdle: true } }
    );

    // 예정 알림 재등록 (30분 전)
    const THIRTY_MIN_MS = 30 * 60 * 1000;
    const upcomingTs = next.getTime() - THIRTY_MIN_MS;
    if (upcomingTs > now) {
      await notifee.createTriggerNotification(
        {
          id: `${alarm.id}_up_w${weekday}`,
          title: '예정된 알람',
          body: `${hh}:${mm}${alarm.name ? ` — ${alarm.name}` : ''}`,
          data: { alarmId: alarm.id, type: 'upcoming', triggerNotifId },
          android: {
            channelId: UPCOMING_CHANNEL_ID,
            visibility: AndroidVisibility.PUBLIC,
            vibrationPattern: [],
            pressAction: { id: 'default', launchActivity: 'default' },
            actions: [{ title: '지금 해제', pressAction: { id: 'cancel_alarm' } }],
          },
        },
        { type: TriggerType.TIMESTAMP, timestamp: upcomingTs, alarmManager: { allowWhileIdle: true } }
      );
    }
  } catch (e) {
    console.warn('[notifee] 요일 반복 알람 재등록 실패:', e);
  }
}

/* ─── 스누즈: notifee로 N분 뒤 단발 알람 ─── */
export const scheduleSnoozeWithNotifee = async (
  alarm: Alarm,
  intervalMinutes: number
): Promise<void> => {
  if (!canUseNotifee()) return;
  try {
    const notifee = (await import('@notifee/react-native')).default;
    const { TriggerType, AndroidImportance, AndroidVisibility, AndroidCategory } =
      await import('@notifee/react-native');

    const channelId = await setupNotifeeChannel();
    const trigger = Date.now() + intervalMinutes * 60 * 1000;

    await notifee.createTriggerNotification(
      {
        id: `${alarm.id}_snooze`,
        title: `⏰ ${alarm.name || '알람'} (다시 울림)`,
        body: `${intervalMinutes}분 뒤 알람`,
        data: { alarmId: alarm.id, snooze: 'true' }, // notifee: data 값은 반드시 string
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
      { type: TriggerType.TIMESTAMP, timestamp: trigger, alarmManager: { allowWhileIdle: true } }
    );
  } catch (e) {
    console.warn('[notifee] 스누즈 스케줄 실패:', e);
  }
};
