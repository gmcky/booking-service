"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAuthStore } from "@/lib/auth/store";
import { endpoints } from "@/lib/api/endpoints";
import { safeReturnTo } from "@/lib/utils/return-to";

/** Minimal shape of the Google Identity Services script's global — just
 *  enough surface for the one-tap/button flow we use here. No @types
 *  package for GIS exists worth pulling in for this. */
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              shape?: "rectangular" | "pill" | "circle" | "square";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              width?: number;
              locale?: string;
            },
          ) => void;
        };
      };
    };
  }
}

// hl pins the button strings to English — the app has no i18n, and without
// it GIS falls back to IP-based geolocation for the rendered button text
// (the renderButton `locale` option only reaches the hidden iframe).
const GSI_SCRIPT_SRC = "https://accounts.google.com/gsi/client?hl=en";

// Module-level so the script tag is only ever injected once, even across
// multiple mounted instances of this component (login + register cards).
let gsiScriptPromise: Promise<void> | null = null;

function loadGsiScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gsiScriptPromise) return gsiScriptPromise;

  gsiScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Google script")));
      return;
    }

    const script = document.createElement("script");
    script.src = GSI_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google script"));
    document.head.appendChild(script);
  });

  return gsiScriptPromise;
}

export function GoogleSignInButton() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const containerRef = useRef<HTMLDivElement>(null);

  // Read fresh at callback time instead of closing over a stale value from
  // the render that set up the (one-shot) effect below.
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    // No client ID configured (e.g. local dev without the secret) — render
    // nothing rather than a broken button. Password auth still works.
    if (!clientId) return;

    let cancelled = false;

    loadGsiScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.google) return;

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            void (async () => {
              try {
                const { accessToken, user } = await endpoints.googleSignIn(response.credential);
                setAuth(accessToken, user);
                router.replace(safeReturnTo(searchParamsRef.current.get("returnTo")));
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Google sign-in failed");
              }
            })();
          },
        });

        // Clears any button rendered by a prior effect run (React Strict
        // Mode double-invokes effects in dev) so we never stack two.
        containerRef.current.innerHTML = "";
        window.google.accounts.id.renderButton(containerRef.current, {
          theme: "outline",
          size: "large",
          shape: "rectangular",
          text: "continue_with",
          // The app has no i18n — pin the button to English instead of
          // letting GIS follow the browser locale and stick out.
          locale: "en",
          width: containerRef.current.offsetWidth || undefined,
        });
      })
      .catch(() => {
        // Fail silent: the Google button just doesn't appear, password
        // auth is unaffected.
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, router, setAuth]);

  if (!clientId) return null;

  return <div ref={containerRef} className="flex w-full justify-center" />;
}
