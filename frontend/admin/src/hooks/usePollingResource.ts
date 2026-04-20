import {
  startTransition,
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { extractApiMessage } from "@/observability/utils";

interface UsePollingResourceOptions {
  enabled?: boolean;
  intervalMs?: number | null;
  dependencies?: readonly unknown[];
}

export function usePollingResource<T>(
  loader: () => Promise<T>,
  {
    enabled = true,
    intervalMs = null,
    dependencies = [],
  }: UsePollingResourceOptions = {},
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    // React Strict Mode re-runs effect cleanup/setup in development,
    // so the mounted flag must be restored on each setup.
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const runLoad = useEffectEvent(
    async (mode: "initial" | "poll" | "manual") => {
      if (inFlightRef.current) {
        return;
      }

      inFlightRef.current = true;

      const showLoading = mode === "initial" && data === null;
      if (showLoading) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const next = await loader();
        if (!mountedRef.current) {
          return;
        }

        startTransition(() => {
          setData(next);
          setError(null);
          setLastUpdated(Date.now());
        });
      } catch (nextError) {
        if (!mountedRef.current) {
          return;
        }

        setError(extractApiMessage(nextError));
      } finally {
        if (mountedRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
        inFlightRef.current = false;
      }
    },
  );

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    void runLoad("initial");

    if (!intervalMs || intervalMs <= 0) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void runLoad("poll");
    }, intervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, intervalMs, ...dependencies]);

  const refresh = useCallback(() => {
    void runLoad("manual");
  }, []);

  return {
    data,
    loading,
    refreshing,
    error,
    lastUpdated,
    refresh,
  };
}
