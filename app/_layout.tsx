import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { useColorScheme } from 'react-native';
import * as Notifications from 'expo-notifications';
import 'react-native-reanimated';

import { useSettingsStore } from '@/src/store/settings-store';
import { useAlarmStore } from '@/src/store/alarm-store';
import { requestNotificationPermission } from '@/src/utils/notification';
import '@/src/i18n';

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

  useEffect(() => {
    loadSettings();
    loadAlarms();
    requestNotificationPermission();

    // 앱이 종료된 상태에서 알림 탭으로 열렸을 때 처리
    Notifications.getLastNotificationResponseAsync().then((response) => {
      const alarmId = response?.notification.request.content.data?.alarmId as string | undefined;
      if (alarmId) {
        // settingsStore 로드 완료 후 이동하도록 약간 지연
        setTimeout(() => router.push(`/alarm-ringing?alarmId=${alarmId}`), 300);
      }
    });

    // 포그라운드 알림 수신 → 알람 울림 화면으로 이동
    notifListenerRef.current = Notifications.addNotificationReceivedListener((notification) => {
      const alarmId = notification.request.content.data?.alarmId as string | undefined;
      if (alarmId) {
        router.push(`/alarm-ringing?alarmId=${alarmId}`);
      }
    });

    // 백그라운드 상태에서 알림 탭 → 알람 울림 화면으로 이동
    responseListenerRef.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const alarmId = response.notification.request.content.data?.alarmId as string | undefined;
      if (alarmId) {
        router.push(`/alarm-ringing?alarmId=${alarmId}`);
      }
    });

    return () => {
      notifListenerRef.current?.remove();
      responseListenerRef.current?.remove();
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
            gestureEnabled: false,    // 스와이프로 닫기 방지
          }}
        />
      </Stack>
      <StatusBar style={resolvedTheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}
