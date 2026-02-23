// src/i18n/index.ts
import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { en } from './locales/en';
import { frCA } from './locales/fr-CA';

i18next
  .use(LanguageDetector)
  .init({
    resources: {
      en: { translation: en },
      'fr-CA': { translation: frCA },
      // Fallback for generic French to Canadian French if needed, or just alias in detection
      fr: { translation: frCA }
    },
    fallbackLng: 'en',
    debug: false,
    interpolation: {
      escapeValue: false // not needed for our usage
    }
  });

export default i18next;
