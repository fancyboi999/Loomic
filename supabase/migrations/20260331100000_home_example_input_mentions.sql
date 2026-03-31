-- Add input_mentions column to home_example_examples.
-- Stores the @mention capsules (input images + tool references) separately
-- from the preview images shown on cards.

alter table public.home_example_examples
  add column input_mentions jsonb not null default '[]'::jsonb;

comment on column public.home_example_examples.input_mentions is
  'JSON array of {type, name, imgSrc} objects representing @mention capsules in the prompt input';

-- Update existing rows with correct prompt text and input_mentions.
-- Also insert the 6 missing Nano Banana Pro examples.

-- Fix Design examples
update public.home_example_examples
  set prompt = $p$Make a poster for a music festival in the Bauhaus style. Use a limited color palette of pink, red, and cream. Abstract geometric shapes representing sound waves. Minimalist vertical text.$p$,
      input_mentions = '[{"type":"tool","name":"Nano Banana","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/imagen-3.svg"}]'::jsonb
  where title = 'Design a Bauhaus-inspired poster.';

update public.home_example_examples
  set prompt = $p$Generate a set of 5 images, each a ceramic tableware piece: 1 small bowl, 1 large bowl, 1 small plate, 1 large plate, 1 mug. They belong to the same set, harmoniously blends Scandinavian minimalism and Japanese wabi-sabi aesthetics - soft neutral tones, organic textures, imperfect hand-thrown forms, subtle glaze variations, natural lighting. Each piece is photographed against a seamless white background; even studio production photography lighting.$p$,
      input_mentions = '[]'::jsonb
  where title = 'Design a ceramic dinnerware set.';

update public.home_example_examples
  set prompt = $p$Generate product photos against a white background, 1 for earrings, 1 for a ring, belonging to the same set as the necklace. Make sure the design across the set is consistent. Maintain a cohesive visual tone suitable for a luxury brand website homepage - minimal, elegant, and timeless.$p$,
      input_mentions = '[{"type":"image","name":"Necklace","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/design/e3-input-1.webp"},{"type":"tool","name":"Nano Banana","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/imagen-3.svg"}]'::jsonb
  where title = 'Design new pieces for a jewelry collection.';

update public.home_example_examples
  set prompt = $p$Change the product packaging to cucumber flavor.$p$,
      input_mentions = '[{"type":"image","name":"Cocoa Puffs","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/design/e4-input-1.webp"},{"type":"tool","name":"Nano Banana","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/imagen-3.svg"}]'::jsonb
  where title = 'Generate packaging design variations.';

update public.home_example_examples
  set prompt = $p$A velvet, bright orange sculptural tubular chair.$p$,
      input_mentions = '[{"type":"tool","name":"Midjourney","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/midjourney.svg"}]'::jsonb
  where title = 'Experiment with furniture design.';

update public.home_example_examples
  set prompt = $p$Generate 5 different interiors - different furniture pieces, colors, space - in the same style and mood.$p$,
      input_mentions = '[{"type":"image","name":"Interior","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/design/e6-input-1.webp"},{"type":"tool","name":"Gemini Imagen 4","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/imagen-3.svg"}]'::jsonb
  where title = 'Brainstorm beautiful interiors.';

-- Fix Branding examples
update public.home_example_examples
  set prompt = $p$Minimalist vector cartoon logo for a sushi shop. Use simple, bold, rounded lines. Very clean, modern, and well designed.$p$,
      input_mentions = '[{"type":"tool","name":"Gemini Imagen 4","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/imagen-3.svg"}]'::jsonb
  where title = 'Generate logo options.';

update public.home_example_examples
  set prompt = $p$A minimalist product photo of a trendy high-quality ceramic espresso cup and saucer standing on a light wood surface against a clean white wall, with this logo printed in black on the cup. The scene is cinematic and editorial, illuminated by dramatic, warm afternoon light from the side, casting high contrast shadow. The composition is clean and organic. Sharp focus on the cup, warm color palette.$p$,
      input_mentions = '[{"type":"image","name":"Logo","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/common/loomic-logo.png"},{"type":"tool","name":"Nano Banana","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/imagen-3.svg"}]'::jsonb
  where title = 'Design branded merch for your coffee shop.';

