"use client";

import { ChevronDown, Globe2 } from "lucide-react";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n";
import { useLanguage } from "@/components/LanguageProvider";

export default function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale } = useLanguage();
  const current = LOCALE_LABELS[locale];

  return (
    <label
      className={`lang-select ${className}`}
      title={`${current.label} — change language`}
      data-no-translate
    >
      <Globe2 size={14} aria-hidden="true" />
      <span aria-hidden="true" className="lang-select-code">
        {current.short}
      </span>
      <ChevronDown size={12} aria-hidden="true" className="lang-select-chevron" />
      <select
        aria-label="Language"
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        className="lang-select-input"
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_LABELS[code].label}
          </option>
        ))}
      </select>
    </label>
  );
}
