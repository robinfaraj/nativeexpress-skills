import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { supabase } from './supabase';

export const signUpWithEmail = (email: string, password: string) => supabase.auth.signUp({ email, password });

export async function signInWithGoogle() {
  const { data } = await GoogleSignin.signIn();
  return supabase.auth.signInWithIdToken({ provider: 'google', token: data.idToken });
}

export async function signInWithApple() {
  const credential = await AppleAuthentication.signInAsync({});
  return supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken });
}
