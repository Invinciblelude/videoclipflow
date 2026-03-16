-- Add tx_hash column to payments for verified payment tracking
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS tx_hash TEXT;
