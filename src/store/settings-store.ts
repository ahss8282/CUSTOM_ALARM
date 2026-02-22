import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { AppSettings } from '../types/settings';
import i18n from '../i18n'; // eslint-disable-line import/no-named-as-default-member

// 기기 지역 코드 감지 (최초 1회만 사용)
const getInitialRegion = (): string => {
  const regionCode = getLocales()[0]?.regionCode;
  return regionCode ?? 'KR';
};

interface SettingsStore extends AppSettings {
  isLoaded: boolean;
  loadSettings: () => Promise<void>;
  setTheme: (theme: AppSettings['theme']) => Promise<void>;
  setLanguage: (language: AppSettings['language']) => Promise<void>;
  setHolidayCountry: (code: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  theme: 'system',
  language: 'ko',
  holidayCountry: 'KR',
  isLoaded: false,

  loadSettings: async () => {
    try {
      const [theme, language, holidayCountry] = await Promise.all([
        AsyncStorage.getItem('theme'),
        AsyncStorage.getItem('language'),
        AsyncStorage.getItem('holidayCountry'),
      ]);
      const resolvedLanguage = (language as AppSettings['language']) ?? 'ko';
      // holidayCountry: 저장된 값 없으면 기기 지역 감지
      const resolvedCountry = holidayCountry ?? getInitialRegion();
      set({
        theme: (theme as AppSettings['theme']) ?? 'system',
        language: resolvedLanguage,
        holidayCountry: resolvedCountry,
        isLoaded: true,
      });
      await i18n.changeLanguage(resolvedLanguage);
    } catch {
      set({ isLoaded: true });
    }
  },

  setTheme: async (theme) => {
    set({ theme });
    await AsyncStorage.setItem('theme', theme);
  },

  setLanguage: async (language) => {
    set({ language });
    await AsyncStorage.setItem('language', language);
    await i18n.changeLanguage(language);
  },

  setHolidayCountry: async (code) => {
    set({ holidayCountry: code });
    await AsyncStorage.setItem('holidayCountry', code);
  },
}));
