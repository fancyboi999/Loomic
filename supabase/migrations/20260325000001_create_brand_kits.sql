-- Brand Kit feature: tables, enum, triggers, indexes, RLS
-- Depends on: foundation migration (set_updated_at function)

-- Asset type enum
CREATE TYPE public.brand_kit_asset_type AS ENUM ('color', 'font', 'logo', 'image');

-- brand_kits: Kit main table
CREATE TABLE public.brand_kits (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL DEFAULT '未命名',
  is_default    BOOLEAN NOT NULL DEFAULT false,
  guidance_text TEXT,
  cover_url     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- brand_kit_assets: unified asset table
CREATE TABLE public.brand_kit_assets (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  kit_id        UUID NOT NULL REFERENCES public.brand_kits(id) ON DELETE CASCADE,
  asset_type    public.brand_kit_asset_type NOT NULL,
  display_name  TEXT NOT NULL DEFAULT '',
  role          TEXT,
  sort_order    INT NOT NULL DEFAULT 0,
  text_content  TEXT,
  file_url      TEXT,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- projects FK to brand_kits
ALTER TABLE public.projects ADD COLUMN brand_kit_id UUID REFERENCES public.brand_kits(id) ON DELETE SET NULL;

-- updated_at triggers (reuse existing set_updated_at from foundation migration)
CREATE TRIGGER brand_kits_updated_at
  BEFORE UPDATE ON public.brand_kits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER brand_kit_assets_updated_at
  BEFORE UPDATE ON public.brand_kit_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Indexes
CREATE INDEX idx_brand_kits_user ON public.brand_kits(user_id);
CREATE INDEX idx_brand_kit_assets_kit ON public.brand_kit_assets(kit_id);
CREATE INDEX idx_brand_kit_assets_type ON public.brand_kit_assets(kit_id, asset_type);

-- Unique partial index: at most one default kit per user
CREATE UNIQUE INDEX idx_brand_kits_default
  ON public.brand_kits(user_id) WHERE is_default = true;

-- RLS
ALTER TABLE public.brand_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_kit_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY brand_kits_user_policy ON public.brand_kits
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY brand_kit_assets_policy ON public.brand_kit_assets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.brand_kits WHERE id = kit_id AND user_id = auth.uid())
  );
