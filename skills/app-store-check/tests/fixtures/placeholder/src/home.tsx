import { Text } from 'react-native';

export const API_URL = 'http://localhost:3000';
export const DEV_URL = __DEV__ ? 'http://localhost:8081' : 'https://api.acme.app';
export const Home = () => <Text>Lorem ipsum dolor sit amet</Text>;
