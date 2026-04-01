-- Allow p_job_id to be NULL in deduct_credits (direct generation has no job)
CREATE OR REPLACE FUNCTION public.deduct_credits(
  p_workspace_id uuid,
  p_user_id uuid,
  p_amount integer,
  p_job_id uuid DEFAULT NULL,
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
