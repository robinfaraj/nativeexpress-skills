import { supabase } from './supabase';

export const signUp = (email: string, password: string) => supabase.auth.signUp({ email, password });
