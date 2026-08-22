"use client";

import { useEffect, useState } from "react";

/**
 * Load a tab panel's data when its inputs change, without setting state inside
 * the effect body.
 *
 * The obvious shape - `setLoading(true)` at the top of the effect - schedules a
 * cascading render on every dependency change and is what
 * `react-hooks/set-state-in-effect` flags. Resetting during render when the key
 * changes is React's own recommended alternative: the pending render is thrown
 * away and re-run before anything is committed, so there is no extra pass.
 *
 * `loading` is derived rather than stored, which also removes the state pair
 * that could disagree - a panel showing a spinner beside stale data.
 */
export function useLazyPanel<T>(key: string, load: () => Promise<T>): { data: T | null; loading: boolean } {
  const [state, setState] = useState<{ key: string; data: T | null }>({ key, data: null });

  if (state.key !== key) setState({ key, data: null });

  useEffect(() => {
    let live = true;
    load().then(
      (result) => {
        if (live) setState({ key, data: result });
      },
      () => {
        // A rejected load leaves `data` null, which every caller renders as its
        // own honest "nothing here" state rather than an empty table.
        if (live) setState({ key, data: null });
      },
    );
    return () => {
      live = false;
    };
    // `load` is a fresh closure each render; `key` is the real dependency and
    // is constructed by the caller from everything the request depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data: state.key === key ? state.data : null, loading: state.key !== key || state.data === null };
}
