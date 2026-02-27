import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  ScrollView,
  Switch,
  Modal,
  FlatList,
  Platform,
  Alert,
  NativeModules,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useState } from 'react';

import { Colors } from '@/constants/theme';
import { useSettingsStore } from '@/src/store/settings-store';
import { AppSettings, SUPPORTED_COUNTRIES } from '@/src/types/settings';
import { openBatteryOptimizationSettings } from '@/src/utils/battery-optimization';
import {
  openExactAlarmSettings,
  openFullScreenIntentSettings,
  needsExactAlarmPermission,
  needsFullScreenIntentPermission,
} from '@/src/utils/alarm-permissions';

type ThemeOption = AppSettings['theme'];
type LangOption = AppSettings['language'];

/* ─── 섹션 헤더 ─── */
function SectionHeader({ title, colors }: { title: string; colors: typeof Colors.light }) {
  return (
    <Text style={[sS.header, { color: colors.subText }]}>{title.toUpperCase()}</Text>
  );
}
const sS = StyleSheet.create({ header: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 6, marginLeft: 4 } });

/* ─── 라디오 행 ─── */
function RadioRow({
  icon,
  label,
  selected,
  onPress,
  colors,
  isLast = false,
}: {
  icon?: string;
  label: string;
  selected: boolean;
  onPress: () => void;
  colors: typeof Colors.light;
  isLast?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[rS.row, { borderColor: colors.border, borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {icon && <Ionicons name={icon as any} size={20} color={colors.subText} />}
      <Text style={[rS.label, { color: colors.text }]}>{label}</Text>
      {selected && <Ionicons name="checkmark" size={20} color={colors.primary} />}
    </TouchableOpacity>
  );
}
const rS = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  label: { flex: 1, fontSize: 16 },
});

