import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { useColorScheme, Platform, Alert, AppState, AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-reanimated';

import { useSettingsStore } from '@/src/store/settings-store';
import { useAlarmStore } from '@/src/store/alarm-store';
import { requestNotificationPermission } from '@/src/utils/notification';
import { requestBatteryOptimizationOnce } from '@/src/utils/battery-optimization';
import { canUseNotifee, setupNotifeeChannel } from '@/src/utils/notification-notifee';
import {
  openExactAlarmSettings,
  openFullScreenIntentSettings,
  needsExactAlarmPermission,
  needsFullScreenIntentPermission,
} from '@/src/utils/alarm-permissions';
// notifee 백그라운드 이벤트 핸들러 등록 (반드시 모듈 최상단에서 import)
import '@/src/tasks/alarm-task';
import '@/src/i18n';

/** 최초 1회 권한 안내를 완료했는지 확인하는 AsyncStorage 키 */
const ALARM_PERMS_ASKED_KEY = 'alarm_perms_asked_v1';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const router = useRouter();
  const systemColorScheme = useColorScheme();
  const { theme, loadSettings, isLoaded: settingsLoaded } = useSettingsStore();
  const { loadAlarms } = useAlarmStore();

  const notifListenerRef = useRef<Notifications.EventSubscription | null>(null);
  const responseListenerRef = useRef<Notifications.EventSubscription | null>(null);
  const notifeeFgUnsubRef = useRef<(() => void) | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    loadSettings();
    loadAlarms();
    requestNotificationPermission();
    requestBatteryOptimizationOnce();
    // notifee 채널을 앱 시작 시 즉시 생성 (채널이 없으면 fullScreenAction이 동작 안 함)
    if (canUseNotifee()) setupNotifeeChannel();

    // ── 권한 안내: 최초 1회만 표시 ─────────────────────────────────────────
    // SCHEDULE_EXACT_ALARM (Android 12+) / USE_FULL_SCREEN_INTENT (Android 14+)
    if (Platform.OS === 'android' && canUseNotifee()) {
      (async () => {
        const asked = await AsyncStorage.getItem(ALARM_PERMS_ASKED_KEY);
        if (asked) return; // 이미 안내했으면 건너뜀

        let shown = false;

        if (needsExactAlarmPermission()) {
          shown = true;
          await new Promise<void>((resolve) => {
            Alert.alert(
              '정확한 알람 권한 필요',
              '알람이 정확한 시각에 울리려면 "알람 및 리마인더" 권한이 필요합니다.\n설정에서 허용해 주세요.',
              [
                { text: '나중에', style: 'cancel', onPress: () => resolve() },
                {
                  text: '설정으로',
                  onPress: async () => { await openExactAlarmSettings(); resolve(); },
                },
              ]
            );
          });
        }

        if (needsFullScreenIntentPermission()) {
          shown = true;
          await new Promise<void>((resolve) => {
            Alert.alert(
              '전체화면 알람 권한 필요',
              '화면이 꺼진 상태에서 알람 화면을 자동으로 표시하려면 "전체화면 인텐트" 권한이 필요합니다.\n설정에서 허용해 주세요.',
              [
                { text: '나중에', style: 'cancel', onPress: () => resolve() },
                {
                  text: '설정으로',
                  onPress: async () => { await openFullScreenIntentSettings(); resolve(); },
                },
              ]
            );
          });
        }

        // 한 번이라도 안내했으면(또는 해당 Android 버전이 아니면) 키 저장
        if (shown || (!needsExactAlarmPermission() && !needsFullScreenIntentPermission())) {
          await AsyncStorage.setItem(ALARM_PERMS_ASKED_KEY, 'true');
        }
      })();
    }

    const navigateToRinging = (alarmId: string) => {
      // diag_test ID는 진단용 테스트 알람이므로 실제 알람 화면으로 이동하지 않음
      if (alarmId === 'diag_test') return;
      // push 대신 replace: alarm-ringing이 스택에 중복 쌓이는 것을 방지합니다.
      // push를 쓰면 알람이 여러 번 발동될 때마다 스택에 쌓여
      // 뒤로가기를 알람 횟수만큼 눌러야 탈출할 수 있습니다.
      setTimeout(() => router.replace(`/alarm-ringing?alarmId=${alarmId}`), 300);
    };

    // ── AppState 리스너: 백그라운드 → 포그라운드 전환 시 알람 확인 ──────────
    //
    // [이전 방식의 문제]
    // onBackgroundEvent(Headless JS)가 AsyncStorage에 pending_alarm_id를 저장하고,
    // UI 스레드의 AppState 리스너가 읽는 방식은 두 프로세스 간 race condition이 있습니다.
    //
    // [새로운 방식]
    // 1순위: getDisplayedNotifications() — 알림은 fullScreenAction보다 먼저 표시됩니다.
    //        앱이 포그라운드가 될 때 알림이 이미 표시 중이므로 race condition이 없습니다.
    // 2순위: pending_alarm_id (AsyncStorage) — 사용자가 알림을 직접 닫은 후 앱을 수동으로
    //        열었을 때 fallback으로 사용합니다.
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;
      if (prev !== 'active' && nextState === 'active') {
        // 1순위: 현재 표시된 알람 알림 직접 조회
        if (canUseNotifee()) {
          try {
            const { default: notifee } = await import('@notifee/react-native');
            const displayed = await notifee.getDisplayedNotifications();
            const alarmNotif = displayed.find(
              (n) => {
                const id = n.notification.data?.alarmId as string | undefined;
                return id && id !== 'diag_test';
              }
            );
            if (alarmNotif) {
              const alarmId = alarmNotif.notification.data!.alarmId as string;
              navigateToRinging(alarmId);
              return;
            }
          } catch {}
        }

        // 2순위: AsyncStorage fallback (알림을 직접 닫은 뒤 앱을 수동으로 연 경우)
        try {
          const pendingId = await AsyncStorage.getItem('pending_alarm_id');
          if (pendingId) {
            await AsyncStorage.removeItem('pending_alarm_id');
            navigateToRinging(pendingId);
          }
        } catch {}
      }
    };
    const appStateSub = AppState.addEventListener('change', handleAppStateChange);

    // ── Android: notifee 이벤트 처리 ──────────────────────────────────────
    if (Platform.OS === 'android' && canUseNotifee()) {
      import('@notifee/react-native').then(({ default: notifee, EventType }) => {
        /**
         * 앱이 종료된 상태에서 fullScreenIntent로 열렸을 때:
         * getInitialNotification()이 해당 알림 데이터를 반환합니다.
         * 또한 alarm-task의 onBackgroundEvent가 저장한 pending_alarm_id도 확인합니다.
         */
        notifee.getInitialNotification().then(async (initial) => {
          const alarmId = initial?.notification?.data?.alarmId as string | undefined;
          if (alarmId) {
            navigateToRinging(alarmId);
            return;
          }
          // 앱이 종료된 채로 AlarmManager가 발동 → onBackgroundEvent 실행 →
          // pending_alarm_id 저장 → 앱 재시작 후 여기서 읽음
          try {
            const pendingId = await AsyncStorage.getItem('pending_alarm_id');
            if (pendingId) {
              await AsyncStorage.removeItem('pending_alarm_id');
              navigateToRinging(pendingId);
            }
          } catch {}
        });

        /**
         * 앱이 포그라운드 상태에서 notifee 알림 이벤트 수신:
         * DELIVERED: 알람 시각에 알림 발동 → alarm-ringing 화면으로 이동
         * PRESS: 사용자가 알림 탭 → alarm-ringing 화면으로 이동
         */
        const unsubscribe = notifee.onForegroundEvent(async ({ type, detail }) => {
          if (type === EventType.DELIVERED || type === EventType.PRESS) {
            const alarmId = detail.notification?.data?.alarmId as string | undefined;
            if (alarmId) navigateToRinging(alarmId);
          }

          // ── 포그라운드 '지금 해제' 버튼 처리 ──────────────────────────
          if (type === EventType.ACTION_PRESS &&
              detail.pressAction?.id === 'cancel_alarm') {
            const alarmId = detail.notification?.data?.alarmId as string | undefined;
            const triggerNotifId = detail.notification?.data?.triggerNotifId as string | undefined;
            const displayedNotifId = detail.notification?.id as string | undefined;
            if (!alarmId) return;

            if (triggerNotifId) {
              // 1. 해당 회차 알람 트리거만 취소
              try { await notifee.cancelTriggerNotification(triggerNotifId); } catch {}

              // 2. 표시된 예정 알림 닫기
              if (displayedNotifId) {
                try { await notifee.cancelDisplayedNotification(displayedNotifId); } catch {}
              }

              const weekdayMatch = triggerNotifId.match(/_w(\d+)$/);
              if (weekdayMatch) {
                // 요일 반복: 다음 주 동일 요일 재등록 (isEnabled 유지)
                const weekday = parseInt(weekdayMatch[1]);
                const alarm = useAlarmStore.getState().alarms.find((a) => a.id === alarmId);
                if (alarm && alarm.isEnabled) {
                  const { rescheduleWeekdayOccurrence } = await import('@/src/utils/notification-notifee');
                  await rescheduleWeekdayOccurrence(alarm, weekday);
                }
              } else if (triggerNotifId.endsWith('_once')) {
                // 일회성 알람: Zustand로 비활성화 (UI 즉시 반영)
                await useAlarmStore.getState().updateAlarm(alarmId, { isEnabled: false });
              }
              // 캘린더 (_d{date}): 해당 날짜 트리거만 취소됨, 나머지 날짜 유지
            } else {
              // triggerNotifId 없음: 이전 버전 호환 fallback
              await useAlarmStore.getState().updateAlarm(alarmId, { isEnabled: false });
            }
          }
        });
        notifeeFgUnsubRef.current = unsubscribe;
      }).catch(() => {});
    }

    // ── iOS / expo-notifications 이벤트 처리 ─────────────────────────────
    // 앱이 종료된 상태에서 expo-notifications 탭으로 열렸을 때
    Notifications.getLastNotificationResponseAsync().then((response) => {
      const alarmId = response?.notification.request.content.data?.alarmId as string | undefined;
      if (alarmId) navigateToRinging(alarmId);
    });

    // 포그라운드 알림 수신 (iOS + notifee 미탑재 Android)
    notifListenerRef.current = Notifications.addNotificationReceivedListener((notification) => {
      if (canUseNotifee()) return; // notifee가 처리
      const alarmId = notification.request.content.data?.alarmId as string | undefined;
      if (alarmId) navigateToRinging(alarmId);
    });

    // 백그라운드 → 포그라운드 전환 시 알림 탭 (iOS + notifee 미탑재 Android)
    responseListenerRef.current = Notifications.addNotificationResponseReceivedListener((response) => {
      if (canUseNotifee()) return; // notifee가 처리
      const alarmId = response.notification.request.content.data?.alarmId as string | undefined;
      if (alarmId) navigateToRinging(alarmId);
    });

    return () => {
      notifListenerRef.current?.remove();
      responseListenerRef.current?.remove();
      notifeeFgUnsubRef.current?.();
      appStateSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolvedTheme =
    theme === 'system' ? (systemColorScheme ?? 'light') : theme;

  if (!settingsLoaded) return null;

  return (
    <ThemeProvider value={resolvedTheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="alarm/[id]"
          options={{ headerShown: false, presentation: 'modal' }}
        />
        <Stack.Screen
          name="alarm-ringing"
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
            animation: 'fade',
            gestureEnabled: false,
          }}
        />
      </Stack>
      <StatusBar style={resolvedTheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}
