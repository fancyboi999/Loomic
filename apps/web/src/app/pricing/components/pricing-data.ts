// ---------------------------------------------------------------------------
// Loomic Pricing Data
// ---------------------------------------------------------------------------

export type BillingPeriod = "monthly" | "yearly";

export interface PricingTier {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number; // per month
  credits: number;
  creditLabel: string;
  badge?: string;
  highlighted?: boolean;
  features: string[];
  cta: string;
  ctaVariant: "default" | "accent" | "outline";
}

export interface FeatureCategory {
  name: string;
  features: FeatureRow[];
}

export interface FeatureRow {
  name: string;
  tiers: Record<string, string | boolean>;
}

export interface FAQItem {
  question: string;
  answer: string;
}

// ---------------------------------------------------------------------------
// Tiers
// ---------------------------------------------------------------------------

export const pricingTiers: PricingTier[] = [
  {
    id: "free",
    name: "Free",
    nameEn: "Free",
    description: "体验 AI 创作的魔力",
    monthlyPrice: 0,
    yearlyPrice: 0,
    credits: 1500,
    creditLabel: "50 积分/天",
    features: [
      "3 款基础图片模型",
      "最高 1K 分辨率",
      "3 个项目",
      "1 个品牌套件",
      "社区支持",
    ],
    cta: "免费开始",
    ctaVariant: "outline",
  },
  {
    id: "starter",
    name: "Starter",
    nameEn: "Starter",
    description: "个人创作者的起点",
    monthlyPrice: 12,
    yearlyPrice: 9,
    credits: 1200,
    creditLabel: "1,200 积分/月",
    features: [
      "全部图片模型",
      "2 款基础视频模型",
      "最高 1K 分辨率",
      "10 个项目",
      "3 个品牌套件",
      "个人商用授权",
    ],
    cta: "选择 Starter",
    ctaVariant: "default",
  },
  {
    id: "pro",
    name: "Pro",
    nameEn: "Pro",
    description: "专业设计师的首选",
    monthlyPrice: 39,
    yearlyPrice: 29,
    credits: 5000,
    creditLabel: "5,000 积分/月",
    badge: "最受欢迎",
    highlighted: true,
    features: [
      "全部图片 + 视频模型",
      "最高 2K 分辨率",
      "4 个并发任务",
      "50 个项目",
      "10 个品牌套件",
      "完整商业授权",
      "邮件支持",
    ],
    cta: "选择 Pro",
    ctaVariant: "accent",
  },
  {
    id: "ultra",
    name: "Ultra",
    nameEn: "Ultra",
    description: "团队与高产出工作室",
    monthlyPrice: 99,
    yearlyPrice: 79,
    credits: 15000,
    creditLabel: "15,000 积分/月",
    badge: "最划算",
    features: [
      "一切 Pro 功能",
      "最高 4K 分辨率",
      "8 个并发任务",
      "200 个项目",
      "30 个品牌套件",
      "3 个团队席位",
      "API 接入 (Beta)",
      "优先邮件支持",
    ],
    cta: "选择 Ultra",
    ctaVariant: "default",
  },
  {
    id: "business",
    name: "Business",
    nameEn: "Business",
    description: "规模化创意生产",
    monthlyPrice: 249,
    yearlyPrice: 199,
    credits: 50000,
    creditLabel: "50,000 积分/月",
    features: [
      "一切 Ultra 功能",
      "12 个并发任务",
      "无限项目",
      "100 个品牌套件",
      "10+ 团队席位",
      "完整 API 接入",
      "专属客户经理",
      "SLA 保障",
    ],
    cta: "联系销售",
    ctaVariant: "outline",
  },
];

// ---------------------------------------------------------------------------
// Feature Comparison
// ---------------------------------------------------------------------------

