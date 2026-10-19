import { Button, Dropdown } from "antd";
import type { MenuProps } from "antd";
import { DownOutlined } from "@ant-design/icons";
import { useLocalizedTranslation as useTranslation } from "@/lib/uiTranslation";

export default function ActionDropdown({ items, ariaLabel, disabled }: {
  items: MenuProps["items"];
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation("upgrade");
  return <Dropdown trigger={["click"]} menu={{ items }} disabled={disabled}>
    <Button aria-label={ariaLabel} disabled={disabled}>{t("Aksi")} <DownOutlined /></Button>
  </Dropdown>;
}
