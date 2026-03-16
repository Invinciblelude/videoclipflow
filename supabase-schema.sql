-- VideoClipFlow Database Schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- 1. User access tracking (free tries + paid subscriptions)
CREATE TABLE public.user_access (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free',  -- 'free', 'trial', 'monthly'
  free_uses INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Payment records
CREATE TABLE public.payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  plan TEXT NOT NULL,              -- 'trial' or 'monthly'
  chain TEXT NOT NULL,             -- 'tron', 'btc', 'eth'
  amount NUMERIC NOT NULL,         -- 5 or 9
  tx_hash TEXT,                   -- blockchain tx hash (verified payments)
  status TEXT NOT NULL DEFAULT 'pending_confirmation',  -- 'pending_confirmation', 'verified', 'rejected'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add tx_hash if table already exists (run separately if needed):
-- ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS tx_hash TEXT;

-- 3. Extraction log (track what people extract)
CREATE TABLE public.extractions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  source_url TEXT,
  source_type TEXT,                -- 'url' or 'upload'
  outputs TEXT[],                  -- {'transcript','captions','audio'}
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Enable Row Level Security
ALTER TABLE public.user_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extractions ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies: users can only see/modify their own data
CREATE POLICY "Users can view own access"
  ON public.user_access FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own access"
  ON public.user_access FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own access"
  ON public.user_access FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own payments"
  ON public.payments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own payments"
  ON public.payments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own extractions"
  ON public.extractions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own extractions"
  ON public.extractions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 6. Auto-update updated_at on user_access
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_access_updated_at
  BEFORE UPDATE ON public.user_access
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 7. Index for fast lookups
CREATE INDEX idx_user_access_user_id ON public.user_access(user_id);
CREATE INDEX idx_payments_user_id ON public.payments(user_id);
CREATE INDEX idx_extractions_user_id ON public.extractions(user_id);
