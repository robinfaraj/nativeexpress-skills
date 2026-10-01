import Purchases from 'react-native-purchases';

export const buy = (pkg: unknown) => Purchases.purchasePackage(pkg);
