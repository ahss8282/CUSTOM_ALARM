import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ImageBackground,
  Platform,
  StatusBar,
  Dimensions,
  BackHandler,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Asset } from 'expo-asset';

import { useAlarmStore } from '@/src/store/alarm-store';
import { useSoundStore, isCustomSoundId, parseCustomSoundId } from '@/src/store/sound-store';
import { scheduleSnoozeNotification } from '@/src/utils/notification';
import { playAlarmNative, stopAlarmNative, isNativeAlarmAudioAvailable, moveAppToBackground, setLockScreenFlags } from '@/src/utils/alarm-audio-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

const { width: SCREEN_W } = Dimensions.get('window');

/* ── 스누즈 횟수 AsyncStorage 키 ── */
const snoozeCountKey = (id: string) => `snooze_count_${id}`;

/* ── 수학 문제 생성 ── */
function generateMath(): { question: string; answer: number } {
  const a = Math.floor(Math.random() * 50) + 10;
  const b = Math.floor(Math.random() * 30) + 5;
  const add = Math.random() > 0.5;
  return {
    question: add ? `${a} + ${b} = ?` : `${a + b} - ${b} = ?`,
    answer: add ? a + b : a,
  };
}

export default function AlarmRingingScreen() {
  const { alarmId } = useLocalSearchParams<{ alarmId: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const alarm = useAlarmStore((s) => s.alarms.find((a) => a.id === alarmId));
  const isStoreLoaded = useAlarmStore((s) => s.isLoaded);
  const { customSounds, loadSounds } = useSoundStore();
  useEffect(() => { loadSounds(); }, []);

  /* ── 사운드 (expo-av Audio.Sound: 수동 lifecycle 관리, 이중 해제 방지) ── */
  const playerRef = useRef<Audio.Sound | null>(null);

  /* ── 현재 시각 ── */
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  /* ── 화면 켜기 (expo-keep-awake): 알람 울림 중 화면이 꺼지지 않도록 ── */
  useEffect(() => {
    activateKeepAwakeAsync('alarm-ringing');
    return () => { deactivateKeepAwake('alarm-ringing'); };
  }, []);

  /* ── soundId에 따른 오디오 소스 결정 ── */
  const getAudioSource = () => {
    const soundId = alarm?.soundId ?? 'default';
    if (isCustomSoundId(soundId)) {
      const id = parseCustomSoundId(soundId);
      const cs = customSounds.find((s) => s.id === id);
      if (cs) return { uri: cs.uri };
    }
    // 내장 사운드 맵
    const builtinMap: Record<string, any> = {
      default: require('@/assets/sounds/alarm_default.mp3'),
      bell:    require('@/assets/sounds/alarm_bell.mp3'),
      digital: require('@/assets/sounds/alarm_digital.mp3'),
      gentle:  require('@/assets/sounds/alarm_soft.mp3'),
    };
    return builtinMap[soundId] ?? builtinMap['default'];
  };

  /* ── 사운드 재생 시작 ── */
  useEffect(() => {
    let mounted = true;
    const volume = alarm ? alarm.volume / 100 : 1.0;
    const source = getAudioSource();

    const start = async () => {
      try {
        // Android: STREAM_ALARM 네이티브 모듈로 무음/진동 모드 우회
        if (isNativeAlarmAudioAvailable()) {
          let uri: string;
          if (typeof source === 'object' && 'uri' in source) {
            // 커스텀 사운드: 이미 file:// URI
            uri = source.uri;
          } else {
            // 내장 사운드(require): expo-asset으로 로컬 파일 URI 획득
            const asset = Asset.fromModule(source as number);
            await asset.downloadAsync();
            uri = asset.localUri ?? '';
          }
          if (uri) {
            const ok = await playAlarmNative(uri, volume);
            if (ok) return; // 네이티브 성공 시 expo-audio 스킵
          }
        }

        // iOS 또는 네이티브 실패 시: expo-av Audio.Sound 사용
        // playsInSilentModeIOS: true → iOS 무음 스위치 우회
        try {
          await Audio.setAudioModeAsync({
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
          });
        } catch {
          // 오디오 모드 설정 실패 시 무시하고 재생 시도
        }
        try {
          const { sound } = await Audio.Sound.createAsync(source, {
            isLooping: true,
            volume,
            shouldPlay: true,
          });
          if (!mounted) { await sound.unloadAsync(); return; }
          playerRef.current = sound;
        } catch {
          // 사운드 파일 없을 경우 무시
        }
      } catch {
        // 예상치 못한 에러 무시
      }
    };
    start();
    return () => {
      mounted = false;
      // Android 네이티브 오디오 정지
      stopAlarmNative();
      playerRef.current?.unloadAsync();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customSounds]);

  /* ── 진동 반복 (vibration ON인 경우) ── */
  useEffect(() => {
    if (!alarm?.vibration) return;
    const id = setInterval(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }, 1500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alarm?.vibration]);

  /* ── 종료 공통 처리 ── */
  const stopAndClose = useCallback(async () => {
    stopAlarmNative();
    await playerRef.current?.stopAsync();
    await playerRef.current?.unloadAsync();
    playerRef.current = null;
    // 잠금화면 플래그 해제: 이후 일반 화면에서 최근 앱 버튼 복원
    await setLockScreenFlags(false);
    if (alarmId) await AsyncStorage.removeItem(snoozeCountKey(alarmId));
    // pending_alarm_id 및 notifee 표시 알림 취소:
    // getDisplayedNotifications()가 앱 재실행 시 같은 알림을 다시 찾아
    // 알람 화면이 반복 표시되는 것을 방지합니다.
    if (alarmId) await AsyncStorage.removeItem('pending_alarm_id');
    if (Platform.OS === 'android') {
      try {
        const notifee = require('@notifee/react-native').default;
        // cancelDisplayedNotifications: 표시된 알림만 제거합니다.
        // cancelAllNotifications는 예약된 미래 트리거 알림까지 삭제하므로 사용 금지.
        await notifee.cancelDisplayedNotifications();
      } catch {}
    }
    router.replace('/(tabs)');
    if (Platform.OS === 'android') {
      await moveAppToBackground();
    }
  }, [alarmId, router]);

  /* ── 스누즈 ── */
  const [snoozeLeft, setSnoozeLeft] = useState<number>(-1); // -1 = 아직 미확인
  useEffect(() => {
    if (!alarm || !alarmId) return;
    AsyncStorage.getItem(snoozeCountKey(alarmId)).then((v) => {
      const used = v ? parseInt(v) : 0;
      const max = alarm.snooze.maxCount; // -1 = 무제한
      setSnoozeLeft(max === -1 ? 999 : Math.max(0, max - used));
    });
  }, [alarm, alarmId]);

  const handleSnooze = useCallback(async () => {
    if (!alarm || !alarmId || !isStoreLoaded) return;
    const key = snoozeCountKey(alarmId);
    const used = parseInt((await AsyncStorage.getItem(key)) ?? '0');
    await AsyncStorage.setItem(key, String(used + 1));
    await scheduleSnoozeNotification(alarm, alarm.snooze.intervalMinutes);
    stopAlarmNative();
    await playerRef.current?.stopAsync();
    await playerRef.current?.unloadAsync();
    playerRef.current = null;
    // 잠금화면 플래그 해제
    await setLockScreenFlags(false);
    // 현재 알람 알림만 취소 (스누즈 알림은 유지해야 하므로 cancelAllNotifications 불가)
    // pending_alarm_id도 제거해 앱 재실행 시 알람 화면이 다시 뜨지 않도록 합니다.
    if (alarmId) await AsyncStorage.removeItem('pending_alarm_id');
    if (Platform.OS === 'android') {
      try {
        const notifee = require('@notifee/react-native').default;
        const displayed = await notifee.getDisplayedNotifications();
        const toCancel = displayed
          .filter((n: any) => n.notification.data?.alarmId === alarmId)
          .map((n: any) => n.notification.id as string);
        await Promise.all(toCancel.map((id: string) => notifee.cancelDisplayedNotification(id)));
      } catch {}
    }
    router.replace('/(tabs)');
    if (Platform.OS === 'android') {
      await moveAppToBackground();
    }
  }, [alarm, alarmId, router]);

  /* ── 수학 문제 모달 ── */
  const [mathVisible, setMathVisible] = useState(false);
  const [mathProblem, setMathProblem] = useState(generateMath);
  const [mathInput, setMathInput] = useState('');
  const [mathError, setMathError] = useState(false);

  const handleStopPress = useCallback(() => {
    // alarm이 아직 로드되지 않았으면 버튼 무시 (강화 조건을 undefined로 통과하는 것 방지)
    if (!isStoreLoaded) return;
    if (alarm?.snooze.enforced) {
      setMathProblem(generateMath());
      setMathInput('');
      setMathError(false);
      setMathVisible(true);
    } else {
      stopAndClose();
    }
  }, [alarm, isStoreLoaded, stopAndClose]);

  /* ── Android 하드웨어 뒤로가기 버튼 차단 ── */
  // gestureEnabled:false는 iOS 스와이프만 막습니다.
  // Android 뒤로가기 버튼을 막지 않으면 알람 편집 화면 등 이전 화면으로 돌아갑니다.
  // 뒤로가기를 누르면 알람 종료(handleStopPress)로 처리합니다.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleStopPress();
      return true; // true 반환 = 기본 뒤로가기 동작 차단
    });
    return () => sub.remove();
  }, [handleStopPress]);

  const handleMathConfirm = useCallback(() => {
    if (parseInt(mathInput) === mathProblem.answer) {
      setMathVisible(false);
      stopAndClose();
    } else {
      setMathError(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setMathInput('');
    }
  }, [mathInput, mathProblem, stopAndClose]);

  /* ── 배경 설정 ── */
  const bg = alarm?.background ?? { type: 'color', value: '#d1d0ec' };
  const isImage = bg.type === 'image' && bg.value.startsWith('file');

  /* ── 시각 포맷 ── */
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const dateStr = now.toLocaleDateString('ko-KR', { weekday: 'long', month: 'long', day: 'numeric' });

  const canSnooze = alarm?.snooze.enabled && snoozeLeft !== 0;

  /* ── 숫자 키패드 ── */
  const numKeys = ['1','2','3','4','5','6','7','8','9','⌫','0','✓'];

  const handleKey = (k: string) => {
    if (k === '⌫') {
      setMathInput((p) => p.slice(0, -1));
      setMathError(false);
    } else if (k === '✓') {
      handleMathConfirm();
    } else if (mathInput.length < 5) {
      setMathInput((p) => p + k);
      setMathError(false);
    }
  };

  const Wrapper = isImage ? ImageBackground : View;
  const wrapperProps = isImage
    ? { source: { uri: bg.value }, style: [styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }] }
    : { style: [styles.screen, { backgroundColor: bg.value, paddingTop: insets.top, paddingBottom: insets.bottom }] };

  return (
    <>
      <StatusBar hidden />
      {/* @ts-ignore - Wrapper가 View 또는 ImageBackground */}
      <Wrapper {...wrapperProps}>
        {/* 글로우 배경 효과 */}
        <View style={styles.glowTop} />
        <View style={styles.glowBottom} />

        {/* 상단: 알람 이름 + 날짜 */}
        <View style={styles.header}>
          {alarm?.name ? (
            <View style={styles.nameBadge}>
              <Ionicons name="alarm" size={16} color="#2d2d4e" />
              <Text style={styles.nameBadgeText}>{alarm.name}</Text>
            </View>
          ) : null}
          <Text style={styles.dateText}>{dateStr}</Text>
        </View>

        {/* 중앙: 시각 */}
        <View style={styles.center}>
          <Text style={styles.timeText}>{hh}:{mm}</Text>
        </View>

        {/* 하단: 버튼 */}
        <View style={styles.buttons}>
          {/* 스누즈 버튼 */}
          {canSnooze ? (
            <View style={styles.btnGroup}>
              <TouchableOpacity style={styles.snoozeBtn} onPress={handleSnooze} activeOpacity={0.8}>
                <Ionicons name="time-outline" size={36} color="#2d2d4e" />
              </TouchableOpacity>
              <Text style={styles.btnLabel}>{t('ringing.snooze')}</Text>
              {alarm && alarm.snooze.maxCount !== -1 && snoozeLeft < 999 && (
                <Text style={styles.snoozeLeftText}>
                  {t('ringing.snoozeLeft', { count: snoozeLeft })}
                </Text>
              )}
            </View>
          ) : (
            <View style={styles.btnGroup}>
              <View style={[styles.snoozeBtn, styles.disabledBtn]}>
                <Ionicons name="time-outline" size={36} color="#9999bb" />
              </View>
              <Text style={[styles.btnLabel, { color: '#9999bb' }]}>{t('ringing.snoozeNone')}</Text>
            </View>
          )}

          {/* 끄기 버튼 */}
          <View style={styles.btnGroup}>
            <TouchableOpacity style={styles.stopBtn} onPress={handleStopPress} activeOpacity={0.8}>
              <Ionicons name="close" size={36} color="#d1d0ec" />
            </TouchableOpacity>
            <Text style={[styles.btnLabel, { color: '#1a1a2e' }]}>{t('ringing.stop')}</Text>
          </View>
        </View>
      </Wrapper>

      {/* ── 수학 문제 모달 ── */}
      <Modal visible={mathVisible} transparent animationType="fade">
        <View style={styles.mathBackdrop}>
          <View style={styles.mathCard}>
            {/* 아이콘 */}
            <View style={styles.mathIconBox}>
              <Ionicons name="calculator-outline" size={32} color="#2d2d4e" />
            </View>

            <Text style={styles.mathTitle}>{t('ringing.mathTitle')}</Text>
            <Text style={styles.mathDesc}>{t('ringing.mathDesc')}</Text>

            {/* 문제 */}
            <Text style={styles.mathQuestion}>{mathProblem.question}</Text>

            {/* 입력 표시 */}
            <View style={[styles.mathInputBox, mathError && styles.mathInputError]}>
              <Text style={styles.mathInputText}>{mathInput || ' '}</Text>
            </View>

            {/* 숫자 키패드 */}
            <View style={styles.numpad}>
              {numKeys.map((k) => (
                <TouchableOpacity
                  key={k}
                  style={[styles.numKey, k === '✓' && styles.numKeyConfirm]}
                  onPress={() => handleKey(k)}
                  activeOpacity={0.7}
                >
                  {k === '⌫' ? (
                    <Ionicons name="backspace-outline" size={20} color="#2d2d4e" />
                  ) : k === '✓' ? (
                    <Ionicons name="checkmark-circle" size={22} color="#d1d0ec" />
                  ) : (
                    <Text style={styles.numKeyText}>{k}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* 오답 메시지 */}
            {mathError && (
              <Text style={styles.mathErrorText}>{t('ringing.wrongAnswer')}</Text>
            )}

            {/* 스누즈로 전환 */}
            {canSnooze && (
              <TouchableOpacity
                onPress={() => { setMathVisible(false); handleSnooze(); }}
                style={styles.mathSnoozeLink}
              >
                <Text style={styles.mathSnoozeLinkText}>{t('ringing.mathSnoozeInstead')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  glowTop: {
    position: 'absolute',
    top: '20%',
    left: '20%',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(255,255,255,0.18)',
    transform: [{ scaleX: 1.5 }],
  },
  glowBottom: {
    position: 'absolute',
    bottom: '20%',
    right: '15%',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(209,208,236,0.25)',
    transform: [{ scaleY: 0.8 }],
  },
  header: { alignItems: 'center', gap: 8, marginTop: 16 },
  nameBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  nameBadgeText: { fontSize: 14, fontWeight: '600', color: '#2d2d4e' },
  dateText: { fontSize: 13, color: 'rgba(45,45,78,0.7)', fontWeight: '500', letterSpacing: 0.5 },
  center: { alignItems: 'center' },
  timeText: {
    fontSize: Platform.OS === 'ios' ? 96 : 88,
    fontWeight: '900',
    color: '#1a1a2e',
    letterSpacing: -4,
    fontVariant: ['tabular-nums'],
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 32,
    paddingBottom: 24,
  },
  btnGroup: { alignItems: 'center', gap: 12 },
  snoozeBtn: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledBtn: { opacity: 0.4 },
  stopBtn: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnLabel: { fontSize: 13, fontWeight: '700', color: '#2d2d4e', letterSpacing: 1, textTransform: 'uppercase' },
  snoozeLeftText: { fontSize: 11, color: '#2d2d4e', opacity: 0.7 },

  // 수학 모달
  mathBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(45,45,78,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  mathCard: {
    width: Math.min(SCREEN_W - 40, 340),
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 28,
    padding: 28,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  mathIconBox: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: 'rgba(209,208,236,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  mathTitle: { fontSize: 20, fontWeight: '800', color: '#1a1a2e', textAlign: 'center' },
  mathDesc: { fontSize: 13, color: 'rgba(45,45,78,0.65)', textAlign: 'center', marginBottom: 4 },
  mathQuestion: { fontSize: 38, fontWeight: '900', color: '#1a1a2e', letterSpacing: 2, marginVertical: 4 },
  mathInputBox: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mathInputError: { borderColor: '#ef4444' },
  mathInputText: { fontSize: 26, fontWeight: '700', color: '#1a1a2e', fontVariant: ['tabular-nums'] },
  numpad: { flexDirection: 'row', flexWrap: 'wrap', width: '100%', gap: 8, marginTop: 4 },
  numKey: {
    width: '30%',
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    // 3열 레이아웃: (100% - 2*gap) / 3
    flexBasis: `${(100 - 2 * 2.5) / 3}%`,
  },
  numKeyConfirm: { backgroundColor: '#1a1a2e' },
  numKeyText: { fontSize: 20, fontWeight: '700', color: '#1a1a2e' },
  mathErrorText: { fontSize: 13, color: '#ef4444', fontWeight: '600' },
  mathSnoozeLink: { marginTop: 4 },
  mathSnoozeLinkText: {
    fontSize: 13,
    color: 'rgba(45,45,78,0.65)',
    textDecorationLine: 'underline',
    fontWeight: '500',
  },
});
