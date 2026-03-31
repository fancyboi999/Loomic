export type HomeDiscoveryCase = {
  id: string;
  title: string;
  coverImageUrl: string;
  authorName: string;
  authorAvatarUrl: string;
  viewCount: number;
  likeCount: number;
  prompt: string;
  sourceUrl?: string;
};

export type HomeDiscoveryCategory = {
  key: string;
  label: string;
  cases: HomeDiscoveryCase[];
};

export type HomeDiscoverySelection = HomeDiscoveryCase & {
  categoryKey: string;
  categoryLabel: string;
};

function createCase(
  id: string,
  title: string,
  coverImageUrl: string,
  authorName: string,
  authorAvatarUrl: string,
  viewCount: number,
  likeCount: number,
  prompt: string,
  sourceUrl?: string,
): HomeDiscoveryCase {
  return {
    id,
    title,
    coverImageUrl,
    authorName,
    authorAvatarUrl,
    viewCount,
    likeCount,
    prompt,
    ...(sourceUrl ? { sourceUrl } : {}),
  };
}

function createCategory(
  key: string,
  label: string,
  cases: HomeDiscoveryCase[],
): HomeDiscoveryCategory {
  return { key, label, cases };
}

/**
 * Discovery seeds mirrored from Lovart's lower "灵感发现" section.
 * Each category intentionally starts with one case so the team can replace
 * content later from Supabase without touching the UI layer.
 */
export const homeDiscoverySeedCategories: HomeDiscoveryCategory[] = [
  createCategory("branding-design", "品牌设计", [
    createCase(
      "ji5ey5l",
      "The ART & Cultural Arts Center",
      "https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/branding-design/cover.webp",
      "Studio Arken",
      "https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/avatars/branding-design.svg",
      549,
      7,
      "请基于 ART & Cultural Arts Center 这个灵感方向，为我做一套文化艺术中心品牌探索。输出品牌关键词、主视觉方向、海报延展和社交媒体视觉提案，整体气质要现代、文化感强、适合艺术活动传播。",
    ),
  ]),
  createCategory("poster-and-ads", "海报与广告", [
    createCase(
      "n9d21de",
      "Vintage Car Poster",
      "https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/poster-and-ads/cover.webp",
      "Retro Workshop",
      "https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/avatars/poster-and-ads.svg",
      359919,
      286,
      "围绕 Vintage Car Poster 这个方向，帮我设计一组复古汽车主题海报。需要包含主海报、社交媒体方图版本和标题排版建议，整体风格偏复古、胶片感、适合活动宣传。",
    ),
  ]),
  createCategory("illustration", "插画", [
    createCase(
      "bjde0nh",
      "Cat Tarot Cards",
      "https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/illustration/cover.webp",
      "Mochi Art",
      "https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/avatars/illustration.svg",
      2054,
      116,
      "参考 Cat Tarot Cards 这个主题，帮我扩展一套猫咪塔罗风格插画系列。请给出角色设定、牌面视觉语言、配色建议和可延展的周边方向。",
    ),
  ]),
  createCategory("ui-design", "UI设计", [
    createCase(
      "tl8zzk0",
      "Fallout-themed cake shop website.",
      "https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/ui-design/cover.webp",
      "Pixel Forge",
      "https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/avatars/ui-design.svg",
      4338,
      192,
      "以 Fallout-themed cake shop website 为灵感，帮我设计一个末日废土风蛋糕店官网。输出首页信息架构、首屏视觉、商品卡片样式和核心配色建议。",
    ),
  ]),
  createCategory("character-design", "角色设计", [
    createCase(
      "fbn3mss",
      "My Creepy Clown Avatar in Abandoned Circus Park",
      "https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/character-design/cover.webp",
      "Dark Carnival",
      "https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/avatars/character-design.svg",
      749,
      12,
      "请围绕 My Creepy Clown Avatar in Abandoned Circus Park 这个概念，帮我做一套诡异马戏团角色设计。包含角色设定、表情变化、服装元素和场景氛围建议。",
    ),
  ]),
  createCategory("storyboard-video", "影片与分镜", [
    createCase(
      "ikqo02k",
      "Mixtapes Emotions !",
      "https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/storyboard-video/cover.webp",
      "Frame Studio",
      "https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/avatars/storyboard-video.svg",
      3057,
      49,
      "基于 Mixtapes Emotions 这个方向，帮我做一组音乐情绪短片分镜。需要拆出镜头节奏、情绪转场、标题卡和视觉风格建议，适合做 15 到 30 秒的短视频。",
    ),
  ]),
  createCategory("product-design", "产品设计", [
    createCase(
      "a4ncmvb",
      "Product Visualization - Robot Hand ",
      "https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/product-design/cover.webp",
      "Future Lab",
      "https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/avatars/product-design.svg",
      769,
      27,
      "围绕 Product Visualization - Robot Hand 这个概念，帮我设计一组未来感机械手产品视觉。请给出产品卖点表达、主视觉构图、材质方向和电商展示图思路。",
    ),
  ]),
  createCategory("architecture-design", "建筑设计", [
    createCase(
      "ng716s0",
      "Building a new website and learning how to AI",
      "https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/architecture-design/cover.webp",
      "Arc Design",
      "https://jmcrxgenontlkxktpihl.supabase.co/storage/v1/object/public/project-assets/home-seeds/discovery/avatars/architecture-design.svg",
      1453,
      24,
      "请以 Building a new website and learning how to AI 为起点，帮我设计一个面向建筑工作室的网站概念。输出网站结构、首页视觉、项目展示模块和整体建筑感风格建议。",
    ),
  ]),
];
