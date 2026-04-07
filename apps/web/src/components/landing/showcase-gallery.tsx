"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/landing/section-header";
import { StaggerContainer, scaleUp } from "@/components/landing/motion";

// ---------------------------------------------------------------------------
// Gallery -- local high-res images (1200px, optimized jpg)
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
    category: "数字艺术",
    title: "梦幻水母 -- AI 数字雕塑",
    image: "/images/showcase/showcase-1.jpg",
    rowSpan: "row-span-2",
  },
  {
    category: "潮流时尚",
    title: "朋克牛仔 -- AI 时尚造型",
    image: "/images/showcase/showcase-10.jpg",
    colSpan: "col-span-2",
  },
  {
    category: "艺术摄影",
    title: "暗调飘逸 -- AI 风格化写真",
    image: "/images/showcase/showcase-2.jpg",
  },
  {
    category: "创意拼贴",
    title: "东方美学 -- AI 混合媒体创作",
    image: "/images/showcase/showcase-3.jpg",
  },
  {
    category: "静物写真",
    title: "复古珠宝盒 -- AI 精致静物",
    image: "/images/showcase/showcase-4.jpg",
  },
  {
    category: "时尚大片",
    title: "复古运动风 -- AI 编辑摄影",
    image: "/images/showcase/showcase-5.jpg",
    colSpan: "col-span-2",
  },
  {
    category: "人像摄影",
    title: "清新双人 -- AI 自然光写真",
    image: "/images/showcase/showcase-11.jpg",
  },
  {
    category: "光影摄影",
    title: "闪光灯下 -- AI 戏剧性光影",
    image: "/images/showcase/showcase-12.jpg",
    rowSpan: "row-span-2",
  },
];

// ---------------------------------------------------------------------------
// GalleryCard -- uses next/image for CLS prevention and native lazy loading
// ---------------------------------------------------------------------------

function GalleryCard({ item }: { item: GalleryItem }) {
  return (
    <motion.div
      variants={scaleUp}
      className={cn(
        "relative rounded-xl overflow-hidden group cursor-pointer",
        "border border-border/50",
        item.colSpan,
        item.rowSpan,
      )}
    >
      <Image
        src={item.image}
        alt={item.title}
        fill
        unoptimized
        className="object-cover transition-transform duration-500 group-hover:scale-105"
        loading="lazy"
        sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
      />

      {/* Hover overlay */}
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

        <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 auto-rows-[240px] md:auto-rows-[280px] lg:auto-rows-[260px]">
          {GALLERY_ITEMS.map((item) => (
            <GalleryCard key={item.title} item={item} />
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}
