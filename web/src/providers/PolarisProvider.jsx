import { AppProvider } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import '@shopify/polaris/build/esm/styles.css';

export function PolarisProvider({ children }) {
  return <AppProvider i18n={enTranslations}>{children}</AppProvider>;
}
