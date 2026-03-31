-- Home discovery library for the workspace home page.
-- Stores the lower "灵感发现" categories and curated case cards.

create table public.home_discovery_categories (
  key text primary key,
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.home_discovery_cases (
  id text primary key,
  category_key text not null references public.home_discovery_categories(key) on delete cascade,
  title text not null,
  cover_image_url text not null,
  author_name text not null,
  author_avatar_url text not null,
  view_count integer not null default 0 check (view_count >= 0),
  like_count integer not null default 0 check (like_count >= 0),
  case_url text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index home_discovery_categories_sort_order_key
  on public.home_discovery_categories(sort_order);

create unique index home_discovery_cases_category_sort_order_key
  on public.home_discovery_cases(category_key, sort_order);

create index home_discovery_cases_active_category_idx
  on public.home_discovery_cases(category_key, is_active, sort_order);

create trigger home_discovery_categories_updated_at
  before update on public.home_discovery_categories
  for each row execute function public.set_updated_at();

create trigger home_discovery_cases_updated_at
  before update on public.home_discovery_cases
  for each row execute function public.set_updated_at();

alter table public.home_discovery_categories enable row level security;
alter table public.home_discovery_cases enable row level security;

create policy home_discovery_categories_select_authenticated
  on public.home_discovery_categories
  for select
  to authenticated
  using (is_active = true);

create policy home_discovery_cases_select_authenticated
  on public.home_discovery_cases
  for select
  to authenticated
  using (
    is_active = true
    and exists (
      select 1
      from public.home_discovery_categories
      where key = category_key
        and is_active = true
    )
  );

insert into public.home_discovery_categories (key, label, sort_order)
values
  ('branding-design', '品牌设计', 0),
  ('poster-and-ads', '海报与广告', 1),
  ('illustration', '插画', 2),
  ('ui-design', 'UI设计', 3),
  ('character-design', '角色设计', 4),
  ('storyboard-video', '影片与分镜', 5),
  ('product-design', '产品设计', 6),
  ('architecture-design', '建筑设计', 7);

insert into public.home_discovery_cases (
  id,
  category_key,
  title,
  cover_image_url,
  author_name,
  author_avatar_url,
  view_count,
  like_count,
  case_url,
  sort_order
)
values
  (
    'ji5ey5l',
    'branding-design',
    'The ART & Cultural Arts Center',
    'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/branding-design/cover.webp',
    'Studio Arken',
    'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/avatars/branding-design.svg',
    549,
    7,
    '',
    0
  ),
  (
    'n9d21de',
    'poster-and-ads',
    'Vintage Car Poster',
    'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/poster-and-ads/cover.webp',
    'Retro Workshop',
    'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/avatars/poster-and-ads.svg',
    359919,
    286,
    '',
    0
  ),
  (
    'bjde0nh',
    'illustration',
    'Cat Tarot Cards',
    'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/illustration/cover.webp',
    'Mochi Art',
    'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/avatars/illustration.svg',
    2054,
    116,
    '',
    0
  ),
  (
    'tl8zzk0',
    'ui-design',
    'Fallout-themed cake shop website.',
    'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/ui-design/cover.webp',
    'Pixel Forge',
    'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/avatars/ui-design.svg',
    4338,
    192,
    '',
    0
  ),
  (
    'fbn3mss',
    'character-design',
    'My Creepy Clown Avatar in Abandoned Circus Park',
    'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/character-design/cover.webp',
    'Dark Carnival',
    'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/avatars/character-design.svg',
    749,
    12,
    '',
    0
  ),
  (
    'ikqo02k',
    'storyboard-video',
    'Mixtapes Emotions !',
    'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/storyboard-video/cover.webp',
    'Frame Studio',
    'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/avatars/storyboard-video.svg',
    3057,
    49,
    '',
    0
  ),
  (
    'a4ncmvb',
    'product-design',
    'Product Visualization - Robot Hand ',
    'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/product-design/cover.webp',
    'Future Lab',
    'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/avatars/product-design.svg',
    769,
    27,
    '',
    0
  ),
  (
    'ng716s0',
    'architecture-design',
    'Building a new website and learning how to AI',
    'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/architecture-design/cover.webp',
    'Arc Design',
    'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/avatars/architecture-design.svg',
    1453,
    24,
    '',
    0
  );
