"use client";

import { Moon, Sun } from "lucide-react";

export type DashboardTheme = "dark" | "light";

export default function ThemeToggle({
  theme,
  onChange,
}: {
  theme: DashboardTheme;
  onChange: (theme: DashboardTheme) => void;
}) {
  const light = theme === "light";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={light}
      aria-label={light ? "Switch to dark mode" : "Switch to light mode"}
      title={light ? "Switch to dark mode" : "Switch to light mode"}
      data-no-translate
      onClick={() => onChange(light ? "dark" : "light")}
      className="theme-toggle"
    >
      <Sun size={13} aria-hidden="true" className={light ? "theme-toggle-icon-on" : "theme-toggle-icon"} />
      <span className="theme-toggle-track" data-on={light || undefined} aria-hidden="true">
        <span className="theme-toggle-thumb" />
      </span>
      <Moon size={13} aria-hidden="true" className={light ? "theme-toggle-icon" : "theme-toggle-icon-on"} />
    </button>
  );
}
