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

/* ─── 채널 초기화 ─── */
export const setupNotifeeChannel = async (): Promise<string> => {
  if (!canUseNotifee()) return NOTIFEE_CHANNEL_ID;
  try {
    const notifee = (await import('@notifee/react-native')).default;
    const { AndroidImportance, AndroidVisibility } = await import('@notifee/react-native');

    // 이미 존재하는 채널이라도 동일 ID로 createChannel을 호출하면 무시됩니다.
    // 단, 처음 생성 시 importance/sound/vibration 이 적용되므로
    // 앱 설치 직후 or 채널 삭제 후 재생성 시 올바른 값이 들어가야 합니다.
    await notifee.createChannel({
      id: NOTIFEE_CHANNEL_ID,
      name: '알람',
      importance: AndroidImportance.HIGH,  // Samsung이 HIGH 이상만 fullscreen 허용
      visibility: AndroidVisibility.PUBLIC,
      bypassDnd: true,
      sound: 'default',                    // 사운드 없으면 Samsung이 낮은 우선순위로 처리
      vibration: true,
      vibrationPattern: [300, 500, 200, 500], // notifee: 모든 값이 양수여야 함 (0 불가)
    });
    return NOTIFEE_CHANNEL_ID;
  } catch (e) {
    console.warn('[notifee] 채널 생성 실패:', e);
    return NOTIFEE_CHANNEL_ID; // 실패해도 ID는 반환 (이미 존재할 수 있음)
  }
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
