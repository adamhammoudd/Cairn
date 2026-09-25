"use client";

// The hCaptcha checkbox, loaded straight from hCaptcha's own script rather
// than through an npm wrapper - it is one script tag and one render call.
//
// Writes the token into a hidden `captchaToken` input, so it travels with the
// form to the server action like any other field (see lib/captcha.ts).
// Renders nothing when NEXT_PUBLIC_HCAPTCHA_SITE_KEY is unset.
//
// Tokens are single-use: Supabase spends one per request, right or wrong. The
// widget therefore resets itself after every submission (pending -> idle),
// otherwise a second attempt after a wrong password would fail on a stale
// token instead of on the password.

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

const SITE_KEY = (process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY ?? "").trim();
const SCRIPT_SRC = "https://js.hcaptcha.com/1/api.js?render=explicit&recaptchacompat=off";

/** Whether the widget will render - pages use it to decide whether to wait for a token. */
export const CAPTCHA_ENABLED = SITE_KEY !== "";

interface HCaptchaApi {
  render(container: HTMLElement, params: Record<string, unknown>): string;
  reset(widgetId?: string): void;
  remove(widgetId?: string): void;
}

declare global {
  interface Window {
    hcaptcha?: HCaptchaApi;
  }
}

let scriptPromise: Promise<HCaptchaApi> | null = null;

function loadHCaptcha(): Promise<HCaptchaApi> {
  if (window.hcaptcha) return Promise.resolve(window.hcaptcha);
  scriptPromise ??= new Promise<HCaptchaApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () =>
      window.hcaptcha ? resolve(window.hcaptcha) : reject(new Error("hCaptcha loaded but did not initialise"));
    script.onerror = () => {
      scriptPromise = null; // allow a retry on the next mount
      reject(new Error("hCaptcha script failed to load"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function Captcha({ onTokenChange }: { onTokenChange?: (token: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [token, setToken] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const { pending } = useFormStatus();
  const wasPending = useRef(false);

  // Keep the parent informed without making it a dependency of the effects.
  const notify = useRef(onTokenChange);
  useEffect(() => {
    notify.current = onTokenChange;
  });
  const update = (value: string) => {
    setToken(value);
    notify.current?.(value);
  };

  useEffect(() => {
    if (!CAPTCHA_ENABLED) return;
    let cancelled = false;
    loadHCaptcha()
      .then((api) => {
        if (cancelled || !container.current || widgetId.current !== null) return;
        widgetId.current = api.render(container.current, {
          sitekey: SITE_KEY,
          theme: "dark",
          callback: (value: string) => update(value),
          "expired-callback": () => update(""),
          "chalexpired-callback": () => update(""),
          "error-callback": () => update(""),
        });
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
      if (widgetId.current !== null) {
        window.hcaptcha?.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, []);

  // A submission just finished: the token it carried is spent either way.
  useEffect(() => {
    if (wasPending.current && !pending && widgetId.current !== null) {
      window.hcaptcha?.reset(widgetId.current);
      update("");
    }
    wasPending.current = pending;
  }, [pending]);

  if (!CAPTCHA_ENABLED) return null;

  return (
    <div className="mt-4">
      <div ref={container} className="min-h-[78px]" />
      <input type="hidden" name="captchaToken" value={token} />
      {loadFailed && (
        <p className="mt-2 text-caption text-warning" role="alert">
          The security check could not load. Check your connection, allow hcaptcha.com if you use a
          content blocker, then reload the page.
        </p>
      )}
    </div>
  );
}
