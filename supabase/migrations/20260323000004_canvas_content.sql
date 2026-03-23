-- Add content column to canvases for Excalidraw state persistence
ALTER TABLE public.canvases
  ADD COLUMN IF NOT EXISTS content jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.canvases.content IS
  'Excalidraw canvas state: { elements: [], appState: {} }';
