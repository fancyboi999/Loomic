import type { Database } from "@loomic/shared";

import type { HomeExampleCategory, InputMention } from "./home-example-seeds";
import { homeExampleSeedCategories } from "./home-example-seeds";
import { getSupabaseBrowserClient } from "./supabase-browser";

type HomeExampleCategoryRow =
  Database["public"]["Tables"]["home_example_categories"]["Row"];
type HomeExampleExampleRow =
  Database["public"]["Tables"]["home_example_examples"]["Row"];

export function mapHomeExampleRows(
  categories: HomeExampleCategoryRow[],
  examples: HomeExampleExampleRow[],
): HomeExampleCategory[] {
  const examplesByCategory = new Map<string, HomeExampleExampleRow[]>();

  for (const example of examples) {
    const group = examplesByCategory.get(example.category_key) ?? [];
    group.push(example);
    examplesByCategory.set(example.category_key, group);
  }

  return [...categories]
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((category) => ({
      key: category.key,
      label: category.label,
      dataType: category.data_type,
      ...(category.accent === "special"
        ? { accent: "special" as const }
        : {}),
      examples: [...(examplesByCategory.get(category.key) ?? [])]
        .sort((left, right) => left.sort_order - right.sort_order)
        .map((example) => ({
          title: example.title,
          prompt: example.prompt,
          previewImages: example.image_urls,
          inputMentions: (Array.isArray(example.input_mentions) ? example.input_mentions : []) as InputMention[],
        })),
    }));
}

export async function loadHomeExampleCategories(): Promise<HomeExampleCategory[]> {
  const supabase = getSupabaseBrowserClient();

  const [categoriesResult, examplesResult] = await Promise.all([
    supabase
      .from("home_example_categories")
      .select("key, label, data_type, accent, sort_order, is_active, created_at, updated_at")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("home_example_examples")
      .select("id, category_key, title, prompt, image_urls, input_mentions, sort_order, is_active, created_at, updated_at")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  if (categoriesResult.error) {
    throw categoriesResult.error;
  }

  if (examplesResult.error) {
    throw examplesResult.error;
  }

  const categories = categoriesResult.data ?? [];
  const examples = examplesResult.data ?? [];
  const mapped = mapHomeExampleRows(categories, examples);

  return mapped.length > 0 ? mapped : homeExampleSeedCategories;
}
