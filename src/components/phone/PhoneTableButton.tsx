import phones from "@/pages/api/phones";
import {
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  QrcodeOutlined,
  SettingOutlined,
  WechatFilled,
  UserOutlined,
} from "@ant-design/icons";
import { Phone } from "@prisma/client";
import { Button, Dropdown, MenuProps, Space } from "antd";
import { useTranslation } from "next-i18next";
import { MenuInfo } from "rc-menu/lib/interface";

export interface PhoneTableButtonProps {
  phone: Phone;
  onAutoReply?: (phone: Phone | undefined, menuInfo: MenuInfo) => void;
  onListReply?: (phone: Phone | undefined, menuInfo: MenuInfo) => void;
  onEditClick?: (phone: Phone | undefined, menuInfo: MenuInfo) => void;
  onGetQrCodeClick?: (phone: Phone | undefined, menuInfo: MenuInfo) => void;
  onDeleteClick?: (phone: Phone | undefined, menuInfo: MenuInfo) => void;
}
export default function PhoneTableButton({
  phone,
  onAutoReply,
  onListReply,
  onEditClick,
  onGetQrCodeClick,
  onDeleteClick,
}: PhoneTableButtonProps) {
  const { t } = useTranslation("common");
  const items: MenuProps["items"] = [
    {
      label: t("edit"),
      key: `${phone.id}-1`,
      icon: <EditOutlined />,
      onClick: (e) => onEditClick && onEditClick(phone, e),
    },
    {
      label: t("scan_qrcode"),
      key: `${phone.id}-2`,
      icon: <QrcodeOutlined />,
      onClick: (e) => onGetQrCodeClick && onGetQrCodeClick(phone, e),
    },
    {
      label: t("delete"),
      key: `${phone.id}-3`,
      icon: <DeleteOutlined />,
      onClick: (e) => onDeleteClick && onDeleteClick(phone, e),
    },
    {
      label: t("list_replies"),
      key: `${phone.id}-4`,
      icon: <WechatFilled />,
      onClick: (e) => onListReply && onListReply(phone, e),
    },
  ];

  // if(phone.number) {
  //   let item_replies: MenuProps['items'] = [
  //     {
  //       label: t("auto_reply"),
  //       key: "4",
  //       icon: <EditOutlined />,
  //       onClick: (e) => onAutoReply && onAutoReply(phone, e)
  //     },
  //     {
  //       label: t("list_replies"),
  //       key: "5",
  //       icon: <WechatFilled/>,
  //       onClick: (e) => onListReply && onListReply(phone,e)
  //     }
  //   ];

  //   items.concat(item_replies);
  //   // items.push({
  //   //   label: t("auto_reply"),
  //   //   key: "4",
  //   //   icon: <EditOutlined />,
  //   //   onClick: (e) => onAutoReply && onAutoReply(phone, e),
  //   // });
  // }

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
