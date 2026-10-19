export const dashboardColors = [
  { value: "green", label: "Hijau", primary: "#15803d", dark: "#86efac" },
  { value: "blue", label: "Biru", primary: "#0875bd", dark: "#65baff" },
  { value: "orange", label: "Oranye", primary: "#ff8500", dark: "#ffb454" },
  { value: "purple", label: "Ungu", primary: "#7950b8", dark: "#d0baff" },
  { value: "rose", label: "Rose", primary: "#b33e70", dark: "#ffb4d0" },
  { value: "teal", label: "Teal", primary: "#0e7490", dark: "#67e8f9" },
] as const;

export type DashboardColor = typeof dashboardColors[number]["value"];

export function isDashboardColor(value: unknown): value is DashboardColor {
  return dashboardColors.some(color => color.value === value);
}

function mix(color: string, base: string, weight: number) {
  const channels = [1, 3, 5].map(offset => Math.round(
    parseInt(color.slice(offset, offset + 2), 16) * weight
    + parseInt(base.slice(offset, offset + 2), 16) * (1 - weight),
  ).toString(16).padStart(2, "0"));
  return `#${channels.join("")}`;
}

export function dashboardPalette(dark: boolean, color: DashboardColor = "blue") {
  const selected = dashboardColors.find(option => option.value === color) || dashboardColors[1];
  const primary = dark ? selected.dark : selected.primary;
  // Dominant fill sampled from the supplied JETE wordmark: #FF8500.
  if (selected.value === "orange") return {
    primary, emphasis: dark ? "#ffc780" : "#a94f00", onPrimary: "#2b170d",
    surface: dark ? "#2c2318" : "#ffffff", layout: dark ? "#201a12" : "#fffaf3",
    soft: dark ? "#3b2d1b" : "#fff5e8", selected: dark ? "#543d1d" : "#ffe5bf",
    border: dark ? "#69502f" : "#f0d5af", text: dark ? "#fff4e5" : "#3b2a16",
    secondary: dark ? "#d5bfa4" : "#7a6044",
  };
  // Give green a botanical hue and teal a cyan hue, including their soft surfaces.
  if (selected.value === "green") return {
    primary, emphasis: dark ? "#a7f3c0" : "#166534",
    onPrimary: dark ? "#16313d" : "#ffffff",
    surface: dark ? "#17281d" : "#ffffff", layout: dark ? "#101e16" : "#f3faf4",
    soft: dark ? "#173829" : "#edf8ee", selected: dark ? "#214b34" : "#dcf3df",
    border: dark ? "#355a43" : "#c9e3ce", text: dark ? "#e7f5eb" : "#203729",
    secondary: dark ? "#adc9b7" : "#506858",
  };
  if (selected.value === "teal") return {
    primary, emphasis: dark ? "#8deaf4" : "#155e75",
    onPrimary: dark ? "#16313d" : "#ffffff",
    surface: dark ? "#142b36" : "#ffffff", layout: dark ? "#0e202a" : "#f1f9fc",
    soft: dark ? "#183b49" : "#e9f7fb", selected: dark ? "#205261" : "#d6eff6",
    border: dark ? "#355b6b" : "#c5e2ec", text: dark ? "#e4f4fb" : "#193747",
    secondary: dark ? "#a9c8d8" : "#4b6879",
  };
  // Blue keeps its historical palette; all accents share the same visual hierarchy.
  if (selected.value === "blue") return {
    primary,
    emphasis: dark ? "#91d1ff" : "#075c96",
    onPrimary: dark ? "#16313d" : "#ffffff",
    surface: dark ? "#152b40" : "#ffffff",
    layout: dark ? "#0e2031" : "#f2f9ff",
    soft: dark ? "#1b354d" : "#edf7ff",
    selected: dark ? "#234b6a" : "#d9efff",
    border: dark ? "#35516b" : "#c9deee",
    text: dark ? "#e7f2fc" : "#193b56",
    secondary: dark ? "#aac4da" : "#4c687d",
  };
  return {
    primary,
    emphasis: dark ? primary : mix(primary, "#142c36", 0.46),
    onPrimary: dark ? "#16313d" : "#ffffff",
    surface: dark ? mix(selected.primary, "#171d24", 0.14) : "#ffffff",
    layout: dark ? mix(selected.primary, "#10151b", 0.12) : mix(primary, "#ffffff", 0.045),
    soft: dark ? mix(primary, "#17212b", 0.13) : mix(primary, "#ffffff", 0.10),
    selected: dark ? mix(primary, "#17212b", 0.23) : mix(primary, "#ffffff", 0.22),
    border: dark ? mix(primary, "#374151", 0.18) : mix(primary, "#e5e7eb", 0.08),
    text: dark ? "#e7edf4" : "#263541",
    secondary: dark ? "#b0becb" : "#61717e",
  };
}
