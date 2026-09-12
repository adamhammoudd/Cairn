"use client";

import { useEffect } from "react";

/**
 * Publishes the classic scrollbar's width as `--sbw` on the document root.
 *
 * Full-bleed elements inside the shell's padded, max-width `<main>` have to
 * break out to the page edge, and the usual `w-screen` does it wrong: `100vw`
 * includes the scrollbar gutter. Measured at a 1920px window with a 15px
 * scrollbar, the ticker strip ran -7 -> 1913 against a usable width of 1905 -
 * overshooting both edges unevenly and getting clipped.
 *
 * `calc(100vw - var(--sbw))` is the exact usable width. Kept in one place so
 * every full-bleed surface uses the same number.
 */
export function ScrollbarWidthVar() {
  useEffect(() => {
    const root = document.documentElement;

    function measure() {
      // 0 on overlay-scrollbar platforms (most phones, macOS by default),
      // which is correct - there is no gutter to subtract there.
      const width = window.innerWidth - root.clientWidth;
      root.style.setProperty("--sbw", `${Math.max(0, width)}px`);
    }

    measure();
    window.addEventListener("resize", measure);
    // A page that grows past the viewport mid-session gains a scrollbar
    // without a resize event, so watch the document box too.
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);

    return () => {
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, []);

  return null;
}
