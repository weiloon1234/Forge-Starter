import type { MenuItem } from "@/config/side-menu";

/**
 * Compute the badge count to render for `item`, given the current counts map
 * and a predicate that decides whether a menu entry is visible to the current
 * admin.
 *
 * Rule: parent's displayed count = own `badge` count (if any) + Σ visible
 * children's displayed counts (recursive). A hidden child contributes 0.
 */
export function getBadgeCount(
  item: MenuItem,
  counts: Record<string, number>,
  canSee: (item: MenuItem) => boolean,
): number {
  let total = item.badge ? (counts[item.badge] ?? 0) : 0;
  if (item.children?.length) {
    for (const child of item.children) {
      if (!canSee(child)) continue;
      total += getBadgeCount(child, counts, canSee);
    }
  }
  return total;
}
