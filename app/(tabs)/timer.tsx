import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  useColorScheme,
  ScrollView,
  TextInput,
  FlatList,
  Modal,
} from 'react-native';
import { useState, useRef, useEffect } from 'react';
import * as Battery from 'expo-battery';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { Colors } from '@/constants/theme';
import { useSettingsStore } from '@/src/store/settings-store';
import { useTimerStore, TimerSlot } from '@/src/store/timer-store';

type TimerMode = 'normal' | 'workout';
type TimerState = 'idle' | 'running' | 'paused';

/* ─── 배터리 경고 체크 ─── */
/**
 * 배터리 잔량이 5% 미만인 경우 경고 팝업을 띄운다.
 * '유지하고 시작'을 선택하면 onStart() 콜백 실행.
 * '타이머 사용 안 함'을 선택하면 타이머를 시작하지 않는다.
 * 배터리 정보를 얻을 수 없거나(시뮬레이터 등) 5% 이상이면 onStart()를 바로 실행.
 */
async function checkBatteryAndStart(onStart: () => void): Promise<void> {
  try {
    const level = await Battery.getBatteryLevelAsync();
    // level: 0.0~1.0, -1이면 정보 없음(시뮬레이터 등)
    if (level >= 0 && level < 0.05) {
      Alert.alert(
        '배터리 부족',
        `배터리 잔량이 ${Math.round(level * 100)}%입니다.\n화면 켜짐 유지를 사용하면 배터리가 더 빨리 소모됩니다.`,
        [
          { text: '타이머 사용 안 함', style: 'cancel' },
          { text: '유지하고 시작', onPress: onStart },
        ]
      );
      return;
    }
  } catch {
    // expo-battery 미지원 환경(시뮬레이터 등)은 체크 없이 바로 시작
  }
  onStart();
}

/* ─── 드럼롤 피커 (타이머용, 작은 크기) ─── */
const DRUM_HOURS = Array.from({ length: 24 }, (_, i) => i);
const DRUM_MINUTES = Array.from({ length: 60 }, (_, i) => i);
const DRUM_SECONDS = Array.from({ length: 60 }, (_, i) => i);
const DRUM_ITEM_H = 44;

function DrumPicker({
  values,
  selected,
  onSelect,
  colors,
  label,
}: {
  values: number[];
  selected: number;
  onSelect: (v: number) => void;
  colors: typeof Colors.light;
  label: string;
}) {
  const ref = useRef<ScrollView>(null);

  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <View
        style={{
          position: 'absolute',
          top: DRUM_ITEM_H * 2,
          left: 4,
          right: 4,
          height: DRUM_ITEM_H,
          borderTopWidth: 1.5,
          borderBottomWidth: 1.5,
          borderColor: colors.primary,
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={DRUM_ITEM_H}
        decelerationRate="fast"
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.y / DRUM_ITEM_H);
          onSelect(values[Math.max(0, Math.min(values.length - 1, idx))]);
        }}
        onLayout={() => {
          const idx = values.indexOf(selected);
          ref.current?.scrollTo({ y: idx * DRUM_ITEM_H, animated: false });
        }}
        contentContainerStyle={{ paddingVertical: DRUM_ITEM_H * 2 }}
        style={{ height: DRUM_ITEM_H * 5 }}
      >
        {values.map((v) => (
          <View key={v} style={{ height: DRUM_ITEM_H, alignItems: 'center', justifyContent: 'center' }}>
            <Text
              style={{
                fontSize: v === selected ? 28 : 22,
                fontWeight: v === selected ? '700' : '400',
                color: v === selected ? colors.text : colors.subText,
                fontVariant: ['tabular-nums'],
              }}
            >
              {String(v).padStart(2, '0')}
            </Text>
          </View>
        ))}
      </ScrollView>
      <Text style={{ fontSize: 11, color: colors.subText, marginTop: 4 }}>{label}</Text>
    </View>
  );
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/* ─── 타이머 사운드 재생 유틸 ─── */
// soundId: 'none' | 'default' | 'bell' | 'digital' | 'soft'
// durationSec: 이 시간(초) 후 자동으로 재생 중지
const TIMER_SOUND_SOURCES: Record<string, any> = {
  default: require('@/assets/sounds/alarm_default.mp3'),
  bell:    require('@/assets/sounds/alarm_bell.mp3'),
  digital: require('@/assets/sounds/alarm_digital.mp3'),
  soft:    require('@/assets/sounds/alarm_soft.mp3'),
};

