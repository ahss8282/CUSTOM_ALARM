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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useState } from 'react';

import { Colors } from '@/constants/theme';
import { useSettingsStore } from '@/src/store/settings-store';
import { AppSettings, SUPPORTED_COUNTRIES } from '@/src/types/settings';

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
