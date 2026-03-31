"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/landing/section-header";
import { StaggerContainer, scaleUp } from "@/components/landing/motion";

// ---------------------------------------------------------------------------
// Gallery item data — curated AI-generated creative work
// Each description accurately matches the image content
// ---------------------------------------------------------------------------

interface GalleryItem {
  category: string;
  title: string;
  image: string;
  colSpan?: string;
  rowSpan?: string;
}

const GALLERY_ITEMS: GalleryItem[] = [
  {
    // soul1: 蓝色发光水母数字艺术雕塑
    category: "数字艺术",
    title: "梦幻水母 — AI 生成数字雕塑",
    image:
      "https://dqv0cqkoy5oj7.cloudfront.net/user_35h9Zqn0Bk5qurQOPUM7laOSfXO/hf_20260217_184432_7af6e3df-a5ad-4e8a-a3b4-c6d8637ce85c.png",
    rowSpan: "row-span-2",
  },
  {
    // lov1: 运动品牌产品发布多图版面设计
    category: "品牌设计",
    title: "运动品牌产品发布版面",
    image:
      "https://assets-persist.lovart.ai/img/d92cfdbbb4c243d8a269dc6d1301540c/533de217d64394ebf9b4794d8de6b3110917d550.png",
    colSpan: "col-span-2",
  },
  {
    // soul3: 暗调艺术风格人像，飘逸长发
    category: "艺术摄影",
    title: "暗调艺术人像 — AI 风格化写真",
    image:
      "https://dqv0cqkoy5oj7.cloudfront.net/user_36Hwty94QweUxs82UEGsxmReIrf/hf_20260218_182218_2cfc8314-b866-479e-a70e-b8f27b950e11.png",
  },
  {
    // lov4: 眼镜品牌广告，橙色毛线帽男性
    category: "广告设计",
    title: "眼镜品牌广告 — See Beyond the Ordinary",
    image:
      "https://assets-persist.lovart.ai/img/d92cfdbbb4c243d8a269dc6d1301540c/79385767155d45c0a8d74c584a479a836b785107.png",
  },
  {
    // soul7: 心形古董珠宝盒，钥匙与怀表
    category: "静物摄影",
    title: "复古珠宝盒 — AI 生成静物写真",
    image:
      "https://dqv0cqkoy5oj7.cloudfront.net/user_35h9Zqn0Bk5qurQOPUM7laOSfXO/hf_20260209_131824_f0307da0-93a0-41e0-8b37-9d34bb09b328.png",
  },
  {
    // soul8: 三位女性复古运动时尚大片
    category: "时尚大片",
    title: "复古运动风 — AI 时尚编辑摄影",
    image:
      "https://dqv0cqkoy5oj7.cloudfront.net/user_36Hwty94QweUxs82UEGsxmReIrf/hf_20260218_171001_e4013ff6-6e4a-411d-89b4-171c192dd5ef.png",
    colSpan: "col-span-2",
  },
  {
    // lov8: 咖啡品牌视觉系统（深色背景多图）
    category: "品牌系统",
    title: "咖啡品牌全套视觉设计",
    image:
      "https://assets-persist.lovart.ai/img/d92cfdbbb4c243d8a269dc6d1301540c/ba24a2ef16feb236dbc0a9ac71f7a8ea5aa8fc21.png",
  },
  {
    // soul4: 亚洲元素混合媒体拼贴艺术
    category: "混合媒体",
    title: "东方美学拼贴 — AI 混合媒体创作",
    image:
      "https://dqv0cqkoy5oj7.cloudfront.net/user_35h9Zqn0Bk5qurQOPUM7laOSfXO/hf_20260218_141135_4468ae61-47be-4396-834b-8bbc78054909.png",
    rowSpan: "row-span-2",
  },
];

// ---------------------------------------------------------------------------
// GalleryCard
// ---------------------------------------------------------------------------

function GalleryCard({ item }: { item: GalleryItem }) {
  return (
    <motion.div
      variants={scaleUp}
      className={cn(
        "relative rounded-xl overflow-hidden group cursor-pointer",
        "border border-border/50",
        item.colSpan,
        item.rowSpan
      )}
    >
      {/* Real image */}
      <img
        src={item.image}
        alt={item.title}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        loading="lazy"
      />

      {/* Subtle bottom gradient for text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {/* Hover overlay — glassmorphism */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
        <span
          className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold mb-2 w-fit"
          style={{
            background: "oklch(0.90 0.17 115)",
            color: "oklch(0.18 0 0)",
          }}
        >
          {item.category}
        </span>
        <p className="text-white text-sm font-medium leading-snug">
          {item.title}
        </p>
      </div>

      {/* Height spacer for grid rows */}
      <div className="relative w-full h-full min-h-0" />
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// ShowcaseGallery
// ---------------------------------------------------------------------------

export function ShowcaseGallery() {
  return (
    <section id="showcase" className="py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-4">
        <div className="mb-14 md:mb-20">
          <SectionHeader
            title="创意无界"
            subtitle="探索 AI 驱动的无限设计可能"
          />
        </div>

        <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 auto-rows-[200px] lg:auto-rows-[180px]">
          {GALLERY_ITEMS.map((item) => (
            <GalleryCard key={item.title} item={item} />
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}
