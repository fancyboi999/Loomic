-- ============================================================
-- RPC: Atomic plan upgrade with credit grant
-- Fixes race condition where a concurrent credit deduction between
-- the balance read and balance write could be silently overwritten.
-- ============================================================

CREATE OR REPLACE FUNCTION public.grant_plan_credits(
  p_workspace_id uuid,
  p_plan public.subscription_plan,
  p_credits integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
  v_new_balance integer;
  v_version integer;
BEGIN
  -- 1. Update the subscription plan
  UPDATE public.subscriptions
  SET plan = p_plan,
      updated_at = now()
  WHERE workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_SUBSCRIPTION: No subscription found for workspace %', p_workspace_id;
  END IF;

  -- 2. If no credits to grant, just return current balance
  IF p_credits <= 0 THEN
    SELECT COALESCE(balance, 0) INTO v_new_balance
    FROM public.credit_balances
    WHERE workspace_id = p_workspace_id;

    RETURN COALESCE(v_new_balance, 0);
  END IF;

  -- 3. Lock the balance row and atomically increment
  SELECT balance, version INTO v_balance, v_version
  FROM public.credit_balances
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Auto-init if missing (defensive — trigger should have created it)
    INSERT INTO public.credit_balances (workspace_id, balance, version)
    VALUES (p_workspace_id, 0, 0)
    ON CONFLICT (workspace_id) DO NOTHING;

    SELECT balance, version INTO v_balance, v_version
    FROM public.credit_balances
    WHERE workspace_id = p_workspace_id
    FOR UPDATE;
  END IF;

  v_new_balance := v_balance + p_credits;

  UPDATE public.credit_balances
  SET balance = v_new_balance,
      version = v_version + 1,
      updated_at = now()
  WHERE workspace_id = p_workspace_id AND version = v_version;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONCURRENT_MODIFICATION: credit balance was modified concurrently';
  END IF;

  -- 4. Record the transaction
  INSERT INTO public.credit_transactions
    (workspace_id, transaction_type, amount, balance_after, description)
  VALUES
    (p_workspace_id, 'subscription_grant', p_credits, v_new_balance,
     'Plan upgraded to ' || p_plan::text || ' — monthly credits granted');

  RETURN v_new_balance;
END;
$$;
