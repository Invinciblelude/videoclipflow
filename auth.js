const SUPABASE_URL = (typeof CONFIG !== 'undefined' && CONFIG.SUPABASE_URL) || '';
const SUPABASE_KEY = (typeof CONFIG !== 'undefined' && CONFIG.SUPABASE_ANON_KEY) || '';

let sbClient = null;
let currentUser = null;

function initSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('Supabase not configured — running in local-only mode');
    return false;
  }
  try {
    if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
      console.error('Supabase JS SDK not loaded');
      return false;
    }
    sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    return true;
  } catch (err) {
    console.error('Failed to init Supabase:', err);
    return false;
  }
}

async function getSession() {
  if (!sbClient) return null;
  const { data } = await sbClient.auth.getSession();
  if (data.session) {
    currentUser = data.session.user;
    return data.session;
  }
  return null;
}

async function signUp(email, password) {
  if (!sbClient) throw new Error('Supabase not configured');
  const redirectUrl = window.location.origin + '/app.html';
  const { data, error } = await sbClient.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: redirectUrl },
  });
  if (error) throw error;
  currentUser = data.user;
  return data;
}

async function signIn(email, password) {
  if (!sbClient) throw new Error('Supabase not configured');
  const { data, error } = await sbClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
  currentUser = data.user;
  return data;
}

async function signInWithGoogle() {
  if (!sbClient) throw new Error('Supabase not configured');
  const redirectUrl = window.location.origin + '/app.html';
  const { data, error } = await sbClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: redirectUrl },
  });
  if (error) throw error;
  return data;
}

async function signOut() {
  if (!sbClient) return;
  await sbClient.auth.signOut();
  currentUser = null;
}

async function getUserAccess() {
  if (!sbClient || !currentUser) return null;
  const { data, error } = await sbClient
    .from('user_access')
    .select('*')
    .eq('user_id', currentUser.id)
    .single();
  if (error && error.code !== 'PGRST116') return null;
  return data;
}

async function recordPayment(plan, chain, amount) {
  if (!sbClient || !currentUser) return false;
  const days = plan === 'trial' ? 14 : 30;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const { error: payError } = await sbClient.from('payments').insert({
    user_id: currentUser.id,
    plan: plan,
    chain: chain,
    amount: amount,
    status: 'pending_confirmation',
  });
  if (payError) console.error('Payment record error:', payError);

  const { error: accessError } = await sbClient.from('user_access').upsert({
    user_id: currentUser.id,
    plan: plan,
    expires_at: expiresAt,
    is_active: true,
  }, { onConflict: 'user_id' });
  if (accessError) console.error('Access update error:', accessError);

  return !payError && !accessError;
}

async function recordFreeUse() {
  if (!sbClient || !currentUser) return;
  await sbClient.from('user_access').upsert({
    user_id: currentUser.id,
    plan: 'free',
    free_uses: 1,
    is_active: false,
  }, { onConflict: 'user_id' });
}

async function checkSupabaseAccess() {
  const access = await getUserAccess();
  if (!access) return { hasAccess: true, reason: 'free' };
  if (access.is_active && new Date(access.expires_at) > new Date()) {
    return { hasAccess: true, reason: 'paid', plan: access.plan, expires: access.expires_at };
  }
  if ((access.free_uses || 0) === 0) {
    return { hasAccess: true, reason: 'free' };
  }
  return { hasAccess: false, reason: 'expired' };
}

function onAuthStateChange(callback) {
  if (!sbClient) return;
  sbClient.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user || null;
    callback(event, session);
  });
}
