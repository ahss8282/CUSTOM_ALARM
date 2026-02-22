import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  useColorScheme,
  ScrollView,
  Switch,
  PanResponder,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useRef, useCallback, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer } from 'expo-audio';

import { Colors } from '@/constants/theme';
import { useAlarmStore } from '@/src/store/alarm-store';
import { useSettingsStore } from '@/src/store/settings-store';
import { DEFAULT_ALARM, DEFAULT_SNOOZE } from '@/src/types/alarm';
import { getHolidays } from '@/src/utils/holiday';

/* ─── 상수 ─── */
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const ITEM_HEIGHT = 52;
const SOUND_OPTIONS = ['default', 'bell', 'digital', 'gentle'] as const;
const SNOOZE_INTERVALS = [1, 3, 5, 10, 15, 30];
const REPEAT_OPTIONS = [
  { value: 0, unit: null },
  { value: 1, unit: 'week' as const },
  { value: 2, unit: 'week' as const },
  { value: 1, unit: 'month' as const },
  { value: 2, unit: 'month' as const },
];

/* ─── 볼륨 슬라이더 (PanResponder 커스텀 구현) ─── */
function VolumeSlider({
  value,
  onChange,
  colors,
}: {
  value: number;
  onChange: (v: number) => void;
  colors: typeof Colors.light;
}) {
  const viewRef = useRef<View>(null);
  const trackInfo = useRef({ x: 0, width: 0 });

  const updateFromPageX = (pageX: number) => {
    const { x, width } = trackInfo.current;
    if (width === 0) return;
    const pct = Math.max(0, Math.min(1, (pageX - x) / width));
    onChange(Math.round(pct * 100));
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => updateFromPageX(e.nativeEvent.pageX),
      onPanResponderMove: (e) => updateFromPageX(e.nativeEvent.pageX),
    })
  ).current;

  const thumbPercent = Math.max(1, Math.min(99, value));

  return (
    <View
      ref={viewRef}
      style={{ height: 40, justifyContent: 'center', paddingHorizontal: 10 }}
      onLayout={() => {
        viewRef.current?.measure((_x, _y, width, _h, pageX) => {
          trackInfo.current = { x: pageX + 10, width: width - 20 };
        });
      }}
      {...panResponder.panHandlers}
    >
      <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.border }}>
        <View style={{ width: '' + value + '%', height: '100%', backgroundColor: colors.primary, borderRadius: 2 }} />
      </View>
      <View
        style={{
          position: 'absolute',
          left: (thumbPercent + '%') as any,
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: colors.primary,
          marginLeft: -11,
          elevation: 3,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.2,
          shadowRadius: 2,
        }}
      />
    </View>
  );
}


