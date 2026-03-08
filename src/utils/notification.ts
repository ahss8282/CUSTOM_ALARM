import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alarm } from '../types/alarm';
import {
  canUseNotifee,
  scheduleAlarmWithNotifee,
  cancelAlarmWithNotifee,
  scheduleSnoozeWithNotifee,
  setupNotifeeChannel,
  scheduleUpcomingNotifications,
} from './notification-notifee';
import { getHolidays } from './holiday';

const isExpoGo = Constants.executionEnvironment === 'storeClient';

// Android: expo-notifications 폴백 채널 (notifee 미사용 환경용)
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
  // notifee 채널도 미리 생성
  setupNotifeeChannel();
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
 * 알람을 스케줄에 등록합니다.
 *
 * Android (Development Build):
 *   → notifee.createTriggerNotification 사용
 *   → fullScreenAction으로 화면 꺼짐 상태에서도 자동 전체화면 팝업
 *
 * iOS / Expo Go:
 *   → expo-notifications 사용
 */
export const scheduleAlarmNotification = async (alarm: Alarm): Promise<void> => {
  if (isExpoGo && Platform.OS === 'android') return;

  // Android: notifee (네이티브 모듈이 실제로 탑재된 경우에만)
  // canUseNotifee()가 false면 notifee 네이티브 모듈이 없는 것이므로 expo-notifications로 폴백
  if (canUseNotifee()) {
    try {
      await scheduleAlarmWithNotifee(alarm);
      await scheduleUpcomingNotifications(alarm); // 30분 전 예정 알림
      return; // notifee 성공 시에만 return
    } catch (e) {
      console.warn('[notification] notifee 스케줄 실패, expo-notifications로 폴백:', e);
      // 아래 expo-notifications 경로로 계속 진행
    }
  }

  // iOS / notifee 미탑재 Android / fallback: expo-notifications
  const content: Notifications.NotificationContentInput = {
    title: alarm.name || '알람',
    body: `${String(alarm.hour).padStart(2, '0')}:${String(alarm.minute).padStart(2, '0')}`,
    sound: true,
    data: { alarmId: alarm.id },
  };

  if (alarm.scheduleType === 'weekly') {
    if (alarm.weekdays.length === 0) {
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
    // iOS/fallback: calendar 모드
    // excludeHolidays/excludeWeekends 최선 노력으로 적용 (반복 주기 재등록은 미지원)
    const now = new Date();
    const hasExclusion = alarm.excludeHolidays || alarm.excludeWeekends;
    let holidaySet = new Set<string>();
    if (hasExclusion) {
      try {
        const holidayCountry = (await AsyncStorage.getItem('holidayCountry')) ?? 'KR';
        holidaySet = await getHolidays(holidayCountry, new Date().getFullYear());
      } catch {
        // 공휴일 API 실패 시 빈 Set으로 진행
      }
    }

    for (const dateStr of alarm.calendarDates) {
      const trigger = new Date(
        `${dateStr}T${String(alarm.hour).padStart(2, '0')}:${String(alarm.minute).padStart(2, '0')}:00`
      );
      if (trigger <= now) continue;
      // 주말 제외 (0=일, 6=토)
      const day = trigger.getDay();
      if (alarm.excludeWeekends && (day === 0 || day === 6)) continue;
      // 공휴일 제외
      if (alarm.excludeHolidays && holidaySet.has(dateStr)) continue;

      await Notifications.scheduleNotificationAsync({
        identifier: `${alarm.id}_d${dateStr}`,
        content,
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger },
      });
    }
  }
};

export const cancelAlarmNotification = async (alarmId: string): Promise<void> => {
  if (isExpoGo && Platform.OS === 'android') return;

  // Android: notifee 취소 시도 (탑재된 경우)
  if (canUseNotifee()) {
    try {
      await cancelAlarmWithNotifee(alarmId);
    } catch (e) {
      console.warn('[notification] notifee 취소 실패:', e);
    }
    // notifee 성공·실패 관계없이 expo-notifications 예약도 함께 취소
    // (notifee 도입 이전에 expo-notifications로 등록된 알람이 남아있을 수 있음)
  }

  // iOS / notifee 미탑재 Android / expo-notifications 잔여분 정리
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const toCancel = scheduled.filter((n) => n.identifier.startsWith(`${alarmId}_`));
  await Promise.all(
    toCancel.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );
};

/** 스누즈: N분 뒤 단발 알림 */
export const scheduleSnoozeNotification = async (
  alarm: Alarm,
  intervalMinutes: number
): Promise<void> => {
  if (isExpoGo && Platform.OS === 'android') return;

  // Android: notifee
  if (canUseNotifee()) {
    try {
      await scheduleSnoozeWithNotifee(alarm, intervalMinutes);
      return;
    } catch (e) {
      console.warn('[notification] notifee 스누즈 실패, expo-notifications로 폴백:', e);
    }
  }

  // iOS / notifee 미탑재 Android / fallback
  const trigger = new Date(Date.now() + intervalMinutes * 60 * 1000);
  await Notifications.scheduleNotificationAsync({
    identifier: `${alarm.id}_snooze`,
    content: {
      title: `⏰ ${alarm.name || '알람'} (다시 울림)`,
      body: `${intervalMinutes}분 뒤 알람`,
      sound: true,
      data: { alarmId: alarm.id, snooze: 'true' },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger },
  });
};