update public.home_example_examples
  set prompt = $p$Generate a studio product shot of a light blue cap featuring this logo embroidered on the front. The cap should appear realistic, well-lit, and minimal, placed on a neutral background. The embroidery should be in black thread, flat and subtle.$p$,
      input_mentions = '[{"type":"image","name":"Logo","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/common/loomic-logo.png"},{"type":"tool","name":"Nano Banana","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/imagen-3.svg"}]'::jsonb
  where title = 'Put your logo on a cap.';

update public.home_example_examples
  set prompt = $p$Use  to make  the sidewalk board display  this exact ice cream image.$p$,
      input_mentions = '[{"type":"tool","name":"Nano Banana","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/imagen-3.svg"},{"type":"image","name":"Board","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/branding/e4-input-1.webp"},{"type":"image","name":"Image","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/branding/e4-input-2.webp"}]'::jsonb
  where title = 'Generate outdoor mockups for your design.';

update public.home_example_examples
  set prompt = $p$Generate the following images in the same mood and style for the same editorial series: closeup shot of a well-groomed hand fixing an earring; ultra closeup shot of a woman's foot in a stiletto stepping out of a car; closeup shot of the architectural detail of a curved luxuriant staircase; ultra close-up photo of an unmade bed; closeup shot of a delicate dessert in a fine dining restaurant.$p$,
      input_mentions = '[{"type":"image","name":"Reference","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/branding/e5-input-1.webp"},{"type":"tool","name":"Nano Banana","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/imagen-3.svg"}]'::jsonb
  where title = 'Emotional storytelling for your brand.';

update public.home_example_examples
  set prompt = $p$A flat-lay (overhead) product photograph featuring  this piece of jewelry. The jewelry is nestled within a bed of pristine white snow, sinking in deep and snugly. The snow shouldn''t just be a flat base; it should rise up and partially bury the banana. The snow has a texture with small fine coarse ice crystals, creating a three-dimensional, coarse, powered sugar-like surface. The lighting is bright and direct, emphasizing the stark white of the snow and creating subtle micro-shadows that highlight its intricate, uneven texture.$p$,
      input_mentions = '[{"type":"tool","name":"Nano Banana","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/imagen-3.svg"},{"type":"image","name":"Earrings","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/branding/e6-input-1.webp"}]'::jsonb
  where title = 'Make a stunning holiday campaign for your brand.';

-- Fix Illustration examples
update public.home_example_examples
  set prompt = $p$Turn this sketch into a 2D illustration, try 5 different styles.$p$,
      input_mentions = '[{"type":"image","name":"Cat","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/illustration/e1-input-1.webp"},{"type":"tool","name":"Nano Banana","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/imagen-3.svg"}]'::jsonb
  where title = 'From sketch to endless illustration styles.';

update public.home_example_examples
  set prompt = $p$Turn this photo into a detailed ink drawing with fine lines and blue ink tones, drawn on a light grey dot grid notebook page. Maintain aspect ratio.$p$,
      input_mentions = '[{"type":"image","name":"Image","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/illustration/e2-input-1.webp"},{"type":"tool","name":"Nano Banana","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/imagen-3.svg"}]'::jsonb
  where title = 'Turn your photo into an ink drawing.';

update public.home_example_examples
  set prompt = $p$Use these objects to generate a surrealist painting; use them however you like and however many times you like.$p$,
      input_mentions = '[{"type":"image","name":"Spoon","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/illustration/e3-input-1.webp"},{"type":"image","name":"Umbrella","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/illustration/e3-input-2.webp"},{"type":"image","name":"Coca-Cola","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/illustration/e3-input-3.webp"},{"type":"image","name":"Egg","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/illustration/e3-input-4.webp"},{"type":"image","name":"Cherry","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/illustration/e3-input-5.webp"},{"type":"image","name":"Hat","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/illustration/e3-input-6.webp"},{"type":"image","name":"Box","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/illustration/e3-input-7.webp"},{"type":"image","name":"Stool","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/illustration/e3-input-8.webp"},{"type":"image","name":"Bunny","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/illustration/e3-input-9.webp"}]'::jsonb
  where title = 'Make surrealist art.';

