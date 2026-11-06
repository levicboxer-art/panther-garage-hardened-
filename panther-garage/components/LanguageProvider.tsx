"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  LOCALE_STORAGE_KEY,
  isLocale,
  translate,
  type Locale,
} from "@/lib/i18n";

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (source: string) => string;
};

const LanguageContext = createContext<LanguageContextValue>({
  locale: "en",
  setLocale: () => {},
  t: (source) => source,
});

const TRANSLATED_ATTRIBUTES = ["placeholder", "title", "aria-label", "alt"];
const SKIP_SELECTOR = "script, style, noscript, code, pre, [data-no-translate], svg, canvas";

type TranslationRecord = { source: string; applied: string };

const textRecords = new WeakMap<Text, TranslationRecord>();
const attributeRecords = new WeakMap<Element, Map<string, TranslationRecord>>();

function isSkipped(element: Element | null) {
  return !element || element.closest(SKIP_SELECTOR) !== null;
}

function translateTextNode(node: Text, locale: Locale) {
  if (isSkipped(node.parentElement)) return;

  const current = node.nodeValue ?? "";
  let record = textRecords.get(node);

  if (!record) {
    record = { source: current, applied: current };
  } else if (current !== record.applied && current !== record.source) {
    // React (or any other code) wrote new text: treat it as a new source value.
    record = { source: current, applied: current };
  }

  const next = translate(record.source, locale);
  record.applied = next;
  textRecords.set(node, record);

  if (next !== current) node.nodeValue = next;
}

function translateAttributes(element: Element, locale: Locale) {
  if (isSkipped(element)) return;

  for (const name of TRANSLATED_ATTRIBUTES) {
    const current = element.getAttribute(name);
    if (current === null || !current.trim()) continue;

    let records = attributeRecords.get(element);
    if (!records) {
      records = new Map<string, TranslationRecord>();
      attributeRecords.set(element, records);
    }

    let record = records.get(name);
    if (!record) {
      record = { source: current, applied: current };
    } else if (current !== record.applied && current !== record.source) {
      record = { source: current, applied: current };
    }

    const next = translate(record.source, locale);
    record.applied = next;
    records.set(name, record);

    if (next !== current) element.setAttribute(name, next);
  }
}

function translateSubtree(root: Node, locale: Locale) {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as Text, locale);
    return;
  }

  if (root.nodeType === Node.ELEMENT_NODE) {
    const element = root as Element;
    if (isSkipped(element)) return;
    translateAttributes(element, locale);
  }

  if (typeof document === "undefined" || !root.firstChild) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType === Node.ELEMENT_NODE && isSkipped(node as Element)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === Node.TEXT_NODE) translateTextNode(node as Text, locale);
    else translateAttributes(node as Element, locale);
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [hydrated, setHydrated] = useState(false);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
  }, []);

  // Restore the saved language after hydration so the server markup stays stable.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    } catch {
      saved = null;
    }
    if (isLocale(saved) && saved !== "en") setLocaleState(saved);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    document.documentElement.lang = locale;
    document.documentElement.dataset.locale = locale;

    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // Storage can be unavailable in private mode; translation still works.
    }

    if (!document.body) return;
    translateSubtree(document.body, locale);

    if (locale === "en") return;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          translateTextNode(mutation.target as Text, locale);
          continue;
        }
        if (mutation.type === "attributes") {
          if (mutation.target.nodeType === Node.ELEMENT_NODE) {
            translateAttributes(mutation.target as Element, locale);
          }
          continue;
        }
        mutation.addedNodes.forEach((node) => translateSubtree(node, locale));
      }
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANSLATED_ATTRIBUTES,
    });

    return () => observer.disconnect();
  }, [locale, hydrated]);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== LOCALE_STORAGE_KEY) return;
      if (isLocale(event.newValue)) setLocaleState(event.newValue);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      setLocale,
      t: (source: string) => translate(source, locale),
    }),
    [locale, setLocale],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
