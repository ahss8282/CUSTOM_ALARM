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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAlarmStore } from '@/src/store/alarm-store';
import { scheduleSnoozeNotification } from '@/src/utils/notification';

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

  /* ── 사운드 (createAudioPlayer: 수동 lifecycle 관리, 이중 해제 방지) ── */
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);

  /* ── 현재 시각 ── */
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  /* ── 사운드 재생 시작 ── */
  useEffect(() => {
    let mounted = true;
    const start = async () => {
      try {
        await setAudioModeAsync({ playsInSilentMode: true });
        const p = createAudioPlayer(require('@/assets/sounds/alarm_default.mp3'));
        if (!mounted) { p.remove(); return; }
        p.volume = alarm ? alarm.volume / 100 : 1.0;
        p.loop = true;
        p.play();
        playerRef.current = p;
      } catch {
        // 사운드 파일 없을 경우 무시
      }
    };
    start();
    return () => {
      mounted = false;
      playerRef.current?.remove();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    playerRef.current?.pause();
    if (alarmId) await AsyncStorage.removeItem(snoozeCountKey(alarmId));
    if (router.canGoBack()) { router.back(); } else { router.replace('/(tabs)'); }
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
    if (!alarm || !alarmId) return;
    const key = snoozeCountKey(alarmId);
    const used = parseInt((await AsyncStorage.getItem(key)) ?? '0');
    await AsyncStorage.setItem(key, String(used + 1));
    await scheduleSnoozeNotification(alarm, alarm.snooze.intervalMinutes);
    playerRef.current?.pause();
    if (router.canGoBack()) { router.back(); } else { router.replace('/(tabs)'); }
  }, [alarm, alarmId, router]);

  /* ── 수학 문제 모달 ── */
  const [mathVisible, setMathVisible] = useState(false);
  const [mathProblem, setMathProblem] = useState(generateMath);
  const [mathInput, setMathInput] = useState('');
  const [mathError, setMathError] = useState(false);

  const handleStopPress = useCallback(() => {
    if (alarm?.snooze.enforced) {
      setMathProblem(generateMath());
      setMathInput('');
      setMathError(false);
      setMathVisible(true);
    } else {
      stopAndClose();
    }
  }, [alarm, stopAndClose]);

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
