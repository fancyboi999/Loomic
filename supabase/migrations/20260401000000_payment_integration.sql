-- ============================================================
-- Payment Integration (Lemon Squeezy)
-- ============================================================

-- Extend subscriptions table with Lemon Squeezy fields
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS lemon_squeezy_subscription_id text,
  ADD COLUMN IF NOT EXISTS lemon_squeezy_customer_id text,
  ADD COLUMN IF NOT EXISTS lemon_squeezy_variant_id text,
  ADD COLUMN IF NOT EXISTS lemon_squeezy_order_id text;

CREATE INDEX IF NOT EXISTS idx_subscriptions_ls_subscription
  ON public.subscriptions(lemon_squeezy_subscription_id)
  WHERE lemon_squeezy_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_ls_customer
  ON public.subscriptions(lemon_squeezy_customer_id)
  WHERE lemon_squeezy_customer_id IS NOT NULL;

-- Payment events audit trail (webhook log)
CREATE TABLE public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  lemon_squeezy_event_id text,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  processed boolean NOT NULL DEFAULT false,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_events_workspace
  ON public.payment_events(workspace_id, created_at DESC);
CREATE INDEX idx_payment_events_ls_event
  ON public.payment_events(lemon_squeezy_event_id)
  WHERE lemon_squeezy_event_id IS NOT NULL;

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own workspace payment events"
  ON public.payment_events FOR SELECT
  USING (
    workspace_id IN (
      SELECT wm.workspace_id FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid()
    )
  );
