import phones from "@/pages/api/phones";
import {
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  QrcodeOutlined,
  SettingOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Phone } from "@prisma/client";
import { Button, Dropdown, MenuProps, Space } from "antd";
import { useTranslation } from "next-i18next";
import { MenuInfo } from "rc-menu/lib/interface";

export interface PhoneTableButtonProps {
  phone: Phone;
  onEditClick?: (phone: Phone | undefined, menuInfo: MenuInfo) => void;
  onGetQrCodeClick?: (phone: Phone | undefined, menuInfo: MenuInfo) => void;
  onDeleteClick?: (phone: Phone | undefined, menuInfo: MenuInfo) => void;
}
export default function PhoneTableButton({
  phone,
  onEditClick,
  onGetQrCodeClick,
  onDeleteClick,
}: PhoneTableButtonProps) {
  const { t } = useTranslation("common");
  const items: MenuProps["items"] = [
    {
      label: t("edit"),
      key: "1",
      icon: <EditOutlined />,
      onClick: (e) => onEditClick && onEditClick(phone, e),
    },
    {
      label: t("scan_qrcode"),
      key: "2",
      icon: <QrcodeOutlined />,
      onClick: (e) => onGetQrCodeClick && onGetQrCodeClick(phone, e),
    },
    {
      label: t("delete"),
      key: "3",
      icon: <DeleteOutlined />,
      onClick: (e) => onDeleteClick && onDeleteClick(phone, e),
    },
  ];

  const menuProps = {
    items,
  };
  return (
    <Dropdown menu={menuProps} trigger={["click"]}>
      <Button>
        <Space>
          <SettingOutlined />
          Action
          <DownOutlined />
        </Space>
      </Button>
    </Dropdown>
  );
}
