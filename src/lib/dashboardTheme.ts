import type { ThemeConfig } from "antd";
import { theme } from "antd";
import { DashboardColor, dashboardPalette } from "./dashboardColors";

export function dashboardTheme(dark: boolean, color: DashboardColor = "blue"): ThemeConfig {
  const { primary, emphasis, onPrimary, surface, soft, border, text, secondary, layout, selected } = dashboardPalette(dark, color);
  return {
    algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: primary,
      colorPrimaryBg: soft,
      colorPrimaryBgHover: selected,
      colorPrimaryText: emphasis,
      colorPrimaryTextHover: emphasis,
      colorPrimaryTextActive: emphasis,
      colorTextLightSolid: onPrimary,
      colorLink: emphasis,
      colorLinkHover: emphasis,
      colorLinkActive: emphasis,
      controlItemBgActive: selected,
      controlItemBgActiveHover: selected,
      colorInfo: primary,
      // Explicit info surfaces keep strong accent colors light and readable.
      ...(["green", "teal", "orange"].includes(color) ? {
        colorInfoBg: soft, colorInfoBgHover: selected,
        colorInfoBorder: border, colorInfoBorderHover: primary,
        colorInfoText: emphasis, colorInfoTextHover: primary, colorInfoTextActive: emphasis,
      } : {}),
      // Use consistent Ant Design success, warning and error scales for every accent.
      colorBgBase: surface,
      colorBgContainer: surface,
      colorBgElevated: surface,
      colorBgLayout: layout,
      colorText: text,
      colorTextSecondary: secondary,
      colorTextTertiary: secondary,
      colorTextPlaceholder: dark ? "#94b0c8" : "#60798c",
      colorTextDisabled: dark ? "#8097ab" : "#6d8292",
      colorBgContainerDisabled: soft,
      colorBorder: border,
      colorBorderSecondary: border,
      borderRadius: 10,
      controlHeight: 38,
      fontFamily: '"Segoe UI", Arial, sans-serif',
      lineHeight: 1.6,
    },
    components: {
      Layout: { headerBg: surface, siderBg: surface, bodyBg: layout },
      Menu: {
        itemBg: "transparent", itemColor: secondary,
        itemSelectedBg: selected,
        itemSelectedColor: emphasis,
        itemHoverBg: soft, itemHoverColor: text,
        itemBorderRadius: 10, itemHeight: 42,
      },
      Button: { defaultBg: surface, defaultColor: text, defaultBorderColor: border, fontWeight: 600 },
      Table: {
        headerBg: soft, headerColor: text, headerSortActiveBg: selected,
        headerSortHoverBg: selected,
        bodySortBg: soft,
        rowHoverBg: soft, rowSelectedBg: selected,
        rowSelectedHoverBg: selected,
        footerBg: soft, footerColor: secondary, borderColor: border,
        headerSplitColor: border, cellPaddingBlock: 14,
      },
      Card: { headerBg: surface },
      Notification: { colorBgElevated: surface, colorText: text, colorTextHeading: text },
      Message: { contentBg: surface, colorText: text },
      Input: { activeShadow: `0 0 0 3px ${primary}26` },
      Select: { optionSelectedBg: soft },
      Dropdown: { controlItemBgActive: selected, controlItemBgActiveHover: selected, colorPrimary: emphasis },
      Checkbox: { colorPrimary: emphasis, colorPrimaryHover: emphasis, colorTextLightSolid: "#ffffff" },
      Radio: { colorPrimary: emphasis, colorPrimaryHover: emphasis },
      Pagination: { itemActiveBg: soft, itemBg: surface, colorPrimary: emphasis, colorPrimaryHover: emphasis },
    },
  };
}

