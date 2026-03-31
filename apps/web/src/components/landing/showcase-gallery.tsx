"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/landing/section-header";
import { StaggerContainer, scaleUp } from "@/components/landing/motion";

// ---------------------------------------------------------------------------
// Gallery item data — real images from AI creative platforms
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
    category: "品牌设计",
    title: "运动品牌视觉识别系统",
    image:
      "https://assets-persist.lovart.ai/img/d92cfdbbb4c243d8a269dc6d1301540c/78b3accb63a9b719c7d166025c065911555ada32.png",
    rowSpan: "row-span-2",
  },
  {
    category: "产品摄影",
    title: "潮流运动鞋商业摄影",
    image:
      "https://assets-persist.lovart.ai/img/d92cfdbbb4c243d8a269dc6d1301540c/c88bde8145aa01456be3967714fef0b186892a9b.png",
    colSpan: "col-span-2",
  },
  {
    category: "AI 创作",
    title: "AI 图像生成与编辑",
    image: "https://static.higgsfield.ai/explore/create-image.webp",
  },
  {
    category: "咖啡品牌",
    title: "咖啡店品牌设计系统",
    image:
      "https://assets-persist.lovart.ai/img/d92cfdbbb4c243d8a269dc6d1301540c/d3769ba8409ac7d8610a0e2fa9837a6afca945ba.png",
  },
  {
    category: "智能眼镜",
    title: "智能穿戴设备产品页",
    image:
      "https://assets-persist.lovart.ai/img/d92cfdbbb4c243d8a269dc6d1301540c/7f9784a644c3d537b4707a35671c1169cacf1747.png",
  },
  {
    category: "视频创作",
    title: "AI 视频生成工具",
    image: "https://static.higgsfield.ai/explore/create-video.webp",
    colSpan: "col-span-2",
  },
  {
    category: "空间设计",
    title: "现代办公空间概念设计",
    image:
      "https://assets-persist.lovart.ai/img/d92cfdbbb4c243d8a269dc6d1301540c/ee064c80e5740709122261107c2eb4f9eaca33ae.png",
  },
  {
    category: "品牌系统",
    title: "电商品牌全套视觉设计",
    image:
      "https://assets-persist.lovart.ai/img/d92cfdbbb4c243d8a269dc6d1301540c/ed929151f54e3c0d0914903861b2b76aad415f6b.png",
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

      {/* Subtle dark overlay for readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

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
