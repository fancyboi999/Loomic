-- Home example library for the workspace home page.
-- Stores category chips, case cards, prompt text, and preview image URLs.

create table public.home_example_categories (
  key text primary key,
  label text not null,
  data_type text not null,
  accent text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint home_example_categories_accent_check
    check (accent is null or accent in ('special'))
);

create table public.home_example_examples (
  id uuid primary key default gen_random_uuid(),
  category_key text not null references public.home_example_categories(key) on delete cascade,
  title text not null,
  prompt text not null,
  image_urls text[] not null default '{}'::text[],
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index home_example_categories_sort_order_key
  on public.home_example_categories(sort_order);

create unique index home_example_examples_category_sort_order_key
  on public.home_example_examples(category_key, sort_order);

create index home_example_examples_active_category_idx
  on public.home_example_examples(category_key, is_active, sort_order);

create trigger home_example_categories_updated_at
  before update on public.home_example_categories
  for each row execute function public.set_updated_at();

create trigger home_example_examples_updated_at
  before update on public.home_example_examples
  for each row execute function public.set_updated_at();

alter table public.home_example_categories enable row level security;
alter table public.home_example_examples enable row level security;

create policy home_example_categories_select_authenticated
  on public.home_example_categories
  for select
  to authenticated
  using (is_active = true);

create policy home_example_examples_select_authenticated
  on public.home_example_examples
  for select
  to authenticated
  using (
    is_active = true
    and exists (
      select 1
      from public.home_example_categories
      where key = category_key
        and is_active = true
    )
  );

insert into public.home_example_categories (key, label, data_type, accent, sort_order)
values
  ('nano-banana-pro', 'Nano Banana Pro', 'Special', 'special', 0),
  ('design', 'Design', 'Poster', null, 1),
  ('branding', 'Branding', 'Branding', null, 2),
  ('illustration', 'Illustration', 'Illustration', null, 3),
  ('e-commerce', 'E-Commerce', 'Character', null, 4),
  ('video', 'Video', 'Video', null, 5);

insert into public.home_example_examples (
  category_key,
  title,
  prompt,
  image_urls,
  sort_order
)
values
  (
    'design',
    $t$Design a Bauhaus-inspired poster.$t$,
    $p$Nano Banana Make a poster for a music festival in the Bauhaus style. Use a limited color palette of pink, red, and cream. Abstract geometric shapes representing sound waves. Minimalist vertical text.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/design/e1-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/design/e1-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/design/e1-3.webp'
    ]::text[],
    0
  ),
  (
    'design',
    $t$Design a ceramic dinnerware set.$t$,
    $p$Generate a set of 5 images, each a ceramic tableware piece: 1 small bowl, 1 large bowl, 1 small plate, 1 large plate, 1 mug. They belong to the same set, harmoniously blends Scandinavian minimalism and Japanese wabi-sabi aesthetics - soft neutral tones, organic textures, imperfect hand-thrown forms, subtle glaze variations, natural lighting. Each piece is photographed against a seamless white background; even studio production photography lighting.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/design/e2-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/design/e2-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/design/e2-3.webp'
    ]::text[],
    1
  ),
  (
    'design',
    $t$Design new pieces for a jewelry collection.$t$,
    $p$Necklace Nano Banana Generate product photos against a white background, 1 for earrings, 1 for a ring, belonging to the same set as the necklace. Make sure the design across the set is consistent. Maintain a cohesive visual tone suitable for a luxury brand website homepage - minimal, elegant, and timeless.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/design/e3-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/design/e3-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/design/e3-3.webp'
    ]::text[],
    2
  ),
  (
    'design',
    $t$Generate packaging design variations.$t$,
    $p$Cocoa Puffs Nano Banana Change the product packaging to cucumber flavor.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/design/e4-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/design/e4-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/design/e4-3.webp'
    ]::text[],
    3
  ),
  (
    'design',
    $t$Experiment with furniture design.$t$,
    $p$Midjourney A velvet, bright orange sculptural tubular chair.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/design/e5-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/design/e5-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/design/e5-3.webp'
    ]::text[],
    4
  ),
  (
    'design',
    $t$Brainstorm beautiful interiors.$t$,
    $p$Interior Gemini Imagen 4 Generate 5 different interiors - different furniture pieces, colors, space - in the same style and mood.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/design/e6-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/design/e6-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/design/e6-3.webp'
    ]::text[],
    5
  ),
  (
    'branding',
    $t$Generate logo options.$t$,
    $p$Gemini Imagen 4 Minimalist vector cartoon logo for a sushi shop. Use simple, bold, rounded lines. Very clean, modern, and well designed.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/branding/e1-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/branding/e1-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/branding/e1-3.webp'
    ]::text[],
    0
  ),
  (
    'branding',
    $t$Design branded merch for your coffee shop.$t$,
    $p$Logo Nano Banana A minimalist product photo of a trendy high-quality ceramic espresso cup and saucer standing on a light wood surface against a clean white wall, with this logo printed in black on the cup. The scene is cinematic and editorial, illuminated by dramatic, warm afternoon light from the side, casting high contrast shadow. The composition is clean and organic. Sharp focus on the cup, warm color palette.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/branding/e2-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/branding/e2-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/branding/e2-3.webp'
    ]::text[],
    1
  ),
  (
    'branding',
    $t$Put your logo on a cap.$t$,
    $p$Logo Nano Banana Generate a studio product shot of a light blue cap featuring this logo embroidered on the front. The cap should appear realistic, well-lit, and minimal, placed on a neutral background. The embroidery should be in black thread, flat and subtle.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/branding/e3-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/branding/e3-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/branding/e3-3.webp'
    ]::text[],
    2
  ),
  (
    'branding',
    $t$Generate outdoor mockups for your design.$t$,
    $p$Use Nano Banana to make Board the sidewalk board display Image this exact ice cream image.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/branding/e4-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/branding/e4-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/branding/e4-3.webp'
    ]::text[],
    3
  ),
  (
    'branding',
    $t$Emotional storytelling for your brand.$t$,
    $p$Reference Nano Banana Generate the following images in the same mood and style for the same editorial series: closeup shot of a well-groomed hand fixing an earring; ultra closeup shot of a woman's foot in a stiletto stepping out of a car; closeup shot of the architectural detail of a curved luxuriant staircase; ultra close-up photo of an unmade bed; closeup shot of a delicate dessert in a fine dining restaurant.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/branding/e5-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/branding/e5-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/branding/e5-3.webp'
    ]::text[],
    4
  ),
  (
    'branding',
    $t$Make a stunning holiday campaign for your brand.$t$,
    $p$Nano Banana A flat-lay (overhead) product photograph featuring Earrings this piece of jewelry. The jewelry is nestled within a bed of pristine white snow, sinking in deep and snugly. The snow shouldn't just be a flat base; it should rise up and partially bury the banana. The snow has a texture with small fine coarse ice crystals, creating a three-dimensional, coarse, powered sugar-like surface. The lighting is bright and direct, emphasizing the stark white of the snow and creating subtle micro-shadows that highlight its intricate, uneven texture.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/branding/e6-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/branding/e6-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/branding/e6-3.webp'
    ]::text[],
    5
  ),
  (
    'illustration',
    $t$From sketch to endless illustration styles.$t$,
    $p$Cat Nano Banana Turn this sketch into a 2D illustration, try 5 different styles.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/illustration/e1-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/illustration/e1-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/illustration/e1-3.webp'
    ]::text[],
    0
  ),
  (
    'illustration',
    $t$Turn your photo into an ink drawing.$t$,
    $p$Image Nano Banana Turn this photo into a detailed ink drawing with fine lines and blue ink tones, drawn on a light grey dot grid notebook page. Maintain aspect ratio.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/illustration/e2-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/illustration/e2-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/illustration/e2-3.webp'
    ]::text[],
    1
  ),
  (
    'illustration',
    $t$Make surrealist art.$t$,
    $p$Spoon Umbrella Coca-Cola Egg Cherry Hat Box Stool Bunny Use these objects to generate a surrealist painting; use them however you like and however many times you like.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/illustration/e3-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/illustration/e3-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/illustration/e3-3.webp'
    ]::text[],
    2
  ),
  (
    'illustration',
    $t$Generate seamless patterns for your project.$t$,
    $p$Generate 3 seamless ditsy floral patterns.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/illustration/e4-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/illustration/e4-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/illustration/e4-3.webp'
    ]::text[],
    3
  ),
  (
    'illustration',
    $t$Illustrate a photo in your signature style.$t$,
    $p$Use Nano Banana to generate a bold, colourful 2D indie illustration of this object Avocado against a playful tablecloth pattern in the same style as Reference this drawing.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/illustration/e5-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/illustration/e5-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/illustration/e5-3.webp'
    ]::text[],
    4
  ),
  (
    'illustration',
    $t$Expand your illustration.$t$,
    $p$Nano Banana Expand this illustration Image and make the aspect ratio 16:9.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/illustration/e6-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/illustration/e6-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/illustration/e6-3.webp'
    ]::text[],
    5
  ),
  (
    'e-commerce',
    $t$Show your clothing on a model.$t$,
    $p$Model Sweater Nano Banana Change her top to this sweater.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/e-commerce/e1-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/e-commerce/e1-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/e-commerce/e1-3.webp'
    ]::text[],
    0
  ),
  (
    'e-commerce',
    $t$Generate new angles for your clothing.$t$,
    $p$Front View Nano Banana Show me a back view and a side view of the model, maintain photography style.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/e-commerce/e2-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/e-commerce/e2-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/e-commerce/e2-3.webp'
    ]::text[],
    1
  ),
  (
    'e-commerce',
    $t$Turn quick snapshots into polished product photos.$t$,
    $p$Necklace Seedream 4 Generate a series of five luxury haute jewelry fashion editorial photographs for a website showcasing this necklace.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/e-commerce/e3-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/e-commerce/e3-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/e-commerce/e3-3.webp'
    ]::text[],
    2
  ),
  (
    'e-commerce',
    $t$Style your product for social media.$t$,
    $p$Ceramic Nano Banana Generate 5 minimal, creative stylised lifestyle images for this ceramic dish, all in 4:5 aspect ratio.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/e-commerce/e4-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/e-commerce/e4-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/e-commerce/e4-3.webp'
    ]::text[],
    3
  ),
  (
    'e-commerce',
    $t$Show your product in a lifestyle scene.$t$,
    $p$Sofa Nano Banana Showcase this sofa in a clean, well decorated, cozy, modern, scandinavian interior with soft daylight and neutral material palette.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/e-commerce/e5-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/e-commerce/e5-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/e-commerce/e5-3.webp'
    ]::text[],
    4
  ),
  (
    'e-commerce',
    $t$Generate ad graphics for your product.$t$,
    $p$Logo Perfume Nano Banana A clean, minimalist, and modern ad poster for this perfume product. The bottle is centered in the lower half of the image. The background is a smooth vertical gradient that transitions from a light yellow at the bottom to a pastel bright butter yellow at the top. The poster includes the logo in white, and minimalist, small white sans serif text at the top: '20% Off Our Signature Scent'$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/e-commerce/e6-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/e-commerce/e6-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/e-commerce/e6-3.webp'
    ]::text[],
    5
  ),
  (
    'video',
    $t$Turn product photos into 360° videos.$t$,
    $p$Kling 2.5 Turbo Use this Ring as the start and end frame, generate a video of the ring rotating in slow motion.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/design/e3-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/design/e3-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/design/e3-3.webp'
    ]::text[],
    0
  ),
  (
    'video',
    $t$Turn static ads into scroll-stopping animations.$t$,
    $p$Poster Kling 2.5 Turbo Animate the perfume product while keeping the background completely still.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/e-commerce/e6-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/e-commerce/e6-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/e-commerce/e6-3.webp'
    ]::text[],
    1
  ),
  (
    'video',
    $t$Have your model walk.$t$,
    $p$Model Kling 2.5 Turbo Have the model walk, the camera follows her.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/video/e3-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/video/e3-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/video/e3-3.webp'
    ]::text[],
    2
  ),
  (
    'video',
    $t$Generate shortform videos with Sora, sound on.$t$,
    $p$Perfume Sora 2 Pro A vertical short-form ad for this exact product emphasising lifestyle and mood, with a grainy Kodak film quality. Montage of minimalist furniture details, flowers, butter and toast breakfast spread, sunlight through curtains, person spraying perfume into air. Soft lo-fi soundtrack, muted warm tones, seamless edit.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/video/e4-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/video/e4-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/video/e4-3.webp'
    ]::text[],
    3
  ),
  (
    'video',
    $t$Generate professional animation with Veo, sound on.$t$,
    $p$Veo 3.1 Generate an 8-second animation using these two exact characters Princess Elara Forest Sprite in this exact Forest Clearing forest scene. A young princess twirls gracefully in the clearing as she meets a playful forest sprite named Finn. Together they discover a glowing magical flower, and swirling sparkles of light rise around them in wonder. The animation style should match a 1930s Disney cel fairy-tale film — expressive, rounded motion, warm painterly lighting, fluid hand-drawn animation feel, and soft orchestral background atmosphere. The voice and movement should evoke the tone of a classic Disney princess animation: gentle, melodic, full of warmth and wonder.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/video/e5-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/video/e5-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/video/e5-3.webp'
    ]::text[],
    4
  ),
  (
    'video',
    $t$Generate cinematic footage.$t$,
    $p$Generate a video. — AR 16:9 Low-angle shot of a sports car drifting through desert sand, dust plumes catching golden light. The camera tracks laterally with a long lens, heat haze shimmering in the distance. Fast-paced, grounded, kinetic.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/video/e6-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/video/e6-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/video/e6-3.webp'
    ]::text[],
    5
  );
