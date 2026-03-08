import {
  View,
  Text,
  FlatList,
  Switch,
  TouchableOpacity,
  StyleSheet,
  Alert,
  useColorScheme,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useMemo, useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useAlarmStore } from '@/src/store/alarm-store';
import { useSettingsStore } from '@/src/store/settings-store';
import { toLocalDateString, parseLocalDate } from '@/src/utils/date-utils';
import { Alarm } from '@/src/types/alarm';
import { getHolidays } from '@/src/utils/holiday';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

async function computeNextAlarmText(
  alarms: Alarm[],
  t: (key: string) => string,
  holidayCountry: string,
): Promise<string> {
  const enabled = alarms.filter((a) => a.isEnabled);
  if (enabled.length === 0) return t('alarm.noNextAlarm');

  const now = new Date();

  // 공휴일/주말 제외 설정을 쓰는 알람이 하나라도 있으면 공휴일 목록을 가져옴
  const needsHolidays = enabled.some((a) => a.excludeHolidays);
  let holidaySet = new Set<string>();
  if (needsHolidays) {
    try {
      const year = now.getFullYear();
      holidaySet = await getHolidays(holidayCountry, year);
      // 12월에는 다음 해 공휴일도 미리 확인
      if (now.getMonth() === 11) {
        const next = await getHolidays(holidayCountry, year + 1);
        next.forEach((d) => holidaySet.add(d));
      }
    } catch {
      // 공휴일 로드 실패 시 빈 Set 유지 (알람 자체는 동작)
    }
  }

  let minMs = Infinity;

  for (const alarm of enabled) {
    if (alarm.scheduleType === 'calendar') {
      const hh = String(alarm.hour).padStart(2, '0');
      const mm = String(alarm.minute).padStart(2, '0');

      if (alarm.repeatEvery && alarm.excludeRepeatDates) {
        // 반복 일자 제외 모드: 반복 날짜 집합에서 제외한 날 중 가장 가까운 날 탐색
        const allRepeatDates = new Set<string>();
        for (const cDateStr of alarm.calendarDates) {
          let cursor = parseLocalDate(cDateStr);
          for (let i = 0; i < 200; i++) {
            allRepeatDates.add(toLocalDateString(cursor));
            if (alarm.repeatEvery.unit === 'week') {
              cursor = new Date(cursor);
              cursor.setDate(cursor.getDate() + 7 * alarm.repeatEvery.value);
            } else {
              cursor = new Date(cursor);
              cursor.setMonth(cursor.getMonth() + alarm.repeatEvery.value);
            }
          }
        }
        let candidate = new Date(now);
        candidate.setHours(alarm.hour, alarm.minute, 0, 0);
        if (candidate <= now) candidate.setDate(candidate.getDate() + 1);
        for (let i = 0; i < 365; i++) {
          const dateStr = toLocalDateString(candidate);
          const day = candidate.getDay();
          const skip =
            allRepeatDates.has(dateStr) ||
            (alarm.excludeWeekends && (day === 0 || day === 6)) ||
            (alarm.excludeHolidays && holidaySet.has(dateStr));
          if (!skip) {
            const diff = candidate.getTime() - now.getTime();
            if (diff < minMs) minMs = diff;
            break;
          }
          candidate = new Date(candidate);
          candidate.setDate(candidate.getDate() + 1);
        }
      } else {
        // repeatEvery 있음(일반) 또는 없음: 후보 날짜 목록 생성 후 필터
        const datesToCheck = [...alarm.calendarDates];
        if (alarm.repeatEvery && alarm.calendarDates.length > 0) {
          const cutoff = new Date(now);
          cutoff.setFullYear(cutoff.getFullYear() + 1);
          for (const baseStr of alarm.calendarDates) {
            let cursor = parseLocalDate(baseStr);
            for (let i = 0; i < 100; i++) {
              if (alarm.repeatEvery.unit === 'week') {
                cursor = new Date(cursor);
                cursor.setDate(cursor.getDate() + 7 * alarm.repeatEvery.value);
              } else {
                cursor = new Date(cursor);
                cursor.setMonth(cursor.getMonth() + alarm.repeatEvery.value);
              }
              if (cursor > cutoff) break;
              datesToCheck.push(toLocalDateString(cursor));
            }
          }
        }
        for (const dateStr of datesToCheck) {
          const trigger = new Date(`${dateStr}T${hh}:${mm}:00`);
          if (trigger <= now) continue;
          const day = trigger.getDay();
          if (alarm.excludeWeekends && (day === 0 || day === 6)) continue;
          if (alarm.excludeHolidays && holidaySet.has(dateStr)) continue;
          const diff = trigger.getTime() - now.getTime();
          if (diff < minMs) minMs = diff;
        }
      }
    } else if (alarm.weekdays.length === 0) {
      // 요일제 - 한 번만 울림 (요일 미선택)
      const candidate = new Date();
      candidate.setHours(alarm.hour, alarm.minute, 0, 0);
      if (candidate <= now) candidate.setDate(candidate.getDate() + 1);

      // 주말/공휴일인 경우 유효한 날짜가 나올 때까지 1일씩 이동 (최대 365일)
      for (let i = 0; i < 365; i++) {
        const day = candidate.getDay();
        const dateStr = toLocalDateString(candidate);
        const skip =
          (alarm.excludeWeekends && (day === 0 || day === 6)) ||
          (alarm.excludeHolidays && holidaySet.has(dateStr));
        if (!skip) break;
        candidate.setDate(candidate.getDate() + 1);
      }

      const diff = candidate.getTime() - now.getTime();
      if (diff < minMs) minMs = diff;
    } else {
      // 요일제 - 요일 반복
      for (const weekday of alarm.weekdays) {
        // 이 요일 자체가 주말 제외 대상이면 스킵
        if (alarm.excludeWeekends && (weekday === 0 || weekday === 6)) continue;

        let daysAhead = weekday - now.getDay();
        if (daysAhead < 0) daysAhead += 7;
        const candidate = new Date();
        candidate.setDate(now.getDate() + daysAhead);
        candidate.setHours(alarm.hour, alarm.minute, 0, 0);
        if (candidate <= now) candidate.setDate(candidate.getDate() + 7);

        // 공휴일인 경우 같은 요일 다음 주로 이동 (최대 52주)
        if (alarm.excludeHolidays) {
          for (let i = 0; i < 52; i++) {
            const dateStr = toLocalDateString(candidate);
            if (!holidaySet.has(dateStr)) break;
            candidate.setDate(candidate.getDate() + 7);
          }
        }

        const diff = candidate.getTime() - now.getTime();
        if (diff < minMs) minMs = diff;
      }
    }
  }

  if (minMs === Infinity) return t('alarm.noNextAlarm');
  // ceil: 1분 미만 남은 경우 0분이 아닌 1분으로 올림 표시
  const totalMinutes = Math.ceil(minMs / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${t('alarm.nextAlarm')} ${h > 0 ? `${h}시간 ` : ''}${m}분`;
}

function WeekdayBadges({ weekdays, colors }: { weekdays: number[]; colors: typeof Colors.light }) {
  const { t } = useTranslation();
  return (
    <View style={styles.badgeRow}>
      {DAY_KEYS.map((key, idx) => {
        const active = weekdays.includes(idx);
        return (
          <View
            key={key}
            style={[
              styles.badge,
              { backgroundColor: active ? colors.primary : colors.border },
            ]}
          >
            <Text style={[styles.badgeText, { color: active ? '#6B6BA8' : colors.subText }]}>
              {t(`alarm.days.${key}`)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function AlarmCard({
  alarm,
  colors,
  onToggle,
  onPress,
  onDelete,
  holidaySet,
}: {
  alarm: Alarm;
  colors: typeof Colors.light;
  onToggle: () => void;
  onPress: () => void;
  onDelete: () => void;
  holidaySet: Set<string>;
}) {
  const { t } = useTranslation();
  const timeStr = `${String(alarm.hour).padStart(2, '0')}:${String(alarm.minute).padStart(2, '0')}`;

  // 캘린더제: 알람 시각이 아직 지나지 않은 가까운 날짜 2개 추출
  const upcomingCalendarDates = useMemo(() => {
    if (alarm.scheduleType !== 'calendar') return [];
    const now = new Date();
    const hh = String(alarm.hour).padStart(2, '0');
    const mm = String(alarm.minute).padStart(2, '0');

    if (alarm.repeatEvery && alarm.excludeRepeatDates) {
      // 반복 일자 제외 모드: 반복 날짜 집합에 없는 날 중 미래 2개 탐색
      const allRepeatDates = new Set<string>();
      for (const cDateStr of alarm.calendarDates) {
        let cursor = parseLocalDate(cDateStr);
        for (let i = 0; i < 200; i++) {
          allRepeatDates.add(toLocalDateString(cursor));
          if (alarm.repeatEvery.unit === 'week') {
            cursor = new Date(cursor);
            cursor.setDate(cursor.getDate() + 7 * alarm.repeatEvery.value);
          } else {
            cursor = new Date(cursor);
            cursor.setMonth(cursor.getMonth() + alarm.repeatEvery.value);
          }
        }
      }
      const results: string[] = [];
      let candidate = new Date(now);
      candidate.setHours(alarm.hour, alarm.minute, 0, 0);
      if (candidate <= now) candidate.setDate(candidate.getDate() + 1);
      for (let i = 0; i < 365 && results.length < 2; i++) {
        const dateStr = toLocalDateString(candidate);
        const day = candidate.getDay();
        const skip =
          allRepeatDates.has(dateStr) ||
          (alarm.excludeWeekends && (day === 0 || day === 6)) ||
          (alarm.excludeHolidays && holidaySet.has(dateStr));
        if (!skip) results.push(dateStr);
        candidate = new Date(candidate);
        candidate.setDate(candidate.getDate() + 1);
      }
      return results.map((d) => {
        const [, month, day] = d.split('-');
        return `${parseInt(month, 10)}/${parseInt(day, 10)}`;
      });
    }

    // repeatEvery 있음(일반) 또는 없음: 후보 날짜 목록 생성 후 필터
    const datesToCheck = [...alarm.calendarDates];
    if (alarm.repeatEvery && alarm.calendarDates.length > 0) {
      const cutoff = new Date(now);
      cutoff.setFullYear(cutoff.getFullYear() + 1);
      for (const baseStr of alarm.calendarDates) {
        let cursor = parseLocalDate(baseStr);
        for (let i = 0; i < 100; i++) {
          if (alarm.repeatEvery.unit === 'week') {
            cursor = new Date(cursor);
            cursor.setDate(cursor.getDate() + 7 * alarm.repeatEvery.value);
          } else {
            cursor = new Date(cursor);
            cursor.setMonth(cursor.getMonth() + alarm.repeatEvery.value);
          }
          if (cursor > cutoff) break;
          datesToCheck.push(toLocalDateString(cursor));
        }
      }
    }

    return datesToCheck
      .filter((d) => {
        const trigger = new Date(`${d}T${hh}:${mm}:00`);
        if (trigger <= now) return false;
        if (alarm.excludeWeekends) {
          const day = trigger.getDay();
          if (day === 0 || day === 6) return false;
        }
        if (alarm.excludeHolidays && holidaySet.has(d)) return false;
        return true;
      })
      .sort()
      .slice(0, 2)
      .map((d) => {
        const [, month, day] = d.split('-');
        return `${parseInt(month, 10)}/${parseInt(day, 10)}`;
      });
  }, [alarm.scheduleType, alarm.calendarDates, alarm.repeatEvery, alarm.excludeRepeatDates, alarm.excludeWeekends, alarm.excludeHolidays, alarm.hour, alarm.minute, holidaySet]);

  const repeatLabel =
    alarm.scheduleType === 'calendar'
      ? upcomingCalendarDates.length > 0
        ? upcomingCalendarDates.join(' · ')
        : t('alarm.noNextAlarm')
      : alarm.weekdays.length === 0
      ? t('alarm.once')
      : alarm.weekdays.length === 7
      ? t('alarm.everyday')
      : alarm.weekdays.map((d) => t(`alarm.days.${DAY_KEYS[d]}`)).join(' ');

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onDelete}
      activeOpacity={0.8}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.cardLeft}>
        <Text style={[styles.timeText, { color: alarm.isEnabled ? colors.text : colors.subText }]}>
          {timeStr}
        </Text>
        <Text style={[styles.nameText, { color: colors.subText }]}>{alarm.name || repeatLabel}</Text>
        {/* 캘린더제는 요일 배지 대신 날짜 텍스트, 요일제는 배지 표시 */}
        {alarm.scheduleType === 'calendar' ? (
          <View style={styles.badgeRow}>
            {upcomingCalendarDates.map((d) => (
              <View key={d} style={[styles.dateBadge, { backgroundColor: colors.accent }]}>
                <Text style={[styles.dateBadgeText, { color: '#7A4A55' }]}>{d}</Text>
              </View>
            ))}
          </View>
        ) : (
          <WeekdayBadges weekdays={alarm.weekdays} colors={colors} />
        )}
      </View>
      <View style={styles.cardRight}>
        <Switch
          value={alarm.isEnabled}
          onValueChange={onToggle}
          trackColor={{ false: colors.border, true: colors.switchTrackOn }}
          thumbColor={colors.switchThumb}
        />
      </View>
    </TouchableOpacity>
  );
}

export default function AlarmListScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const systemScheme = useColorScheme();
  const { theme } = useSettingsStore();
  const resolvedScheme = theme === 'system' ? (systemScheme ?? 'light') : theme;
  const colors = Colors[resolvedScheme];

  const { alarms, toggleAlarm, deleteAlarm } = useAlarmStore();
  const { holidayCountry } = useSettingsStore();

  const [nextAlarmText, setNextAlarmText] = useState(t('alarm.noNextAlarm'));
  const [holidaySet, setHolidaySet] = useState<Set<string>>(new Set());

  useEffect(() => {
    computeNextAlarmText(alarms, t, holidayCountry).then(setNextAlarmText);
  }, [alarms, t, holidayCountry]);

  useEffect(() => {
    const needsHolidays = alarms.some((a) => a.isEnabled && a.excludeHolidays);
    if (!needsHolidays) return;
    const year = new Date().getFullYear();
    getHolidays(holidayCountry, year).then((set) => {
      if (new Date().getMonth() === 11) {
        getHolidays(holidayCountry, year + 1).then((next) => {
          next.forEach((d) => set.add(d));
          setHolidaySet(new Set(set));
        });
      } else {
        setHolidaySet(set);
      }
    });
  }, [holidayCountry, alarms]);

  const handleDelete = (alarm: Alarm) => {
    Alert.alert(
      t('alarmEdit.deleteConfirm'),
      `${String(alarm.hour).padStart(2, '0')}:${String(alarm.minute).padStart(2, '0')} ${alarm.name}`,
      [
        { text: t('alarmEdit.cancel'), style: 'cancel' },
        { text: t('alarmEdit.confirm'), style: 'destructive', onPress: () => deleteAlarm(alarm.id) },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('alarm.title')}</Text>
      </View>

      {/* 다음 알람 배너 */}
      <View style={[styles.bannerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="alarm" size={20} color={colors.primary} />
        <Text style={[styles.bannerText, { color: colors.text }]}>{nextAlarmText}</Text>
      </View>

      {/* 알람 목록 */}
      <FlatList
        data={alarms}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <AlarmCard
            alarm={item}
            colors={colors}
            onToggle={() => toggleAlarm(item.id)}
            onPress={() => router.push(`/alarm/${item.id}`)}
            onDelete={() => handleDelete(item)}
            holidaySet={holidaySet}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="alarm-outline" size={64} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.subText }]}>{t('alarm.noAlarms')}</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />

      {/* FAB */}
      <Pressable
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => router.push('/alarm/new')}
      >
        <Ionicons name="add" size={32} color="#6B6BA8" />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  headerTitle: { fontSize: 28, fontWeight: '700' },
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  bannerText: { fontSize: 15, fontWeight: '500' },
  listContent: { paddingHorizontal: 16, paddingBottom: 100, gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  cardLeft: { flex: 1, gap: 4 },
  cardRight: { marginLeft: 12 },
  timeText: { fontSize: 36, fontWeight: '700', letterSpacing: -1 },
  nameText: { fontSize: 13 },
  badgeRow: { flexDirection: 'row', gap: 4, marginTop: 6 },
  badge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 11, fontWeight: '600' },
  dateBadge: { paddingHorizontal: 8, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dateBadgeText: { fontSize: 11, fontWeight: '700' },
  emptyContainer: { alignItems: 'center', marginTop: 80, gap: 12 },
  emptyText: { fontSize: 16 },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 28,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
});