update public.home_example_examples
  set prompt = $p$Generate 3 seamless ditsy floral patterns.$p$,
      input_mentions = '[]'::jsonb
  where title = 'Generate seamless patterns for your project.';

update public.home_example_examples
  set prompt = $p$Use  to generate a bold, colourful 2D indie illustration of this object  against a playful tablecloth pattern in the same style as  this drawing.$p$,
      input_mentions = '[{"type":"tool","name":"Nano Banana","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/imagen-3.svg"},{"type":"image","name":"Avocado","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/illustration/e5-input-1.webp"},{"type":"image","name":"Reference","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/illustration/e5-input-2.webp"}]'::jsonb
  where title = 'Illustrate a photo in your signature style.';

update public.home_example_examples
  set prompt = $p$Expand this illustration  and make the aspect ratio 16:9.$p$,
      input_mentions = '[{"type":"tool","name":"Nano Banana","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/imagen-3.svg"},{"type":"image","name":"Image","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/illustration/e6-input-1.webp"}]'::jsonb
  where title = 'Expand your illustration.';

-- Fix E-Commerce examples
update public.home_example_examples
  set prompt = $p$Change her top to this sweater.$p$,
      input_mentions = '[{"type":"image","name":"Model","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/e-commerce/e1-input-1.webp"},{"type":"image","name":"Sweater","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/e-commerce/e1-input-2.webp"},{"type":"tool","name":"Nano Banana","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/imagen-3.svg"}]'::jsonb
  where title = 'Show your clothing on a model.';

update public.home_example_examples
  set prompt = $p$Show me a back view and a side view of the model, maintain photography style.$p$,
      input_mentions = '[{"type":"image","name":"Front View","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/e-commerce/e2-input-1.webp"},{"type":"tool","name":"Nano Banana","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/imagen-3.svg"}]'::jsonb
  where title = 'Generate new angles for your clothing.';

update public.home_example_examples
  set prompt = $p$Generate a series of five luxury haute jewelry fashion editorial photographs for a website showcasing this necklace.$p$,
      input_mentions = '[{"type":"image","name":"Necklace","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/design/e3-input-1.webp"},{"type":"tool","name":"Seedream 4","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/seedream_3.svg"}]'::jsonb
  where title = 'Turn quick snapshots into polished product photos.';

update public.home_example_examples
  set prompt = $p$Generate 5 minimal, creative stylised lifestyle images for this ceramic dish, all in 4:5 aspect ratio.$p$,
      input_mentions = '[{"type":"image","name":"Ceramic","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/e-commerce/e4-input-1.webp"},{"type":"tool","name":"Nano Banana","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/imagen-3.svg"}]'::jsonb
  where title = 'Style your product for social media.';

update public.home_example_examples
  set prompt = $p$Showcase this sofa in a clean, well decorated, cozy, modern, scandinavian interior with soft daylight and neutral material palette.$p$,
      input_mentions = '[{"type":"image","name":"Sofa","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/e-commerce/e5-input-1.webp"},{"type":"tool","name":"Nano Banana","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/imagen-3.svg"}]'::jsonb
  where title = 'Show your product in a lifestyle scene.';

update public.home_example_examples
  set prompt = $p$A clean, minimalist, and modern ad poster for this perfume product. The bottle is centered in the lower half of the image. The background is a smooth vertical gradient that transitions from a light yellow at the bottom to a pastel bright butter yellow at the top. The poster includes the logo in white, and minimalist, small white sans serif text at the top: '20% Off Our Signature Scent'$p$,
      input_mentions = '[{"type":"image","name":"Logo","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/common/loomic-logo.png"},{"type":"image","name":"Perfume","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/e-commerce/e6-input-2.webp"},{"type":"tool","name":"Nano Banana","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/imagen-3.svg"}]'::jsonb
  where title = 'Generate ad graphics for your product.';

