"use client";

import { useEffect, useRef } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

/** Whether reCAPTCHA is configured (public site key present). */
export const RECAPTCHA_ENABLED = Boolean(SITE_KEY);

declare global {
  interface Window {
    grecaptcha?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => number;
      reset: (id?: number) => void;
    };
  }
}

/**
 * Google reCAPTCHA v2 "I'm not a robot" checkbox. Renders nothing until a
 * NEXT_PUBLIC_RECAPTCHA_SITE_KEY is configured, so the app works keyless in dev.
 * Calls onToken with the response token (or null when it expires / is reset).
 * Bump `resetSignal` to clear the widget after a failed submit (tokens are
 * single-use).
 */
export function RecaptchaCheckbox({
  onToken,
  resetSignal = 0,
}: {
  onToken: (token: string | null) => void;
  resetSignal?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<number | null>(null);
  const cbRef = useRef(onToken);
  cbRef.current = onToken;

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;

    function render() {
      if (
        cancelled ||
        !ref.current ||
        widgetId.current !== null ||
        !window.grecaptcha?.render
      )
        return;
      widgetId.current = window.grecaptcha.render(ref.current, {
        sitekey: SITE_KEY,
        callback: (t: string) => cbRef.current(t),
        "expired-callback": () => cbRef.current(null),
        "error-callback": () => cbRef.current(null),
      });
    }

    if (!document.getElementById("recaptcha-script")) {
      const s = document.createElement("script");
      s.id = "recaptcha-script";
      s.src = "https://www.google.com/recaptcha/api.js?render=explicit";
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }
    // grecaptcha loads asynchronously — poll briefly until render() is available.
    const iv = setInterval(() => {
      if (window.grecaptcha?.render) {
        clearInterval(iv);
        render();
      }
    }, 100);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  useEffect(() => {
    if (
      resetSignal &&
      widgetId.current !== null &&
      window.grecaptcha?.reset
    ) {
      window.grecaptcha.reset(widgetId.current);
      cbRef.current(null);
    }
  }, [resetSignal]);

  if (!SITE_KEY) return null;
  return <div ref={ref} className="min-h-[78px]" />;
}