async function playTimerSound(soundId: string, durationSec: number): Promise<void> {
  if (soundId === 'none') return;
  const source = TIMER_SOUND_SOURCES[soundId];
  if (!source) return;
  try {
    // expo-audio(신 API) 사용 — alarm-ringing.tsx와 동일한 API로 통일하여 오디오 세션 충돌 방지
    // shouldPlayInBackground: false — 타이머 완료음은 포그라운드 전용
    await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false });
    const player = createAudioPlayer(source);
    player.loop = true;
    player.play();
    setTimeout(() => {
      try { player.pause(); player.remove(); } catch {}
    }, durationSec * 1000);
  } catch {}
}

type TimerSoundId = 'none' | 'default' | 'bell' | 'digital' | 'soft';
const SOUND_OPTIONS: { id: TimerSoundId; labelKo: string; icon: string }[] = [
  { id: 'none',    labelKo: '없음',    icon: 'volume-mute-outline' },
  { id: 'default', labelKo: '기본',    icon: 'musical-notes-outline' },
  { id: 'bell',    labelKo: '벨',      icon: 'notifications-outline' },
  { id: 'digital', labelKo: '디지털', icon: 'pulse-outline' },
  { id: 'soft',    labelKo: '부드러운', icon: 'leaf-outline' },
];

