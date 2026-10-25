import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || 'https://ovuvbgsrdrtwitotypsk.supabase.co'
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || 'sb_publishable_yaJCvKvSoaDAtqZl_xea1g_9M5iuyRh'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