-- Fix Video examples
update public.home_example_examples
  set prompt = $p$Use this  as the start and end frame, generate a video of the ring rotating in slow motion.$p$,
      input_mentions = '[{"type":"tool","name":"Kling 2.5 Turbo","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/kling.svg"},{"type":"image","name":"Ring","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/video/e1-input-1.webp"}]'::jsonb
  where title = 'Turn product photos into 360° videos.';

update public.home_example_examples
  set prompt = $p$Animate the perfume product while keeping the background completely still.$p$,
      input_mentions = '[{"type":"image","name":"Poster","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/video/e2-input-1.webp"},{"type":"tool","name":"Kling 2.5 Turbo","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/kling.svg"}]'::jsonb
  where title = 'Turn static ads into scroll-stopping animations.';

update public.home_example_examples
  set prompt = $p$Have the model walk, the camera follows her.$p$,
      input_mentions = '[{"type":"image","name":"Model","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/video/e3-input-1.webp"},{"type":"tool","name":"Kling 2.5 Turbo","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/kling.svg"}]'::jsonb
  where title = 'Have your model walk.';

update public.home_example_examples
  set prompt = $p$A vertical short-form ad for this exact product emphasising lifestyle and mood, with a grainy Kodak film quality. Montage of minimalist furniture details, flowers, butter and toast breakfast spread, sunlight through curtains, person spraying perfume into air. Soft lo-fi soundtrack, muted warm tones, seamless edit.$p$,
      input_mentions = '[{"type":"image","name":"Perfume","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/e-commerce/e6-input-2.webp"},{"type":"tool","name":"Sora 2 Pro","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/sora.svg"}]'::jsonb
  where title = 'Generate shortform videos with Sora, sound on.';

update public.home_example_examples
  set prompt = $p$Generate an 8-second animation using these two exact characters   in this exact  forest scene. A young princess twirls gracefully in the clearing as she meets a playful forest sprite named Finn. Together they discover a glowing magical flower, and swirling sparkles of light rise around them in wonder. The animation style should match a 1930s Disney cel fairy-tale film — expressive, rounded motion, warm painterly lighting, fluid hand-drawn animation feel, and soft orchestral background atmosphere. The voice and movement should evoke the tone of a classic Disney princess animation: gentle, melodic, full of warmth and wonder.$p$,
      input_mentions = '[{"type":"tool","name":"Veo 3.1","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/imagen-3.svg"},{"type":"image","name":"Princess Elara","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/video/e5-input-1.webp"},{"type":"image","name":"Forest Sprite","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/video/e5-input-2.webp"},{"type":"image","name":"Forest Clearing","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/video/e5-input-3.webp"}]'::jsonb
  where title = 'Generate professional animation with Veo, sound on.';

update public.home_example_examples
  set prompt = $p$Generate a video. — AR 16:9 Low-angle shot of a sports car drifting through desert sand, dust plumes catching golden light. The camera tracks laterally with a long lens, heat haze shimmering in the distance. Fast-paced, grounded, kinetic.$p$,
      input_mentions = '[]'::jsonb
  where title = 'Generate cinematic footage.';

