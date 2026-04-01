-- ============================================================
-- Credits System Schema
-- ============================================================

-- Subscription plans enum
CREATE TYPE public.subscription_plan AS ENUM (
  'free', 'starter', 'pro', 'ultra', 'business'
);

-- Billing period enum
CREATE TYPE public.billing_period AS ENUM ('monthly', 'yearly');

-- Credit transaction types
CREATE TYPE public.credit_transaction_type AS ENUM (
  'subscription_grant',
  'daily_grant',
  'purchase',
  'generation_deduct',
  'generation_refund',
  'admin_adjustment',
  'bonus'
);

-- ── Subscriptions ────────────────────────────────────────────
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plan public.subscription_plan NOT NULL DEFAULT 'free',
  billing_period public.billing_period,
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id)
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own workspace subscription"
  ON public.subscriptions FOR SELECT
  USING (
    workspace_id IN (
      SELECT wm.workspace_id FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid()
    )
  );

-- ── Credit Balances ──────────────────────────────────────────
CREATE TABLE public.credit_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  version integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id)
);

ALTER TABLE public.credit_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own workspace balance"
  ON public.credit_balances FOR SELECT
  USING (
    workspace_id IN (
      SELECT wm.workspace_id FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid()
    )
  );

-- ── Credit Transactions (append-only ledger) ─────────────────
CREATE TABLE public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  transaction_type public.credit_transaction_type NOT NULL,
  amount integer NOT NULL,
  balance_after integer NOT NULL,
  job_id uuid REFERENCES public.background_jobs(id),
  description text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_credit_transactions_workspace
  ON public.credit_transactions(workspace_id, created_at DESC);
CREATE INDEX idx_credit_transactions_job
  ON public.credit_transactions(job_id) WHERE job_id IS NOT NULL;

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own workspace transactions"
  ON public.credit_transactions FOR SELECT
  USING (
    workspace_id IN (
      SELECT wm.workspace_id FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid()
    )
  );

-- ── Daily Credit Claims ──────────────────────────────────────
CREATE TABLE public.daily_credit_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  claim_date date NOT NULL DEFAULT CURRENT_DATE,
  amount integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, claim_date)
);

ALTER TABLE public.daily_credit_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own daily claims"
  ON public.daily_credit_claims FOR SELECT
  USING (
    workspace_id IN (
      SELECT wm.workspace_id FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid()
    )
  );

-- ── RPC: Atomic credit deduction ─────────────────────────────
CREATE OR REPLACE FUNCTION public.deduct_credits(
  p_workspace_id uuid,
  p_user_id uuid,
  p_amount integer,
  p_job_id uuid,
  p_description text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
  v_new_balance integer;
  v_version integer;
  v_tx_id uuid;
BEGIN
  SELECT balance, version INTO v_balance, v_version
  FROM public.credit_balances
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_BALANCE: No credit balance found for workspace %', p_workspace_id;
  END IF;

  v_new_balance := v_balance - p_amount;

  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS: have %, need %', v_balance, p_amount;
  END IF;

  UPDATE public.credit_balances
  SET balance = v_new_balance,
      version = v_version + 1,
      updated_at = now()
  WHERE workspace_id = p_workspace_id AND version = v_version;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONCURRENT_MODIFICATION: credit balance was modified concurrently';
  END IF;

  INSERT INTO public.credit_transactions
    (workspace_id, user_id, transaction_type, amount, balance_after, job_id, description)
  VALUES
    (p_workspace_id, p_user_id, 'generation_deduct', -p_amount, v_new_balance, p_job_id, p_description)
  RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END;
$$;

-- ── RPC: Refund credits ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.refund_credits(
  p_workspace_id uuid,
  p_user_id uuid,
  p_amount integer,
  p_job_id uuid,
  p_description text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
  v_version integer;
  v_new_balance integer;
  v_tx_id uuid;
BEGIN
  SELECT balance, version INTO v_balance, v_version
  FROM public.credit_balances
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_BALANCE: No credit balance found for workspace %', p_workspace_id;
  END IF;

  v_new_balance := v_balance + p_amount;

  UPDATE public.credit_balances
  SET balance = v_new_balance,
      version = v_version + 1,
      updated_at = now()
  WHERE workspace_id = p_workspace_id AND version = v_version;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONCURRENT_MODIFICATION: credit balance was modified concurrently';
  END IF;

  INSERT INTO public.credit_transactions
    (workspace_id, user_id, transaction_type, amount, balance_after, job_id, description)
  VALUES
    (p_workspace_id, p_user_id, 'generation_refund', p_amount, v_new_balance, p_job_id, p_description)
  RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END;
$$;

-- ── RPC: Claim daily free credits ────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_daily_credits(
  p_workspace_id uuid,
  p_amount integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version integer;
  v_balance integer;
  v_new_balance integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.daily_credit_claims
    WHERE workspace_id = p_workspace_id AND claim_date = CURRENT_DATE
  ) THEN
    RETURN false;
  END IF;

  SELECT balance, version INTO v_balance, v_version
  FROM public.credit_balances
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.credit_balances (workspace_id, balance, version)
    VALUES (p_workspace_id, 0, 0)
    ON CONFLICT (workspace_id) DO NOTHING;

    SELECT balance, version INTO v_balance, v_version
    FROM public.credit_balances
    WHERE workspace_id = p_workspace_id
    FOR UPDATE;
  END IF;

  v_new_balance := v_balance + p_amount;

  UPDATE public.credit_balances
  SET balance = v_new_balance,
      version = v_version + 1,
      updated_at = now()
  WHERE workspace_id = p_workspace_id AND version = v_version;

  INSERT INTO public.daily_credit_claims (workspace_id, claim_date, amount)
  VALUES (p_workspace_id, CURRENT_DATE, p_amount);

  INSERT INTO public.credit_transactions
    (workspace_id, transaction_type, amount, balance_after, description)
  VALUES
    (p_workspace_id, 'daily_grant', p_amount, v_new_balance, 'Daily free credits');

  RETURN true;
END;
$$;

-- ── Auto-init credits for new workspaces ─────────────────────
CREATE OR REPLACE FUNCTION public.init_workspace_credits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscriptions (workspace_id, plan)
  VALUES (NEW.id, 'free')
  ON CONFLICT (workspace_id) DO NOTHING;

  INSERT INTO public.credit_balances (workspace_id, balance)
  VALUES (NEW.id, 0)
  ON CONFLICT (workspace_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_init_workspace_credits
  AFTER INSERT ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.init_workspace_credits();

-- ── Backfill existing workspaces ─────────────────────────────
INSERT INTO public.subscriptions (workspace_id, plan)
SELECT id, 'free' FROM public.workspaces
ON CONFLICT (workspace_id) DO NOTHING;

INSERT INTO public.credit_balances (workspace_id, balance)
SELECT id, 0 FROM public.workspaces
ON CONFLICT (workspace_id) DO NOTHING;

-- ── Add credit fields to background_jobs ─────────────────────
ALTER TABLE public.background_jobs
  ADD COLUMN IF NOT EXISTS credits_transaction_id uuid,
  ADD COLUMN IF NOT EXISTS credits_cost integer;