/* ─── Normal Timer ─── */
function NormalTimer({ colors }: { colors: typeof Colors.light }) {
  const { t } = useTranslation();
  const [timerState, setTimerState] = useState<TimerState>('idle');
  const [pickH, setPickH] = useState(0);
  const [pickM, setPickM] = useState(5);
  const [pickS, setPickS] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [timerSound, setTimerSound] = useState<TimerSoundId>('default');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  };

  const PRESETS = [
    { label: t('timer.presets.5min'), h: 0, m: 5, s: 0 },
    { label: t('timer.presets.10min'), h: 0, m: 10, s: 0 },
    { label: t('timer.presets.15min'), h: 0, m: 15, s: 0 },
    { label: t('timer.presets.30min'), h: 0, m: 30, s: 0 },
    { label: t('timer.presets.1hr'), h: 1, m: 0, s: 0 },
  ];

  // 타이머 실행/일시정지 중에는 화면이 꺼지지 않도록 유지
  // idle 상태가 되거나 컴포넌트가 언마운트될 때 해제
  const KEEP_AWAKE_TAG = 'normal-timer';
  useEffect(() => {
    if (timerState === 'running' || timerState === 'paused') {
      activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    } else {
      deactivateKeepAwake(KEEP_AWAKE_TAG);
    }
    return () => { deactivateKeepAwake(KEEP_AWAKE_TAG); };
  }, [timerState]);

  useEffect(() => {
    if (timerState === 'running') {
      intervalRef.current = setInterval(() => {
        setRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            intervalRef.current = null;
            setTimerState('idle');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            playTimerSound(timerSound, 10);
            Notifications.scheduleNotificationAsync({
              content: { title: t('timer.finished'), body: t('timer.finishedMessage'), sound: true },
              trigger: null,
            });
            Alert.alert(t('timer.finished'), t('timer.finishedMessage'), [{ text: t('timer.ok') }]);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerState]);

  const rH = Math.floor(remaining / 3600);
  const rM = Math.floor((remaining % 3600) / 60);
  const rS = remaining % 60;
  const isIdle = timerState === 'idle';
  const isRunning = timerState === 'running';
  const isPaused = timerState === 'paused';
  const totalSet = pickH * 3600 + pickM * 60 + pickS;
  const progress = totalSet > 0 && !isIdle ? (totalSet - remaining) / totalSet : 0;

  return (
    <View style={{ flex: 1, paddingHorizontal: 16 }}>
      {isIdle ? (
        <>
          {/* 드럼롤 피커 */}
          <View style={[ntStyles.pickerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <DrumPicker values={DRUM_HOURS} selected={pickH} onSelect={setPickH} colors={colors} label={t('timer.hours')} />
            <Text style={[ntStyles.sep, { color: colors.subText }]}>:</Text>
            <DrumPicker values={DRUM_MINUTES} selected={pickM} onSelect={setPickM} colors={colors} label={t('timer.minutes')} />
            <Text style={[ntStyles.sep, { color: colors.subText }]}>:</Text>
            <DrumPicker values={DRUM_SECONDS} selected={pickS} onSelect={setPickS} colors={colors} label={t('timer.seconds')} />
          </View>

          {/* 프리셋 - alignSelf로 높이 자동 수축 */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginVertical: 12 }}
            contentContainerStyle={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}
          >
            {PRESETS.map((p) => (
              <TouchableOpacity
                key={p.label}
                style={[ntStyles.preset, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => { setPickH(p.h); setPickM(p.m); setPickS(p.s); }}
              >
                <Text style={[ntStyles.presetText, { color: colors.text }]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* 사운드 선택 */}
          <View style={{ marginBottom: 14 }}>
            <Text style={[ntStyles.soundLabel, { color: colors.subText }]}>완료 사운드</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ flexDirection: 'row', gap: 8 }}
            >
              {SOUND_OPTIONS.map((opt) => {
                const active = timerSound === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[ntStyles.soundChip, {
                      backgroundColor: active ? colors.primary : colors.card,
                      borderColor: active ? colors.primary : colors.border,
                    }]}
                    onPress={() => setTimerSound(opt.id)}
                  >
                    <Ionicons
                      name={opt.icon as any}
                      size={14}
                      color={active ? '#6B6BA8' : colors.subText}
                    />
                    <Text style={[ntStyles.soundChipText, { color: active ? '#6B6BA8' : colors.subText }]}>
                      {opt.labelKo}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <TouchableOpacity
            style={[ntStyles.startBtn, { backgroundColor: totalSet === 0 ? colors.border : colors.primary }]}
            onPress={() => {
              if (totalSet === 0) return;
              checkBatteryAndStart(() => {
                setRemaining(totalSet);
                setTimerState('running');
              });
            }}
            disabled={totalSet === 0}
          >
            <Ionicons name="play" size={24} color="#6B6BA8" />
            <Text style={ntStyles.startBtnText}>{t('timer.start')}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          {/* 카운트다운 */}
          <View style={ntStyles.countdownContainer}>
            <Text style={[ntStyles.countdown, { color: colors.text }]}>
              {pad(rH)}:{pad(rM)}:{pad(rS)}
            </Text>
            {/* 진행 바 */}
            <View style={[ntStyles.progressBg, { backgroundColor: colors.border }]}>
              <View style={[ntStyles.progressFg, { backgroundColor: colors.primary, width: `${progress * 100}%` }]} />
            </View>
          </View>

          {/* 버튼 */}
          <View style={ntStyles.btnRow}>
            <TouchableOpacity
              style={[ntStyles.secondaryBtn, { borderColor: colors.border }]}
              onPress={() => { clearTimer(); setTimerState('idle'); setRemaining(0); }}
            >
              <Text style={[ntStyles.secondaryBtnText, { color: colors.text }]}>{t('timer.cancel')}</Text>
            </TouchableOpacity>
            {isRunning ? (
              <TouchableOpacity
                style={[ntStyles.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={() => { clearTimer(); setTimerState('paused'); }}
              >
                <Text style={ntStyles.primaryBtnText}>{t('timer.pause')}</Text>
              </TouchableOpacity>
            ) : isPaused ? (
              <TouchableOpacity
                style={[ntStyles.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={() => setTimerState('running')}
              >
                <Text style={ntStyles.primaryBtnText}>{t('timer.resume')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </>
      )}
    </View>
  );
}

const ntStyles = StyleSheet.create({
  pickerCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 8 },
  sep: { fontSize: 28, fontWeight: '700', paddingBottom: 16 },
  preset: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1 },
  presetText: { fontSize: 14, fontWeight: '500' },
  soundLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
  soundChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  soundChipText: { fontSize: 13, fontWeight: '600' },
  startBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 18, borderRadius: 16 },
  startBtnText: { fontSize: 18, fontWeight: '700', color: '#6B6BA8' },
  countdownContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 },
  countdown: { fontSize: 68, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: -2 },
  progressBg: { width: '80%', height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFg: { height: '100%', borderRadius: 3 },
  btnRow: { flexDirection: 'row', gap: 12, paddingBottom: 16 },
  primaryBtn: { flex: 1, paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
  primaryBtnText: { fontSize: 17, fontWeight: '700', color: '#6B6BA8' },
  secondaryBtn: { flex: 1, paddingVertical: 18, borderRadius: 16, alignItems: 'center', borderWidth: 1.5 },
  secondaryBtnText: { fontSize: 17, fontWeight: '600' },
});

/* ─── 슬롯 시간 편집 모달 ─── */
function SlotTimeModal({
  visible,
  slot,
  colors,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  slot: TimerSlot | null;
  colors: typeof Colors.light;
  onConfirm: (h: number, m: number, s: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [h, setH] = useState(slot?.hours ?? 0);
  const [m, setM] = useState(slot?.minutes ?? 0);
  const [s, setS] = useState(slot?.seconds ?? 0);

  // slot이 바뀔 때마다 로컬 상태 동기화
  useEffect(() => {
    if (slot) { setH(slot.hours); setM(slot.minutes); setS(slot.seconds); }
  }, [slot?.id]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={smStyles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[smStyles.sheet, { backgroundColor: colors.card }]}>
        {/* 핸들 */}
        <View style={[smStyles.handle, { backgroundColor: colors.border }]} />
        <Text style={[smStyles.title, { color: colors.text }]}>{t('timer.setTime')}</Text>

        {/* 드럼롤 피커 3개 */}
        <View style={[smStyles.pickerRow, { borderColor: colors.border }]}>
          <DrumPicker values={DRUM_HOURS} selected={h} onSelect={setH} colors={colors} label={t('timer.hours')} />
          <Text style={[smStyles.sep, { color: colors.subText }]}>:</Text>
          <DrumPicker values={DRUM_MINUTES} selected={m} onSelect={setM} colors={colors} label={t('timer.minutes')} />
          <Text style={[smStyles.sep, { color: colors.subText }]}>:</Text>
          <DrumPicker values={DRUM_SECONDS} selected={s} onSelect={setS} colors={colors} label={t('timer.seconds')} />
        </View>

        {/* 확인 버튼 */}
        <TouchableOpacity
          style={[smStyles.confirmBtn, { backgroundColor: colors.primary }]}
          onPress={() => { onConfirm(h, m, s); onClose(); }}
        >
          <Text style={smStyles.confirmText}>{t('timer.confirm')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const smStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 16 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  pickerRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 4 },
  sep: { fontSize: 26, fontWeight: '700', paddingBottom: 16 },
  confirmBtn: { paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  confirmText: { fontSize: 17, fontWeight: '700', color: '#6B6BA8' },
});

/* ─── Workout Timer ─── */
function WorkoutTimer({ colors }: { colors: typeof Colors.light }) {
  const { t } = useTranslation();
  const { slots, addSlot, updateSlot, deleteSlot } = useTimerStore();

  const [timerState, setTimerState] = useState<TimerState>('idle');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [editingSlot, setEditingSlot] = useState<TimerSlot | null>(null);

  // ─ 인터벌 내부에서 사용하는 값은 모두 ref로 관리 (stale closure 방지)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const remainingRef = useRef(0);
  const currentIdxRef = useRef(0);
  const slotsRef = useRef(slots);

  // slots 최신 참조 유지
  useEffect(() => { slotsRef.current = slots; }, [slots]);

  // 언마운트 시 인터벌 정리
  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  // 타이머 실행/일시정지 중에는 화면이 꺼지지 않도록 유지
  // idle 상태가 되거나 컴포넌트가 언마운트될 때 해제
  const KEEP_AWAKE_TAG_WT = 'workout-timer';
  useEffect(() => {
    if (timerState === 'running' || timerState === 'paused') {
      activateKeepAwakeAsync(KEEP_AWAKE_TAG_WT);
    } else {
      deactivateKeepAwake(KEEP_AWAKE_TAG_WT);
    }
    return () => { deactivateKeepAwake(KEEP_AWAKE_TAG_WT); };
  }, [timerState]);

  const slotToSeconds = (s: TimerSlot) => s.hours * 3600 + s.minutes * 60 + s.seconds;

  const stopInterval = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  };

  /**
   * 인터벌을 시작합니다. remainingRef.current 값부터 카운트다운합니다.
   * 슬롯 완료 시 다음 슬롯을 직접 시작(재귀 호출)하므로
   * timerState 변경에 의존하지 않습니다.
   */
  const launchInterval = () => {
    stopInterval();
    intervalRef.current = setInterval(() => {
      remainingRef.current -= 1;
      setRemaining(remainingRef.current);

      if (remainingRef.current <= 0) {
        stopInterval();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        // 완료된 구간의 사운드 설정 확인 후 재생 (3초)
        const completedSlot = slotsRef.current[currentIdxRef.current];
        if (completedSlot?.soundOnComplete) {
          playTimerSound('default', 3);
        }

        const next = currentIdxRef.current + 1;
        if (next >= slotsRef.current.length) {
          // 모든 구간 완료
          setTimerState('idle');
          setCurrentIdx(0);
          currentIdxRef.current = 0;
          remainingRef.current = 0;
          setRemaining(0);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Notifications.scheduleNotificationAsync({
            content: { title: t('timer.workoutFinished'), body: t('timer.workoutFinishedMessage'), sound: true },
            trigger: null,
          });
          Alert.alert(t('timer.workoutFinished'), t('timer.workoutFinishedMessage'), [{ text: t('timer.ok') }]);
        } else {
          // 다음 슬롯 시작
          currentIdxRef.current = next;
          setCurrentIdx(next);
          remainingRef.current = slotToSeconds(slotsRef.current[next]);
          setRemaining(remainingRef.current);
          launchInterval();
        }
      }
    }, 1000);
  };

  const isIdle = timerState === 'idle';
  const isRunning = timerState === 'running';

  const rH = Math.floor(remaining / 3600);
  const rM = Math.floor((remaining % 3600) / 60);
  const rS = remaining % 60;

  return (
    <View style={{ flex: 1 }}>
      {/* 진행 상황 (실행 중) */}
      {!isIdle && (
        <View style={[wtStyles.progressCard, { backgroundColor: colors.card, borderColor: colors.border, marginHorizontal: 16 }]}>
          <View style={wtStyles.progressHeader}>
            <Text style={[wtStyles.progressLabel, { color: colors.subText }]}>{t('timer.progress')}</Text>
            <Text style={[wtStyles.progressStep, { color: colors.text }]}>
              {t('timer.step')} {Math.min(currentIdx + 1, slots.length)} {t('timer.of')} {slots.length}
            </Text>
          </View>
          <View style={[wtStyles.progressBg, { backgroundColor: colors.border }]}>
            <View
              style={[
                wtStyles.progressFg,
                { backgroundColor: colors.primary, width: `${(currentIdx / slots.length) * 100}%` },
              ]}
            />
          </View>
          {/* 남은 시간 */}
          <Text style={[wtStyles.countdown, { color: colors.text }]}>
            {pad(rH)}:{pad(rM)}:{pad(rS)}
          </Text>
        </View>
      )}

      {/* 슬롯 목록 */}
      <FlatList
        data={slots}
        keyExtractor={(item) => item.id}
        contentContainerStyle={wtStyles.listContent}
        renderItem={({ item, index }) => {
          const isActive = !isIdle && index === currentIdx;
          const isDone = !isIdle && index < currentIdx;
          return (
            <View
              style={[
                wtStyles.slotCard,
                {
                  backgroundColor: colors.card,
                  borderColor: isActive ? colors.primary : colors.border,
                  borderWidth: isActive ? 2 : 1,
                  opacity: isDone ? 0.45 : 1,
                },
              ]}
            >
              {/* 좌측 강조 바 (활성 구간) */}
              {isActive && (
                <View style={[wtStyles.activeBar, { backgroundColor: colors.primary }]} />
              )}
              <View style={{ flex: 1 }}>
                <TextInput
                  style={[wtStyles.slotLabel, { color: colors.text }]}
                  placeholder={t('timer.labelPlaceholder')}
                  placeholderTextColor={colors.subText}
                  value={item.label}
                  onChangeText={(v) => updateSlot(item.id, { label: v })}
                  editable={isIdle}
                />
                {isIdle ? (
                  <TouchableOpacity
                    onPress={() => setEditingSlot(item)}
                    style={[wtStyles.timeBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                  >
                    <Ionicons name="time-outline" size={14} color={colors.subText} />
                    <Text style={[wtStyles.slotTimeText, { color: colors.text }]}>
                      {pad(item.hours)}:{pad(item.minutes)}:{pad(item.seconds)}
                    </Text>
                    <Ionicons name="chevron-down" size={14} color={colors.subText} />
                  </TouchableOpacity>
                ) : (
                  <Text style={[wtStyles.slotTimeText, { color: isActive ? colors.text : colors.subText }]}>
                    {pad(item.hours)}:{pad(item.minutes)}:{pad(item.seconds)}
                    {isActive && <Text style={{ color: colors.subText }}> 남음</Text>}
                  </Text>
                )}
              </View>
              {/* 구간 완료 사운드 토글 */}
              <TouchableOpacity
                onPress={() => updateSlot(item.id, { soundOnComplete: !item.soundOnComplete })}
                style={{ padding: 6 }}
                hitSlop={8}
                disabled={!isIdle}
              >
                <Ionicons
                  name={item.soundOnComplete ? 'notifications-outline' : 'notifications-off-outline'}
                  size={18}
                  color={item.soundOnComplete ? colors.primary : colors.border}
                />
              </TouchableOpacity>
              {isIdle && (
                <TouchableOpacity
                  onPress={() => deleteSlot(item.id)}
                  style={{ padding: 6 }}
                  hitSlop={8}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </TouchableOpacity>
              )}
            </View>
          );
        }}
        ListFooterComponent={
          isIdle ? (
            <View style={{ gap: 8 }}>
              {slots.length < 10 ? (
                <TouchableOpacity
                  style={[wtStyles.addBtn, { borderColor: colors.primary }]}
                  onPress={addSlot}
                >
                  <Text style={[wtStyles.addBtnText, { color: colors.primary }]}>{t('timer.addInterval')}</Text>
                </TouchableOpacity>
              ) : (
                <Text style={[{ textAlign: 'center', color: colors.subText, fontSize: 13 }]}>
                  {t('timer.maxIntervals')}
                </Text>
              )}
            </View>
          ) : null
        }
      />

      {/* 슬롯 시간 편집 모달 */}
      <SlotTimeModal
        visible={editingSlot !== null}
        slot={editingSlot}
        colors={colors}
        onConfirm={(h, m, s) => {
          if (editingSlot) updateSlot(editingSlot.id, { hours: h, minutes: m, seconds: s });
        }}
        onClose={() => setEditingSlot(null)}
      />

      {/* 하단 버튼 */}
      <View style={[wtStyles.footer, { paddingHorizontal: 16, paddingBottom: 16 }]}>
        {isIdle ? (
          <TouchableOpacity
            style={[wtStyles.startBtn, { backgroundColor: slots.length === 0 ? colors.border : colors.primary }]}
            onPress={() => {
              if (slots.length === 0) return;
              checkBatteryAndStart(() => {
                // 첫 번째 슬롯 시작
                currentIdxRef.current = 0;
                setCurrentIdx(0);
                remainingRef.current = slotToSeconds(slots[0]);
                setRemaining(remainingRef.current);
                setTimerState('running');
                launchInterval();
              });
            }}
            disabled={slots.length === 0}
          >
            <Ionicons name="play" size={22} color="#6B6BA8" />
            <Text style={wtStyles.startBtnText}>{t('timer.start')}</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
              style={[wtStyles.secondaryBtn, { borderColor: colors.border }]}
              onPress={() => {
                stopInterval();
                setTimerState('idle');
                setCurrentIdx(0);
                currentIdxRef.current = 0;
                remainingRef.current = 0;
                setRemaining(0);
              }}
            >
              <Text style={[{ fontSize: 16, fontWeight: '600', color: colors.text }]}>{t('timer.cancel')}</Text>
            </TouchableOpacity>
            {isRunning ? (
              <TouchableOpacity
                style={[wtStyles.startBtn, { backgroundColor: colors.primary, flex: 1 }]}
                onPress={() => {
                  stopInterval(); // 인터벌 중지, remainingRef는 현재 값 유지
                  setTimerState('paused');
                }}
              >
                <Text style={wtStyles.startBtnText}>{t('timer.pause')}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[wtStyles.startBtn, { backgroundColor: colors.primary, flex: 1 }]}
                onPress={() => {
                  setTimerState('running');
                  launchInterval(); // remainingRef.current에서 이어서 재개
                }}
              >
                <Text style={wtStyles.startBtnText}>{t('timer.resume')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const wtStyles = StyleSheet.create({
  progressCard: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 12, gap: 8 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  progressStep: { fontSize: 13, fontWeight: '600' },
  progressBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFg: { height: '100%', borderRadius: 3 },
  countdown: { fontSize: 42, fontWeight: '700', textAlign: 'center', fontVariant: ['tabular-nums'] },
  listContent: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  slotCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 12, gap: 10, overflow: 'hidden' },
  activeBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  slotLabel: { fontSize: 14, fontWeight: '500', marginBottom: 6 },
  slotTimeText: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  timeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1 },
  addBtn: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  addBtnText: { fontSize: 15, fontWeight: '600' },
  footer: { gap: 0 },
  startBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 16 },
  startBtnText: { fontSize: 17, fontWeight: '700', color: '#6B6BA8' },
  secondaryBtn: { flex: 1, paddingVertical: 16, borderRadius: 16, alignItems: 'center', borderWidth: 1.5 },
});

/* ─── 메인 화면 ─── */
export default function TimerScreen() {
  const { t } = useTranslation();
  const systemScheme = useColorScheme();
  const { theme } = useSettingsStore();
  const resolvedScheme = theme === 'system' ? (systemScheme ?? 'light') : theme;
  const colors = Colors[resolvedScheme];

  const [mode, setMode] = useState<TimerMode>('normal');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('timer.title')}</Text>
      </View>

      {/* 세그먼트 컨트롤 */}
      <View style={[styles.segment, { backgroundColor: colors.card, borderColor: colors.border, marginHorizontal: 16, marginBottom: 16 }]}>
        {(['normal', 'workout'] as TimerMode[]).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.segBtn, mode === m && { backgroundColor: colors.primary }]}
            onPress={() => setMode(m)}
          >
            <Text style={[styles.segText, { color: mode === m ? '#6B6BA8' : colors.subText }]}>
              {t(`timer.${m}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {mode === 'normal' ? (
        <NormalTimer colors={colors} />
      ) : (
        <WorkoutTimer colors={colors} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  headerTitle: { fontSize: 28, fontWeight: '700' },
  segment: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 4, gap: 4 },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  segText: { fontSize: 15, fontWeight: '600' },
});
