import { supabase } from './supabase';

export const deleteAccount = () => supabase.functions.invoke('delete-account');