export const featureCategories: FeatureCategory[] = [
  {
    name: "创作能力",
    features: [
      {
        name: "图片生成模型",
        tiers: { free: "基础 3 款", starter: "全部", pro: "全部", ultra: "全部", business: "全部" },
      },
      {
        name: "视频生成模型",
        tiers: { free: false, starter: "基础 2 款", pro: "全部", ultra: "全部", business: "全部" },
      },
      {
        name: "最高分辨率",
        tiers: { free: "1K", starter: "1K", pro: "2K", ultra: "4K", business: "4K" },
      },
      {
        name: "并发任务",
        tiers: { free: "1", starter: "2", pro: "4", ultra: "8", business: "12" },
      },
    ],
  },
  {
    name: "积分与用量",
    features: [
      {
        name: "月积分",
        tiers: { free: "50/天", starter: "1,200", pro: "5,000", ultra: "15,000", business: "50,000" },
      },
      {
        name: "积分充值折扣",
        tiers: { free: false, starter: false, pro: "10%", ultra: "15%", business: "20%" },
      },
      {
        name: "积分有效期",
        tiers: { free: "当日", starter: "当月", pro: "当月", ultra: "当月", business: "当月" },
      },
    ],
  },
  {
    name: "协作与管理",
    features: [
      {
        name: "项目数量",
        tiers: { free: "3", starter: "10", pro: "50", ultra: "200", business: "无限" },
      },
      {
        name: "品牌套件",
        tiers: { free: "1", starter: "3", pro: "10", ultra: "30", business: "100" },
      },
      {
        name: "团队席位",
        tiers: { free: false, starter: false, pro: false, ultra: "3", business: "10+" },
      },
      {
        name: "API 接入",
        tiers: { free: false, starter: false, pro: false, ultra: "Beta", business: true },
      },
    ],
  },
  {
    name: "权益与支持",
    features: [
      {
        name: "商业授权",
        tiers: { free: false, starter: "个人", pro: true, ultra: true, business: true },
      },
      {
        name: "文件存储",
        tiers: { free: "7 天", starter: "30 天", pro: "1 年", ultra: "1 年", business: "永久" },
      },
      {
        name: "客户支持",
        tiers: { free: "社区", starter: "社区", pro: "邮件", ultra: "优先邮件", business: "专属客服" },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

export const faqItems: FAQItem[] = [
  {
    question: "积分是如何计算的？",
    answer:
      "每次生成操作消耗不同数量的积分。标准图片生成约消耗 5 积分，HD 图片约 10 积分，标准视频（5秒）约 40 积分。使用更高端的 AI 模型或更高分辨率会消耗更多积分。",
  },
  {
    question: "未使用的积分会累积吗？",
    answer:
      "订阅积分在每个计费周期重置，不会累积到下月。但通过充值购买的额外积分永不过期，可以一直使用。",
  },
  {
    question: "可以随时升级或降级吗？",
    answer:
      "随时可以升级，我们会按比例计算差价。降级将在当前计费周期结束后生效。升级后立即获得新套餐的全部功能和积分。",
  },
  {
    question: "年付方案如何计费？",
    answer:
      "年付方案按年一次性支付，相当于每月价格的约 75 折（节省约 25%）。年付方案同样享受所有功能，积分按月重置。",
  },
  {
    question: "团队席位如何工作？",
    answer:
      "Ultra 和 Business 套餐包含团队席位。每位团队成员共享套餐积分池，可独立创建项目和使用品牌套件。需要更多席位可联系我们。",
  },
  {
    question: "支持哪些支付方式？",
    answer:
      "我们通过 Stripe 接受所有主流信用卡和借记卡（Visa、Mastercard、American Express）。中国用户还可使用支付宝支付。",
  },
  {
    question: "如何申请退款？",
    answer:
      "如果在订阅后 7 天内未使用任何积分，可以申请全额退款。超过 7 天或已使用积分的情况不支持退款。请通过客服邮件提交退款申请。",
  },
];

// ---------------------------------------------------------------------------
// Animation variants (shared across pricing components)
// ---------------------------------------------------------------------------

export const fadeInUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.08,
      duration: 0.6,
      ease: [0.25, 0.46, 0.45, 0.94] as const,
    },
  }),
};

export const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.07, delayChildren: 0.15 },
  },
};

export const cardReveal = {
  hidden: { opacity: 0, y: 28, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
};

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.4, ease: "easeOut" as const },
  },
};