/* ─── 탭 행 (화살표) ─── */
function NavRow({
  icon,
  label,
  value,
  onPress,
  colors,
  isLast = false,
}: {
  icon?: string;
  label: string;
  value?: string;
  onPress: () => void;
  colors: typeof Colors.light;
  isLast?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[rS.row, { borderColor: colors.border, borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {icon && <Ionicons name={icon as any} size={20} color={colors.subText} />}
      <Text style={[rS.label, { color: colors.text }]}>{label}</Text>
      {value && <Text style={{ color: colors.subText, fontSize: 15 }}>{value}</Text>}
      <Ionicons name="chevron-forward" size={16} color={colors.subText} />
    </TouchableOpacity>
  );
}

/* ─── 토글 행 ─── */
function ToggleRow({
  icon,
  label,
  desc,
  value,
  onValueChange,
  colors,
  isLast = false,
}: {
  icon?: string;
  label: string;
  desc?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  colors: typeof Colors.light;
  isLast?: boolean;
}) {
  return (
    <View style={[rS.row, { borderColor: colors.border, borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth }]}>
      {icon && <Ionicons name={icon as any} size={20} color={colors.subText} />}
      <View style={{ flex: 1 }}>
        <Text style={[rS.label, { flex: 0, color: colors.text }]}>{label}</Text>
        {desc && <Text style={{ color: colors.subText, fontSize: 12, marginTop: 2 }}>{desc}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.switchTrackOn }}
        thumbColor={colors.switchThumb}
      />
    </View>
  );
}

/* ─── 국가 선택 모달 ─── */
/**
 * 알람 진단 섹션
 * - notifee 네이티브 모듈 탑재 여부
 * - 현재 notifee에 등록된 트리거 알림 목록
 * - 10초 뒤 테스트 알림 즉시 발동
 */
function AlarmDiagnostics({ colors }: { colors: typeof Colors.light }) {
  const [log, setLog] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const runDiagnostics = async () => {
    setLoading(true);
    const lines: string[] = [];

    // 1) notifee 네이티브 모듈 존재 여부
    const hasNative = !!NativeModules.NotifeeApiModule;
    lines.push(`✔ notifee 네이티브: ${hasNative ? 'OK' : '없음(재빌드 필요)'}`);

    if (!hasNative) {
      setLog(lines.join('\n'));
      setLoading(false);
      return;
    }

    try {
      const notifee = (await import('@notifee/react-native')).default;

      // 2) 등록된 트리거 알림 목록
      const triggers = await notifee.getTriggerNotifications();
      lines.push(`✔ 예약된 알림 수: ${triggers.length}개`);
      triggers.forEach((t) => {
        const ts = (t.trigger as any).timestamp;
        const date = ts ? new Date(ts).toLocaleString('ko-KR') : '?';
        lines.push(`  - id=${t.notification.id}  발동=${date}`);
      });

      // 3) 채널 목록
      const channels = await notifee.getChannels();
      lines.push(`✔ 알림 채널: ${channels.map((c) => c.id).join(', ') || '없음'}`);

      // 4) 앱 알림 설정 (전체 허용 여부)
      const settings = await notifee.getNotificationSettings();
      lines.push(`✔ 알림 허용: ${(settings as any).authorizationStatus}`);
    } catch (e: any) {
      lines.push(`✘ notifee 오류: ${e?.message}`);
    }

    setLog(lines.join('\n'));
    setLoading(false);
  };

  const sendTestNotification = async () => {
    if (!NativeModules.NotifeeApiModule) {
      Alert.alert('오류', 'notifee 네이티브 모듈이 없습니다. 재빌드가 필요합니다.');
      return;
    }
    try {
      const notifee = (await import('@notifee/react-native')).default;
      const { TriggerType, AndroidImportance, AndroidVisibility, AndroidCategory } =
        await import('@notifee/react-native');

      // 채널이 없으면 생성
      await notifee.createChannel({
        id: 'alarm_fullscreen',
        name: '알람',
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        bypassDnd: true,
        vibration: true,
      });

      const timestamp = Date.now() + 10_000; // 10초 뒤
      await notifee.createTriggerNotification(
        {
          id: 'diag_test',
          title: '🔔 진단 테스트 알람',
          body: `발동 시각: ${new Date(timestamp).toLocaleTimeString('ko-KR')}`,
          data: { alarmId: 'diag_test' },
          android: {
            channelId: 'alarm_fullscreen',
            category: AndroidCategory.ALARM,
            fullScreenAction: { id: 'alarm_fullscreen', launchActivity: 'default' },
            importance: AndroidImportance.HIGH,
            visibility: AndroidVisibility.PUBLIC,
            pressAction: { id: 'default', launchActivity: 'default' },
            bypassDnd: true,
          },
        },
        {
          type: TriggerType.TIMESTAMP,
          timestamp,
          alarmManager: { allowWhileIdle: true },
        }
      );

      Alert.alert('테스트 알람 등록됨', '10초 뒤 알람이 울려야 합니다.\n화면을 끄고 기다려 보세요.');
      // 등록 후 진단 갱신
      await runDiagnostics();
    } catch (e: any) {
      Alert.alert('등록 실패', e?.message ?? String(e));
    }
  };

  const sendTestUpcomingNotification = async () => {
    if (!NativeModules.NotifeeApiModule) {
      Alert.alert('오류', 'notifee 네이티브 모듈이 없습니다. 재빌드가 필요합니다.');
      return;
    }
    try {
      const notifee = (await import('@notifee/react-native')).default;
      const { AndroidImportance, AndroidVisibility } = await import('@notifee/react-native');

      // 예정 알람 채널 생성 (없으면 생성, 있으면 무시됨)
      await notifee.createChannel({
        id: 'alarm_upcoming_v4',
        name: '예정된 알람',
        importance: AndroidImportance.LOW,
        visibility: AndroidVisibility.PUBLIC,
        sound: '',
        vibration: false,
      });

      // 즉시 표시 (displayNotification)
      await notifee.displayNotification({
        id: 'diag_upcoming_test',
        title: '예정된 알람 — 테스트',
        body: `채널 alarm_upcoming_v4 테스트 (${new Date().toLocaleTimeString('ko-KR')})`,
        data: { alarmId: 'diag_test', type: 'upcoming', triggerNotifId: 'diag_test_once' },
        android: {
          channelId: 'alarm_upcoming_v4',
          vibrationPattern: [],
          visibility: AndroidVisibility.PUBLIC,
          pressAction: { id: 'default', launchActivity: 'default' },
          actions: [{ title: '지금 해제', pressAction: { id: 'cancel_alarm' } }],
        },
      });

      Alert.alert('예정 알림 표시됨', '알림 트레이에 "예정된 알람 — 테스트"가 표시되었는지 확인해 주세요.');
      await runDiagnostics();
    } catch (e: any) {
      Alert.alert('예정 알림 표시 실패', e?.message ?? String(e));
    }
  };

  return (
    <>
      <SectionHeader title="🔧 알람 진단" colors={colors} />
      <View style={[{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, marginHorizontal: 16, padding: 12, marginBottom: 8 }]}>
        <TouchableOpacity
          onPress={runDiagnostics}
          disabled={loading}
          style={{ backgroundColor: colors.tint, borderRadius: 8, padding: 10, alignItems: 'center', marginBottom: 8 }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>{loading ? '진단 중…' : '진단 실행'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={sendTestNotification}
          style={{ backgroundColor: '#e74c3c', borderRadius: 8, padding: 10, alignItems: 'center', marginBottom: 8 }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>10초 뒤 테스트 알람 등록</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={sendTestUpcomingNotification}
          style={{ backgroundColor: '#e67e22', borderRadius: 8, padding: 10, alignItems: 'center', marginBottom: 8 }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>예정 알림 즉시 표시 테스트</Text>
        </TouchableOpacity>
        {log ? (
          <Text selectable style={{ color: colors.text, fontFamily: 'monospace', fontSize: 12, lineHeight: 18 }}>
            {log}
          </Text>
        ) : (
          <Text style={{ color: colors.subText, fontSize: 12 }}>진단 실행 버튼을 누르면 결과가 표시됩니다.</Text>
        )}
      </View>
    </>
  );
}

function CountryModal({
  visible,
  onClose,
  selectedCode,
  onSelect,
  colors,
  language,
}: {
  visible: boolean;
  onClose: () => void;
  selectedCode: string;
  onSelect: (code: string) => void;
  colors: typeof Colors.light;
  language: string;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[{ flex: 1 }, { backgroundColor: colors.background }]}>
        <View style={[cS.header, { borderColor: colors.border }]}>
          <Text style={[cS.title, { color: colors.text }]}>공휴일 국가 선택</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
        <FlatList
          data={SUPPORTED_COUNTRIES}
          keyExtractor={(item) => item.code}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[cS.countryRow, { borderColor: colors.border }]}
              onPress={() => { onSelect(item.code); onClose(); }}
            >
              <Text style={[cS.countryName, { color: colors.text }]}>
                {language === 'ko' ? item.nameKo : item.nameEn}
              </Text>
              {selectedCode === item.code && (
                <Ionicons name="checkmark" size={20} color={colors.primary} />
              )}
            </TouchableOpacity>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

const cS = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 18, fontWeight: '700' },
  countryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  countryName: { fontSize: 16 },
});

/* ─── 메인 설정 화면 ─── */
export default function SettingsScreen() {
  const { t } = useTranslation();
  const systemScheme = useColorScheme();
  const { theme, language, holidayCountry, setTheme, setLanguage, setHolidayCountry } = useSettingsStore();
  const resolvedScheme = theme === 'system' ? (systemScheme ?? 'light') : theme;
  const colors = Colors[resolvedScheme];

  const [countryModalVisible, setCountryModalVisible] = useState(false);
  const [criticalAlerts, setCriticalAlerts] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  const themeOptions: { value: ThemeOption; label: string; icon: string }[] = [
    { value: 'system', label: t('settings.themeSystem'), icon: 'phone-portrait-outline' },
    { value: 'light', label: t('settings.themeLight'), icon: 'sunny-outline' },
    { value: 'dark', label: t('settings.themeDark'), icon: 'moon-outline' },
  ];

  const langOptions: { value: LangOption; label: string }[] = [
    { value: 'ko', label: t('settings.languageKo') },
    { value: 'en', label: t('settings.languageEn') },
  ];

  const selectedCountry = SUPPORTED_COUNTRIES.find((c) => c.code === holidayCountry);
  const countryLabel = selectedCountry
    ? (language === 'ko' ? selectedCountry.nameKo : selectedCountry.nameEn)
    : holidayCountry;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('settings.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* 테마 */}
        <SectionHeader title={t('settings.display')} colors={colors} />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {themeOptions.map((opt, i) => (
            <RadioRow
              key={opt.value}
              icon={opt.icon}
              label={opt.label}
              selected={theme === opt.value}
              onPress={() => setTheme(opt.value)}
              colors={colors}
              isLast={i === themeOptions.length - 1}
            />
          ))}
        </View>

        {/* 지역화 */}
        <SectionHeader title={t('settings.localization')} colors={colors} />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {langOptions.map((opt, i) => (
            <RadioRow
              key={opt.value}
              icon="language-outline"
              label={opt.label}
              selected={language === opt.value}
              onPress={() => setLanguage(opt.value)}
              colors={colors}
              isLast={i === langOptions.length - 1 && false}
            />
          ))}
          <NavRow
            icon="calendar-outline"
            label={t('settings.holidayCountry')}
            value={countryLabel}
            onPress={() => setCountryModalVisible(true)}
            colors={colors}
            isLast
          />
        </View>

        {/* 알림 */}
        <SectionHeader title={t('settings.notification')} colors={colors} />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ToggleRow
            icon="notifications-outline"
            label={t('settings.criticalAlerts')}
            desc={t('settings.criticalAlertsDesc')}
            value={criticalAlerts}
            onValueChange={setCriticalAlerts}
            colors={colors}
            isLast
          />
        </View>

        {/* 알람 신뢰도 (Android 전용) */}
        {Platform.OS === 'android' && (
          <>
            <SectionHeader title={t('settings.alarmReliability')} colors={colors} />
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {/* 1) 정확한 알람 권한 — Android 12+ 필수 */}
              {needsExactAlarmPermission() && (
                <NavRow
                  icon="alarm-outline"
                  label={t('settings.exactAlarm')}
                  onPress={() => {
                    Alert.alert(
                      t('settings.exactAlarm'),
                      t('settings.exactAlarmDesc'),
                      [
                        { text: t('common.cancel'), style: 'cancel' },
                        { text: t('settings.goToSettings'), onPress: openExactAlarmSettings },
                      ]
                    );
                  }}
                  colors={colors}
                />
              )}
              {/* 2) 전체화면 인텐트 권한 — Android 14+ 필수 */}
              {needsFullScreenIntentPermission() && (
                <NavRow
                  icon="expand-outline"
                  label={t('settings.fullScreenIntent')}
                  onPress={() => {
                    Alert.alert(
                      t('settings.fullScreenIntent'),
                      t('settings.fullScreenIntentDesc'),
                      [
                        { text: t('common.cancel'), style: 'cancel' },
                        { text: t('settings.goToSettings'), onPress: openFullScreenIntentSettings },
                      ]
                    );
                  }}
                  colors={colors}
                />
              )}
              {/* 3) 배터리 최적화 제외 */}
              <NavRow
                icon="battery-charging-outline"
                label={t('settings.batteryOptimization')}
                onPress={() => {
                  Alert.alert(
                    t('settings.batteryOptimization'),
                    t('settings.batteryOptimizationDesc'),
                    [
                      { text: t('common.cancel'), style: 'cancel' },
                      { text: t('settings.goToSettings'), onPress: openBatteryOptimizationSettings },
                    ]
                  );
                }}
                colors={colors}
                isLast
              />
            </View>
          </>
        )}

        {/* 알람 진단 (Android 전용) */}
        {Platform.OS === 'android' && (
          <AlarmDiagnostics colors={colors} />
        )}

        {/* 정보 */}
        <SectionHeader title={t('settings.info')} colors={colors} />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[rS.row, { borderColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <Ionicons name="information-circle-outline" size={20} color={colors.subText} />
            <Text style={[rS.label, { color: colors.text }]}>{t('settings.version')}</Text>
            <Text style={{ color: colors.subText }}>{appVersion}</Text>
          </View>
          <View style={[rS.row, { borderColor: colors.border, borderBottomWidth: 0 }]}>
            <Ionicons name="document-text-outline" size={20} color={colors.subText} />
            <Text style={[rS.label, { color: colors.text }]}>{t('settings.licenses')}</Text>
          </View>
        </View>

        <Text style={[styles.footer, { color: colors.subText }]}>
          Made with ❤️ for heavy sleepers
        </Text>
      </ScrollView>

      {/* 국가 선택 모달 */}
      <CountryModal
        visible={countryModalVisible}
        onClose={() => setCountryModalVisible(false)}
        selectedCode={holidayCountry}
        onSelect={setHolidayCountry}
        colors={colors}
        language={language}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  headerTitle: { fontSize: 28, fontWeight: '700' },
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 16 },
  footer: { textAlign: 'center', fontSize: 13, marginTop: 8 },
});
