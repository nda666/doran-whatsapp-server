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
import { AutoReply, Phone } from "@prisma/client";
import { Button, Dropdown, MenuProps, Space } from "antd";
import { useTranslation } from "next-i18next";
import { MenuInfo } from "rc-menu/lib/interface";

export interface ReplyTableButtonProps {
  auto_replies: AutoReply;
  onEditClick?: (auto_replies: AutoReply | undefined, menuInfo: MenuInfo) => void;
  onDeleteClick?: (auto_replies: AutoReply | undefined, menuInfo: MenuInfo) => void;
}
export default function ReplyTableButton({
  auto_replies,
  onEditClick,
  onDeleteClick,
}: ReplyTableButtonProps) {
  const { t } = useTranslation("common");
  const items: MenuProps["items"] = [
    {
      label: t("edit"),
      key: "1",
      icon: <EditOutlined />,
      onClick: (e) => onEditClick && onEditClick(auto_replies, e),
    },
    // {
    //   label: t("scan_qrcode"),
    //   key: "2",
    //   icon: <QrcodeOutlined />,
    //   onClick: (e) => onGetQrCodeClick && onGetQrCodeClick(auto_replies, e),
    // },
    {
      label: t("delete"),
      key: "2",
      icon: <DeleteOutlined />,
      onClick: (e) => onDeleteClick && onDeleteClick(auto_replies, e),
    },
    // {
    //   label: t("auto_reply"),
    //   key: "4",
    //   icon: <EditOutlined />,
    //   onClick: (e) => onAutoReply && onAutoReply(auto_replies, e)
    // },
    // {
    //   label: t("list_replies"),
    //   key: "5",
    //   icon: <WechatFilled/>,
    //   onClick: (e) => onListReply && onListReply(auto_replies,e)
    // }
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
