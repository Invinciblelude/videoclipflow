// API_BASE: empty = same origin (local dev). Production = api subdomain.
const CONFIG = {
  API_BASE: (typeof window !== 'undefined' && window.location?.hostname === 'videoclipflow.com')
    ? 'https://api.videoclipflow.com'
    : '',
  SUPABASE_URL: 'https://wqvytlojlhbdjzszptph.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indxdnl0bG9qbGhiZGp6c3pwdHBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNzY4NDQsImV4cCI6MjA4ODk1Mjg0NH0.WwPPa9EYvrpCgQVvHoBuYx1srsLeJc-_ltfAQVZzpss',
};
