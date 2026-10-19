import { useUiTranslation } from "@/lib/uiTranslation";
import ActionDropdown from "@/components/ActionDropdown";
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { AutoReply } from "@prisma/client";
import { MenuProps } from "antd";
import { useLocalizedTranslation as useTranslation } from "@/lib/uiTranslation";
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
  const uiText = useUiTranslation();
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
      danger: true,
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

  return <ActionDropdown ariaLabel={uiText("Aksi balasan {{v0}}", { v0: auto_replies.keyword || auto_replies.id })} items={items} />;
}
