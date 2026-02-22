import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { Alarm } from '../types/alarm';

const isExpoGo = Constants.executionEnvironment === 'storeClient';

// Android: 알람 전용 채널 (importance MAX = 잠금화면 전체화면 + 무음 우회)
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('alarm', {
    name: '알람',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 500, 200, 500],
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
  });
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const requestNotificationPermission = async (): Promise<boolean> => {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
};

/**
 * 알람 알림을 스케줄에 등록합니다.
 * - weekly 모드: weekdays 기반 반복 알림
 * - calendar 모드: 개별 날짜에 단발 알림
 */
export const scheduleAlarmNotification = async (alarm: Alarm): Promise<void> => {
  if (isExpoGo) return;

  const content: Notifications.NotificationContentInput = {
    title: alarm.name || '알람',
    body: `${String(alarm.hour).padStart(2, '0')}:${String(alarm.minute).padStart(2, '0')}`,
    sound: true,
    data: { alarmId: alarm.id },
    ...(Platform.OS === 'android' && { channelId: 'alarm' }),
  };

  if (alarm.scheduleType === 'weekly') {
    if (alarm.weekdays.length === 0) {
      // 한 번만
      const now = new Date();
      const trigger = new Date();
      trigger.setHours(alarm.hour, alarm.minute, 0, 0);
      if (trigger <= now) trigger.setDate(trigger.getDate() + 1);
      await Notifications.scheduleNotificationAsync({
        identifier: `${alarm.id}_once`,
        content,
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger },
      });
    } else {
      // 요일 반복 (expo-notifications weekday: 1=일, 2=월, ..., 7=토)
      for (const weekday of alarm.weekdays) {
        await Notifications.scheduleNotificationAsync({
          identifier: `${alarm.id}_w${weekday}`,
          content,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: weekday + 1,
            hour: alarm.hour,
            minute: alarm.minute,
          },
        });
      }
    }
  } else {
    // calendar 모드: 각 날짜에 단발 알림 등록
    const now = new Date();
    for (const dateStr of alarm.calendarDates) {
      const trigger = new Date(`${dateStr}T${String(alarm.hour).padStart(2, '0')}:${String(alarm.minute).padStart(2, '0')}:00`);
      if (trigger > now) {
        await Notifications.scheduleNotificationAsync({
          identifier: `${alarm.id}_d${dateStr}`,
          content,
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger },
        });
      }
    }
  }
};

export const cancelAlarmNotification = async (alarmId: string): Promise<void> => {
  if (isExpoGo) return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const toCancel = scheduled.filter((n) => n.identifier.startsWith(`${alarmId}_`));
  await Promise.all(
    toCancel.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );
};

/** 스누즈: N분 뒤 단발 알림 등록 */
export const scheduleSnoozeNotification = async (
  alarm: Alarm,
  intervalMinutes: number
): Promise<void> => {
  if (isExpoGo) return;
  const trigger = new Date(Date.now() + intervalMinutes * 60 * 1000);
  await Notifications.scheduleNotificationAsync({
    identifier: `${alarm.id}_snooze`,
    content: {
      title: `⏰ ${alarm.name || '알람'} (다시 울림)`,
      body: `${intervalMinutes}분 뒤 알람`,
      sound: true,
      data: { alarmId: alarm.id, snooze: true },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger },
  });
};