/* ─── 드럼롤 피커 ─── */
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
  const scrollRef = useRef<ScrollView>(null);
  const isScrolling = useRef(false);

  const snapToValue = (val: number) => {
    const idx = values.indexOf(val);
    scrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: true });
  };

  return (
    <View style={pickerStyles.container}>
      <View style={[pickerStyles.highlight, { borderColor: colors.primary }]} pointerEvents="none" />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        nestedScrollEnabled
        scrollEventThrottle={16}
        onScrollBeginDrag={() => { isScrolling.current = true; }}
        onMomentumScrollEnd={(e) => {
          isScrolling.current = false;
          const index = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
          const clamped = Math.max(0, Math.min(values.length - 1, index));
          onSelect(values[clamped]);
        }}
        onLayout={() => {
          const idx = values.indexOf(selected);
          scrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: false });
        }}
        contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * 2 }}
        style={{ height: ITEM_HEIGHT * 5 }}
      >
        {values.map((val) => (
          <TouchableOpacity
            key={val}
            style={[pickerStyles.item, { height: ITEM_HEIGHT }]}
            onPress={() => { onSelect(val); snapToValue(val); }}
            activeOpacity={0.6}
          >
            <Text
              style={[
                pickerStyles.text,
                { color: val === selected ? colors.text : colors.subText },
                val === selected && pickerStyles.selectedText,
              ]}
            >
              {String(val).padStart(2, '0')}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <Text style={[pickerStyles.label, { color: colors.subText }]}>{label}</Text>
    </View>
  );
}
const pickerStyles = StyleSheet.create({
  container: { alignItems: 'center', width: 80 },
  highlight: {
    position: 'absolute',
    top: ITEM_HEIGHT * 2,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
    zIndex: 1,
    pointerEvents: 'none',
  },
  item: { alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 28, fontVariant: ['tabular-nums'] },
  selectedText: { fontWeight: '700', fontSize: 32 },
  label: { fontSize: 12, marginTop: 4 },
});

/* ─── 미니 캘린더 ─── */
function MiniCalendar({
  selectedDates,
  onToggleDate,
  colors,
  holidayCountry,
}: {
  selectedDates: string[];
  onToggleDate: (dateStr: string) => void;
  colors: typeof Colors.light;
  holidayCountry: string;
}) {
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [holidays, setHolidays] = useState<Set<string>>(new Set());

  useEffect(() => {
    getHolidays(holidayCountry, viewDate.year).then(setHolidays);
  }, [holidayCountry, viewDate.year]);

  const firstDay = new Date(viewDate.year, viewDate.month, 1).getDay();
  const daysInMonth = new Date(viewDate.year, viewDate.month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = new Date(viewDate.year, viewDate.month, 1).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long',
  });

  const toIso = (day: number) =>
    viewDate.year + '-' + String(viewDate.month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');

  const prevMonth = () => setViewDate((v) => {
    const d = new Date(v.year, v.month - 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const nextMonth = () => setViewDate((v) => {
    const d = new Date(v.year, v.month + 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  return (
    <View style={calStyles.wrapper}>
      <View style={calStyles.header}>
        <TouchableOpacity onPress={prevMonth} hitSlop={12}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[calStyles.monthLabel, { color: colors.text }]}>{monthLabel}</Text>
        <TouchableOpacity onPress={nextMonth} hitSlop={12}>
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>
      <View style={calStyles.weekRow}>
        {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
          <Text key={d} style={[calStyles.weekDay, { color: colors.subText }]}>{d}</Text>
        ))}
      </View>
      <View style={calStyles.grid}>
        {cells.map((day, idx) => {
          if (!day) return <View key={'e' + idx} style={calStyles.cell} />;
          const isoStr = toIso(day);
          const selected = selectedDates.includes(isoStr);
          const isHoliday = holidays.has(isoStr);
          const isToday = new Date().toDateString() === new Date(viewDate.year, viewDate.month, day).toDateString();
          return (
            <TouchableOpacity key={isoStr} style={calStyles.cell} onPress={() => onToggleDate(isoStr)}>
              <View style={[
                calStyles.dayCircle,
                selected && { backgroundColor: colors.accent },
                isToday && !selected && { borderWidth: 1.5, borderColor: colors.primary },
              ]}>
                <Text style={[
                  calStyles.dayText,
                  { color: selected ? '#7A4A55' : isHoliday ? '#EF4444' : colors.text },
                  selected && { fontWeight: '700' },
                ]}>
                  {day}
                </Text>
              </View>
              {/* 공휴일 점 표시 */}
              {isHoliday && !selected && (
                <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#EF4444', marginTop: 1 }} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      {/* 범례 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' }} />
        <Text style={{ fontSize: 11, color: colors.subText }}>공휴일</Text>
      </View>
    </View>
  );
}
const calStyles = StyleSheet.create({
  wrapper: { gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthLabel: { fontSize: 15, fontWeight: '600' },
  weekRow: { flexDirection: 'row' },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '500' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 },
  dayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 13 },
});

/* ─── 메인 화면 ─── */
export default function AlarmEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const { t } = useTranslation();
  const systemScheme = useColorScheme();
  const { theme, holidayCountry } = useSettingsStore();
  const resolvedScheme = theme === 'system' ? (systemScheme ?? 'light') : theme;
  const colors = Colors[resolvedScheme];

  const { alarms, addAlarm, updateAlarm, deleteAlarm } = useAlarmStore();
  const existing = isNew ? null : (alarms.find((a) => a.id === id) ?? null);

  const base = existing ?? DEFAULT_ALARM;

  // 상태
  const [hour, setHour] = useState(base.hour);
  const [minute, setMinute] = useState(base.minute);
  const [name, setName] = useState(base.name);
  const [scheduleType, setScheduleType] = useState<'weekly' | 'calendar'>(base.scheduleType);
  const [weekdays, setWeekdays] = useState<number[]>(base.weekdays);
  const [calendarDates, setCalendarDates] = useState<string[]>(base.calendarDates);
  const [repeatEvery, setRepeatEvery] = useState(base.repeatEvery ?? null);
  const [excludeHolidays, setExcludeHolidays] = useState(base.excludeHolidays);
  const [soundId, setSoundId] = useState(base.soundId);
  const [volume, setVolume] = useState(base.volume);
  const [vibration, setVibration] = useState(base.vibration);
  const [snooze, setSnooze] = useState(base.snooze ?? DEFAULT_SNOOZE);
  const [background, setBackground] = useState(base.background ?? { type: 'color' as const, value: '#d1d0ec' });

  const previewPlayer = useAudioPlayer(require('@/assets/sounds/alarm_default.mp3'));

  const toggleWeekday = (day: number) =>
    setWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );

  const toggleCalendarDate = (dateStr: string) =>
    setCalendarDates((prev) =>
      prev.includes(dateStr) ? prev.filter((d) => d !== dateStr) : [...prev, dateStr].sort()
    );

  const playPreview = useCallback(async (_id: string) => {
    try {
      previewPlayer.volume = volume / 100;
      previewPlayer.seekTo(0);
      previewPlayer.play();
      setTimeout(() => previewPlayer.pause(), 3000);
    } catch {
      // 오디오 로드 실패 시 무시
    }
  }, [previewPlayer, volume]);

  const handleSave = async () => {
    const data = {
      name,
      hour,
      minute,
      isEnabled: true,
      scheduleType,
      weekdays,
      calendarDates,
      repeatEvery: repeatEvery ?? undefined,
      excludeHolidays,
      soundId,
      volume,
      vibration,
      snooze,
      background,
    };

    if (isNew) {
      await addAlarm(data);
    } else if (existing) {
      await updateAlarm(existing.id, data);
    }
    router.back();
  };

  const handleDelete = () => {
    Alert.alert(t('alarmEdit.deleteConfirm'), '', [
      { text: t('alarmEdit.cancel'), style: 'cancel' },
      {
        text: t('alarmEdit.confirm'),
        style: 'destructive',
        onPress: async () => {
          if (existing) await deleteAlarm(existing.id);
          router.back();
        },
      },
    ]);
  };

  const BG_COLORS = ['#d1d0ec','#EDC7CF','#C7E0CF','#C7D8ED','#EDE8C7','#E8C7ED','#C7EDED','#f6f6f7'];

  const pickImage = async () => {
    try {
      const ImagePicker = await import('expo-image-picker');
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [9, 16],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setBackground({ type: 'image', value: result.assets[0].uri });
      }
    } catch {
      // 네이티브 모듈 미설치 시 무시
    }
  };

  const repeatLabel = (opt: typeof REPEAT_OPTIONS[number]) => {
    if (!opt.unit) return t('alarmEdit.repeatNone');
    const suffix = opt.unit === 'week' ? t('alarmEdit.repeatWeeks') : t('alarmEdit.repeatMonths');
    return `${opt.value} ${suffix}`;
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 네비게이션 바 */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={[styles.navAction, { color: colors.subText }]}>{t('alarmEdit.cancel')}</Text>
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.text }]}>
          {isNew ? t('alarmEdit.addTitle') : t('alarmEdit.editTitle')}
        </Text>
        <TouchableOpacity onPress={handleSave} hitSlop={12}>
          <Text style={[styles.navAction, { color: colors.tint, fontWeight: '700' }]}>
            {t('alarmEdit.save')}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* 시간 피커 */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.pickerRow}>
            <DrumPicker values={HOURS} selected={hour} onSelect={setHour} colors={colors} label={t('timer.hours')} />
            <Text style={[styles.colon, { color: colors.text }]}>:</Text>
            <DrumPicker values={MINUTES} selected={minute} onSelect={setMinute} colors={colors} label={t('timer.minutes')} />
          </View>
        </View>

        {/* 알람 이름 */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TextInput
            style={[styles.nameInput, { color: colors.text }]}
            placeholder={t('alarmEdit.namePlaceholder')}
            placeholderTextColor={colors.subText}
            value={name}
            onChangeText={setName}
            maxLength={20}
          />
        </View>

        {/* 일정 모드 탭 */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.subText }]}>{t('alarmEdit.schedule')}</Text>
          <View style={[styles.segRow, { backgroundColor: colors.border }]}>
            {(['weekly', 'calendar'] as const).map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.segBtn, scheduleType === m && { backgroundColor: colors.primary }]}
                onPress={() => setScheduleType(m)}
              >
                <Text style={[styles.segText, { color: scheduleType === m ? '#6B6BA8' : colors.subText }]}>
                  {t(`alarmEdit.${m}`)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Weekly: 요일 선택 */}
          {scheduleType === 'weekly' && (
            <View style={styles.weekdayRow}>
              {DAY_KEYS.map((key, idx) => {
                const active = weekdays.includes(idx);
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.weekdayChip, { backgroundColor: active ? colors.primary : colors.border }]}
                    onPress={() => toggleWeekday(idx)}
                  >
                    <Text style={[styles.weekdayText, { color: active ? '#6B6BA8' : colors.subText }]}>
                      {t(`alarm.days.${key}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Calendar: 날짜 선택 */}
          {scheduleType === 'calendar' && (
            <View style={{ gap: 12 }}>
              <MiniCalendar
                selectedDates={calendarDates}
                onToggleDate={toggleCalendarDate}
                colors={colors}
                holidayCountry={holidayCountry}
              />
              {/* 반복 주기 선택 */}
              <View>
                <Text style={[styles.cardLabel, { color: colors.subText }]}>{t('alarmEdit.repeatEvery')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {REPEAT_OPTIONS.map((opt, i) => {
                      const isSelected =
                        opt.unit === null
                          ? repeatEvery === null
                          : repeatEvery?.value === opt.value && repeatEvery?.unit === opt.unit;
                      return (
                        <TouchableOpacity
                          key={i}
                          style={[
                            styles.chip,
                            {
                              backgroundColor: isSelected ? colors.primary : colors.border,
                              borderColor: colors.border,
                            },
                          ]}
                          onPress={() =>
                            setRepeatEvery(opt.unit ? { value: opt.value, unit: opt.unit } : null)
                          }
                        >
                          <Text style={[styles.chipText, { color: isSelected ? '#6B6BA8' : colors.subText }]}>
                            {repeatLabel(opt)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            </View>
          )}
        </View>

        {/* 공휴일 제외 */}
        <View style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>{t('alarmEdit.excludeHolidays')}</Text>
            <Text style={[styles.rowDesc, { color: colors.subText }]}>{t('alarmEdit.excludeHolidaysDesc')}</Text>
          </View>
          <Switch
            value={excludeHolidays}
            onValueChange={setExcludeHolidays}
            trackColor={{ false: colors.border, true: colors.switchTrackOn }}
            thumbColor={colors.switchThumb}
          />
        </View>

        {/* 알람음 선택 */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.subText }]}>{t('alarmEdit.sound')}</Text>
          <View style={{ gap: 6 }}>
            {SOUND_OPTIONS.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.soundRow, { borderColor: colors.border }]}
                onPress={() => {
                  setSoundId(s);
                  playPreview(s);
                }}
              >
                <View style={[styles.radioOuter, { borderColor: colors.primary }]}>
                  {soundId === s && <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />}
                </View>
                <Text style={[styles.soundName, { color: colors.text }]}>
                  {t(`alarmEdit.soundNames.${s}`)}
                </Text>
                <Ionicons name="play-circle-outline" size={20} color={colors.subText} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 볼륨 슬라이더 */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.rowBetween}>
            <Text style={[styles.cardLabel, { color: colors.subText }]}>{t('alarmEdit.volume')}</Text>
            <Text style={[styles.cardLabel, { color: colors.text }]}>{volume}%</Text>
          </View>
          <VolumeSlider value={volume} onChange={setVolume} colors={colors} />
        </View>

        {/* 진동 */}
        <View style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>{t('alarmEdit.vibration')}</Text>
          <Switch
            value={vibration}
            onValueChange={(v) => {
              setVibration(v);
              if (v) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }}
            trackColor={{ false: colors.border, true: colors.switchTrackOn }}
            thumbColor={colors.switchThumb}
          />
        </View>

        {/* 스누즈 설정 */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.rowBetween, { marginBottom: 12 }]}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>{t('alarmEdit.snooze')}</Text>
            <Switch
              value={snooze.enabled}
              onValueChange={(v) => setSnooze((s) => ({ ...s, enabled: v }))}
              trackColor={{ false: colors.border, true: colors.switchTrackOn }}
              thumbColor={colors.switchThumb}
            />
          </View>

          {snooze.enabled && (
            <View style={{ gap: 12 }}>
              {/* 간격 */}
              <View>
                <Text style={[styles.cardLabel, { color: colors.subText }]}>{t('alarmEdit.snoozeInterval')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {SNOOZE_INTERVALS.map((min) => (
                      <TouchableOpacity
                        key={min}
                        style={[
                          styles.chip,
                          { backgroundColor: snooze.intervalMinutes === min ? colors.primary : colors.border },
                        ]}
                        onPress={() => setSnooze((s) => ({ ...s, intervalMinutes: min }))}
                      >
                        <Text style={[styles.chipText, { color: snooze.intervalMinutes === min ? '#6B6BA8' : colors.subText }]}>
                          {min}분
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>

              {/* 최대 횟수 */}
              <View>
                <Text style={[styles.cardLabel, { color: colors.subText }]}>{t('alarmEdit.snoozeMaxCount')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {[-1, 1, 2, 3, 5, 10].map((cnt) => (
                      <TouchableOpacity
                        key={cnt}
                        style={[
                          styles.chip,
                          { backgroundColor: snooze.maxCount === cnt ? colors.primary : colors.border },
                        ]}
                        onPress={() => setSnooze((s) => ({ ...s, maxCount: cnt }))}
                      >
                        <Text style={[styles.chipText, { color: snooze.maxCount === cnt ? '#6B6BA8' : colors.subText }]}>
                          {cnt === -1 ? t('alarmEdit.snoozeUnlimited') : `${cnt}회`}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>

              {/* 강화 모드 */}
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>{t('alarmEdit.snoozeEnforced')}</Text>
                </View>
                <Switch
                  value={snooze.enforced}
                  onValueChange={(v) => setSnooze((s) => ({ ...s, enforced: v }))}
                  trackColor={{ false: colors.border, true: colors.switchTrackOn }}
                  thumbColor={colors.switchThumb}
                />
              </View>
            </View>
          )}
        </View>

        {/* 알람 배경 */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.subText }]}>{t('alarmEdit.background')}</Text>

          {/* 색상 팔레트 */}
          <Text style={[styles.rowTitle, { color: colors.text, fontSize: 14 }]}>{t('alarmEdit.bgColor')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {BG_COLORS.map((c) => {
                const selected = background.type === 'color' && background.value === c;
                return (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setBackground({ type: 'color', value: c })}
                    style={[
                      { width: 40, height: 40, borderRadius: 20, backgroundColor: c },
                      selected && { borderWidth: 3, borderColor: colors.text },
                    ]}
                  />
                );
              })}
            </View>
          </ScrollView>

          {/* 갤러리 선택 */}
          <TouchableOpacity
            onPress={pickImage}
            style={[styles.chip, { backgroundColor: background.type === 'image' ? colors.primary : colors.border, alignSelf: 'flex-start' }]}
          >
            <Ionicons name="image-outline" size={14} color={background.type === 'image' ? '#6B6BA8' : colors.subText} />
            <Text style={[styles.chipText, { color: background.type === 'image' ? '#6B6BA8' : colors.subText, marginLeft: 4 }]}>
              {background.type === 'image' ? t('alarmEdit.bgImageSelected') : t('alarmEdit.bgImage')}
            </Text>
          </TouchableOpacity>

          {/* 현재 배경 미리보기 */}
          <View
            style={{
              height: 32,
              borderRadius: 10,
              backgroundColor: background.type === 'color' ? background.value : colors.border,
              overflow: 'hidden',
            }}
          />
        </View>

        {/* 삭제 버튼 (수정 모드) */}
        {!isNew && (
          <TouchableOpacity
            style={[styles.deleteBtn, { borderColor: colors.danger }]}
            onPress={handleDelete}
          >
            <Text style={[styles.deleteBtnText, { color: colors.danger }]}>
              {t('alarmEdit.delete')}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  navTitle: { fontSize: 17, fontWeight: '600' },
  navAction: { fontSize: 16 },
  content: { padding: 14, gap: 12, paddingBottom: 48 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  colon: { fontSize: 36, fontWeight: '700', marginBottom: 16 },
  nameInput: { fontSize: 17, paddingVertical: 4 },
  cardLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  rowTitle: { fontSize: 16 },
  rowDesc: { fontSize: 12, marginTop: 2 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  segRow: { flexDirection: 'row', borderRadius: 10, padding: 3, gap: 3 },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  segText: { fontSize: 14, fontWeight: '600' },
  weekdayRow: { flexDirection: 'row', justifyContent: 'space-between' },
  weekdayChip: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  weekdayText: { fontSize: 13, fontWeight: '600' },
  soundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  soundName: { flex: 1, fontSize: 15 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  deleteBtn: { marginTop: 4, borderWidth: 1.5, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  deleteBtnText: { fontSize: 16, fontWeight: '600' },
});
