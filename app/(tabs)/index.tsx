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
import { useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useAlarmStore } from '@/src/store/alarm-store';
import { useSettingsStore } from '@/src/store/settings-store';
import { Alarm } from '@/src/types/alarm';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function getNextAlarmText(alarms: Alarm[], t: (key: string) => string): string {
  const enabled = alarms.filter((a) => a.isEnabled);
  if (enabled.length === 0) return t('alarm.noNextAlarm');

  const now = new Date();
  let minMs = Infinity;

  for (const alarm of enabled) {
    if (alarm.scheduleType === 'calendar') {
      // 캘린더제: calendarDates 중 알람 시각이 아직 지나지 않은 날짜를 탐색
      for (const dateStr of alarm.calendarDates) {
        const trigger = new Date(
          `${dateStr}T${String(alarm.hour).padStart(2, '0')}:${String(alarm.minute).padStart(2, '0')}:00`
        );
        if (trigger > now) {
          const diff = trigger.getTime() - now.getTime();
          if (diff < minMs) minMs = diff;
        }
      }
    } else if (alarm.weekdays.length === 0) {
      // 요일제 - 한 번만 울림 (요일 미선택)
      const candidate = new Date();
      candidate.setHours(alarm.hour, alarm.minute, 0, 0);
      if (candidate <= now) candidate.setDate(candidate.getDate() + 1);
      const diff = candidate.getTime() - now.getTime();
      if (diff < minMs) minMs = diff;
    } else {
      // 요일제 - 요일 반복
      for (const weekday of alarm.weekdays) {
        let daysAhead = weekday - now.getDay();
        if (daysAhead < 0) daysAhead += 7;
        const candidate = new Date();
        candidate.setDate(now.getDate() + daysAhead);
        candidate.setHours(alarm.hour, alarm.minute, 0, 0);
        if (candidate <= now) candidate.setDate(candidate.getDate() + 7);
        const diff = candidate.getTime() - now.getTime();
        if (diff < minMs) minMs = diff;
      }
    }
  }

  if (minMs === Infinity) return t('alarm.noNextAlarm');
  const totalMinutes = Math.floor(minMs / 60000);
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
}: {
  alarm: Alarm;
  colors: typeof Colors.light;
  onToggle: () => void;
  onPress: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const timeStr = `${String(alarm.hour).padStart(2, '0')}:${String(alarm.minute).padStart(2, '0')}`;

  // 캘린더제: 알람 시각이 아직 지나지 않은 가까운 날짜 2개 추출
  const upcomingCalendarDates = useMemo(() => {
    if (alarm.scheduleType !== 'calendar') return [];
    const now = new Date();
    return alarm.calendarDates
      .filter((d) => {
        // 날짜 자정이 아닌, 해당 날짜의 실제 알람 시각 기준으로 비교
        const trigger = new Date(
          `${d}T${String(alarm.hour).padStart(2, '0')}:${String(alarm.minute).padStart(2, '0')}:00`
        );
        return trigger > now;
      })
      .slice(0, 2)
      .map((d) => {
        const [, month, day] = d.split('-');
        return `${parseInt(month, 10)}/${parseInt(day, 10)}`;
      });
  }, [alarm.scheduleType, alarm.calendarDates, alarm.hour, alarm.minute]);

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

  const nextAlarmText = useMemo(() => getNextAlarmText(alarms, t), [alarms, t]);

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
