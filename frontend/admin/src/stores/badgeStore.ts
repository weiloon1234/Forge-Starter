import { createStore, useStore } from "@shared/store/createStore";

type BadgeState = {
  counts: Record<string, number>;
  loaded: boolean;
};

const badgeStore = createStore<BadgeState>({ counts: {}, loaded: false });

export const adminBadges = {
  /** Hydrate from REST snapshot. Replaces the full counts map and marks loaded. */
  hydrate(counts: Record<string, number>) {
    badgeStore.setState({ counts, loaded: true });
  },
  /** Apply a single WS delta. Callers should gate with `knows(key)` first. */
  set(key: string, count: number) {
    badgeStore.setState((prev) => ({
      counts: { ...prev.counts, [key]: count },
    }));
  },
  /** Returns true iff `key` was included in the last REST snapshot (allowlist). */
  knows(key: string): boolean {
    return key in badgeStore.getState().counts;
  },
  /** Reset to empty state on logout. */
  reset() {
    badgeStore.setState({ counts: {}, loaded: false });
  },
};

/** Component hook: current count for a single key (0 if unset or undefined). */
export function useBadge(key?: string): number {
  return useStore(badgeStore, (state) => (key ? (state.counts[key] ?? 0) : 0));
}

/** Component hook: sum of counts across `keys` (unset keys count as 0). */
export function useBadgeSum(keys: readonly string[]): number {
  return useStore(badgeStore, (state) =>
    keys.reduce((acc, key) => acc + (state.counts[key] ?? 0), 0),
  );
}

/** Component hook: the full counts map (used by the sidebar aggregation helper). */
export function useBadgeCounts(): Record<string, number> {
  return useStore(badgeStore, (state) => state.counts);
}
