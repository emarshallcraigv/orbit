import { supabase } from "./supabase";

/**
 * Item categories data access (0008). Practice-scoped, flat — same shape as
 * locations. Names are unique per practice case-insensitively (DB index in 0008,
 * pre-checked here via nameTaken for a friendly message). A category is optional
 * on an item; deleting one unsets it on its items (items.category_id ON DELETE
 * SET NULL) rather than deleting the items.
 */

export async function fetchCategories(practiceId) {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, sort_order")
    .eq("practice_id", practiceId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return data || [];
}

export function nameTaken(categories, name, ignoreId = null) {
  const needle = name.trim().toLowerCase();
  return categories.some((c) => c.id !== ignoreId && c.name.trim().toLowerCase() === needle);
}

export async function createCategory(practiceId, name, sortOrder) {
  const { data, error } = await supabase
    .from("categories")
    .insert({ practice_id: practiceId, name: name.trim(), sort_order: sortOrder })
    .select("id, name, sort_order")
    .single();
  if (error) throw error;
  return data;
}

export async function renameCategory(id, name) {
  const { data, error } = await supabase
    .from("categories")
    .update({ name: name.trim() })
    .eq("id", id)
    .select("id, name, sort_order")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCategory(id) {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
}

export async function saveCategoryOrder(orderedIds) {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from("categories").update({ sort_order: i }).eq("id", orderedIds[i]);
    if (error) throw error;
  }
}
