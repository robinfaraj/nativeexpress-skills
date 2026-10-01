import Purchases from 'react-native-purchases';
import { Linking } from 'react-native';

export const restore = () => Purchases.restorePurchases();
export const openTerms = () => Linking.openURL('https://acme.app/terms');
export const openPrivacy = () => Linking.openURL('https://acme.app/privacy');