-- Insert Nano Banana Pro examples (6 new)
insert into public.home_example_examples (category_key, title, prompt, image_urls, input_mentions, sort_order)
values
  (
    'nano-banana-pro',
    $t$Design pixel-perfect web interface.$t$,
    $p$Generate a landing page for a furniture shop called Loomic, Neo Brutalism style. These are the product images:$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/nano-banana-pro/e1-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/nano-banana-pro/e1-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/nano-banana-pro/e1-3.webp'
    ]::text[],
    '[{"type":"tool","name":"Nano Banana Pro","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/imagen-3.svg"},{"type":"image","name":"Chair","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/nano-banana-pro/e1-input-1.webp"},{"type":"image","name":"Nightstand","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/nano-banana-pro/e1-input-2.webp"},{"type":"image","name":"Beanbag","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/nano-banana-pro/e1-input-3.webp"},{"type":"image","name":"Table","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/nano-banana-pro/e1-input-4.webp"},{"type":"image","name":"Stool","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/nano-banana-pro/e1-input-5.webp"}]'::jsonb,
    0
  ),
  (
    'nano-banana-pro',
    $t$Solve a complex math problem on the white board.$t$,
    $p$Generate an image of an undergraduate level math problem and solution written on a white board.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/nano-banana-pro/e2-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/nano-banana-pro/e2-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/nano-banana-pro/e2-3.webp'
    ]::text[],
    '[{"type":"tool","name":"Nano Banana Pro","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/imagen-3.svg"}]'::jsonb,
    1
  ),
  (
    'nano-banana-pro',
    $t$Make a classic superhero comic strip.$t$,
    $p$A vintage 1970s comic book page depicting a multi-panel superhero story sequence. The art style is classic hand-drawn comic illustration with bold outlines and a vibrant but slightly faded color palette, including visible Ben-Day dots. The comic strip features Wonder Woman in her iconic costume, alongside two men in suits, set against the backdrop of New York City. The narrative shows Wonder Woman rescuing the men from their boring 9-to-5 office jobs. The page is laid out in a traditional comic panel grid, complete with speech bubbles, narration boxes, creating a nostalgic, adventurous, and quirky retro feel.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/nano-banana-pro/e3-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/nano-banana-pro/e3-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/nano-banana-pro/e3-3.webp'
    ]::text[],
    '[{"type":"tool","name":"Nano Banana Pro","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/imagen-3.svg"}]'::jsonb,
    2
  ),
  (
    'nano-banana-pro',
    $t$Make your own wizard newspaper.$t$,
    $p$A yellowed, vintage, high-resolution front page of the 'Daily Prophet' newspaper, precisely matching the iconic visual style of the Harry Potter films. Prominently feature 'THE DAILY PROPHET' in its distinctive, ornate, gothic-inspired font at the top. A large, bold, impactful headline using a classic, slightly distressed serif font: 'BUTTERBEER FESTIVAL! AMOROUS CHOCOLATE!' A central black-and-white photo of joyful wizards clinking mugs.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/nano-banana-pro/e4-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/nano-banana-pro/e4-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/nano-banana-pro/e4-3.webp'
    ]::text[],
    '[{"type":"tool","name":"Nano Banana Pro","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/imagen-3.svg"}]'::jsonb,
    3
  ),
  (
    'nano-banana-pro',
    $t$Generate professional engineering drawings.$t$,
    $p$A professional CAD drawing of  this object. Isometric view, white lines on professional high quality blue background; line weights and line types follow conventions; add dimension lines and annotations.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/nano-banana-pro/e5-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/nano-banana-pro/e5-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/nano-banana-pro/e5-3.webp'
    ]::text[],
    '[{"type":"tool","name":"Nano Banana Pro","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/imagen-3.svg"},{"type":"image","name":"Image","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/nano-banana-pro/e5-input-1.webp"}]'::jsonb,
    4
  ),
  (
    'nano-banana-pro',
    $t$Put your logo on everything.$t$,
    $p$A vibrant and playful photo of a well-groomed woman''s hand holding a banana-shaped bright yellow glossy popsicle by a classic popsicle stick, against a clear blue summer sky background. The subject is medium-sized in the composition, leaving plenty of empty space around. The hand has manicured nails painted in a matching yellow colour. The popsicle has this exact logo  debossed on it. A slightly low-angle, eye-level shot, looking up at the hand and the popsicle. The scene is illuminated by hard, direct, and high-contrast sunlight; strong, crisp, and well-defined shadows. It creates a graphic, bold, and energetic feel.$p$,
    array[
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/nano-banana-pro/e6-1.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/nano-banana-pro/e6-2.webp',
      'https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/examples/nano-banana-pro/e6-3.webp'
    ]::text[],
    '[{"type":"tool","name":"Nano Banana Pro","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/icons/imagen-3.svg"},{"type":"image","name":"Logo","imgSrc":"https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/inputs/common/loomic-logo.png"}]'::jsonb,
    5
  );
