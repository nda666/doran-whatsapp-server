import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { DashboardColor, isDashboardColor } from "./dashboardColors";
// A new preference key restores original blue for the earlier experimental palettes.
const COLOR_STORAGE_KEY = "doran-color-v2";
const Context = createContext({ dark: false, toggleDark: () => {}, color: "blue" as DashboardColor, setColor: (_color: DashboardColor) => {} });
export function DashboardPreferences({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(false);
  const [color, setColorState] = useState<DashboardColor>("blue");
  useEffect(() => {
    try {
      setDark(localStorage.getItem("doran-dark") === "true");
      const saved = localStorage.getItem(COLOR_STORAGE_KEY);
      if (isDashboardColor(saved)) setColorState(saved);
    } catch { /* Preferences still work when browser storage is unavailable. */ }
  }, []);
  const setColor = (value: DashboardColor) => {
    setColorState(value);
    try { localStorage.setItem(COLOR_STORAGE_KEY, value); } catch {}
  };
  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    try { localStorage.setItem("doran-dark", String(next)); } catch {}
  };
  return <Context.Provider value={{ dark, toggleDark, color, setColor }}>{children}</Context.Provider>;
}
export const useDashboardPreferences = () => useContext(Context);
