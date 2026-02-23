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
      setTimeout(() => router.push(`/alarm-ringing?alarmId=${alarmId}`), 300);
    };

    // ── AppState 리스너: 백그라운드 → 포그라운드 전환 시 pending 알람 확인 ──
    // alarm-task.ts의 onBackgroundEvent(DELIVERED)가 AsyncStorage에 저장한
    // pending_alarm_id를 여기서 읽어 alarm-ringing 화면으로 이동합니다.
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;
      if (prev !== 'active' && nextState === 'active') {
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
        const unsubscribe = notifee.onForegroundEvent(({ type, detail }) => {
          if (type === EventType.DELIVERED || type === EventType.PRESS) {
            const alarmId = detail.notification?.data?.alarmId as string | undefined;
            if (alarmId) navigateToRinging(alarmId);
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
