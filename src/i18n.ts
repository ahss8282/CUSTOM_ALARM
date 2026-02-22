import i18n from 'i18next'; // eslint-disable-line import/no-named-as-default-member
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import ko from './locales/ko.json';
import en from './locales/en.json';

// 기기 언어 감지: 'ko'로 시작하면 한국어, 아니면 영어
const deviceLocale = getLocales()[0]?.languageCode ?? 'en';
const initialLanguage = deviceLocale.startsWith('ko') ? 'ko' : 'en';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      ko: { translation: ko },
      en: { translation: en },
    },
    lng: initialLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
