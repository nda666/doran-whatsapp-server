import { useUiTranslation } from "@/lib/uiTranslation";
import ActionDropdown from "@/components/ActionDropdown";
import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  InfoCircleOutlined,
  KeyOutlined,
  QrcodeOutlined,
  StopOutlined,
  WechatFilled,
  SendOutlined,
  UserOutlined,
  SettingOutlined,
  BarChartOutlined,
} from "@ant-design/icons";
import { Phone } from "@prisma/client";
import { MenuProps, Modal, Typography } from "antd";
import type { PhoneRow } from "@/lib/usePhoneData";
import PhoneConnectionStatus from "./PhoneConnectionStatus";
import { useLocalizedTranslation as useTranslation } from "@/lib/uiTranslation";
import { MenuInfo } from "rc-menu/lib/interface";
import { useRouter } from "next/router";

export interface PhoneTableButtonProps {
  phone: PhoneRow;
  generatingToken?: boolean;
  onGenerateTokenClick?: () => void;
  policyAvailable?: boolean;
  onPolicyClick?: () => void;
  onAutoReply?: (phone: Phone | undefined, menuInfo: MenuInfo) => void;
  onListReply?: (phone: Phone | undefined, menuInfo: MenuInfo) => void;
  onEditClick?: (phone: Phone | undefined, menuInfo: MenuInfo) => void;
  onGetQrCodeClick?: (phone: Phone | undefined, menuInfo: MenuInfo) => void;
  onDeleteClick?: (phone: Phone | undefined, menuInfo: MenuInfo) => void;
  onTestSendClick?: (phone: Phone | undefined, menuInfo: MenuInfo) => void;
  onToggleActiveClick?: (
    phone: Phone | undefined,
    active: number,
    menuInfo: MenuInfo
  ) => void;
}
export default function PhoneTableButton({
  phone,
  generatingToken,
  onGenerateTokenClick,
  policyAvailable,
  onPolicyClick,
  onAutoReply,
  onListReply,
  onEditClick,
  onGetQrCodeClick,
  onDeleteClick,
  onTestSendClick,
  onToggleActiveClick,
}: PhoneTableButtonProps) {
  const uiText = useUiTranslation();
  const { t } = useTranslation("common");
  const router = useRouter();
  const [modal, contextHolder] = Modal.useModal();
  const items: MenuProps["items"] = [
    {
      label: t("scan_qrcode"),
      key: `${phone.id}-2`,
      icon: <QrcodeOutlined />,
      disabled: phone.connection?.action !== "scan_qr",
      onClick: (e) => onGetQrCodeClick && onGetQrCodeClick(phone, e),
    },
    { label: uiText("Lihat Percakapan"), icon: <WechatFilled />, key: `${phone.id}-conversations`, onClick: () => { void router.push({ pathname: "/dashboard/conversations", query: { phone_id: phone.id } }); } },
    { label: uiText("Lihat laporan"), icon: <BarChartOutlined />, key: `${phone.id}-reports`, onClick: () => { void router.push({ pathname: "/dashboard/reports", query: { view: "phones", phoneId: phone.id } }); } },
    {
      label: uiText("Test Kirim"),
      key: `${phone.id}-test-send`,
      icon: <SendOutlined />,
      disabled: phone.active !== 1 || phone.connection?.state !== "online",
      onClick: e => onTestSendClick?.(phone, e),
    },
    {
      label: t("list_replies"),
      key: `${phone.id}-4`,
      icon: <WechatFilled />,
      onClick: (e) => onListReply && onListReply(phone, e),
    },
    { type: "divider" },
    {
      label: t("edit"),
      key: `${phone.id}-1`,
      icon: <EditOutlined />,
      onClick: (e) => onEditClick && onEditClick(phone, e),
    },
    {
      label: uiText("Atur batas"),
      key: `${phone.id}-policy`,
      icon: <SettingOutlined />,
      disabled: !policyAvailable,
      onClick: () => onPolicyClick?.(),
    },
    {
      label: uiText("Buat token"),
      key: `${phone.id}-generate-token`,
      icon: <KeyOutlined />,
      disabled: generatingToken,
      onClick: () => onGenerateTokenClick?.(),
    },
    { type: "divider" },
    { label: uiText("Informasi koneksi"), icon: <InfoCircleOutlined />, key: `${phone.id}-session`, onClick: () => modal.info({ title: uiText("Informasi koneksi WhatsApp"), okText: uiText("Tutup"), content: <div><p>{uiText("Label:")} {phone.name}</p><p>{uiText("Nomor:")} {phone.number || uiText("Belum tertaut")}</p><p>{uiText("Nama Akun WA:")} {phone.account_name || "—"}</p><PhoneConnectionStatus connection={phone.connection} /><p>{phone.connection ? uiText("Diperiksa: {{v0}} WIB", { v0: new Date(phone.connection.checkedAt).toLocaleString(uiText.locale, { timeZone: "Asia/Jakarta" }) }) : uiText("Status belum tersedia.")}</p></div> }) },
    {
      label: uiText("Lihat Device ID"),
      icon: <InfoCircleOutlined />,
      key: `${phone.id}-device-id`,
      onClick: () => modal.info({
        title: uiText("Device ID Perangkat Pengirim"),
        okText: uiText("Tutup"),
        content: <div>
          <p>{uiText("Perangkat:")} {phone.name}</p>
          <p>{uiText("Nomor pengirim:")} {phone.number || "—"}</p>
          <Typography.Paragraph strong>{uiText("Device ID")}</Typography.Paragraph>
          <Typography.Paragraph copyable={{ text: phone.id, tooltips: [uiText("Salin Device ID"), uiText("Device ID tersalin")] }} style={{ overflowWrap: "anywhere" }}>{phone.id}</Typography.Paragraph>
          <p>{uiText("Gunakan UUID ini untuk")} <Typography.Text code>{"dispatch.device_id"}</Typography.Text>  {uiText("pada webhook status pengiriman.")}</p>
          <p>{uiText("Nilainya sama dengan")} <Typography.Text code>{"data[].id"}</Typography.Text>  {uiText("dari API")} <Typography.Text code>{"phone-detail"}</Typography.Text>.</p>
        </div>,
      }),
    },
    {
      label: uiText("Lihat User ID"),
      icon: <UserOutlined />,
      key: `${phone.id}-user-id`,
      disabled: !phone.userId,
      onClick: () => modal.info({
        title: uiText("User ID Pemilik Perangkat"),
        okText: uiText("Tutup"),
        content: <div>
          <p>{uiText("Perangkat:")} {phone.name}</p>
          <p>{uiText("Nomor pengirim:")} {phone.number || "—"}</p>
          {phone.user && <p>{uiText("Pemilik:")} {phone.user.name || phone.user.email}</p>}
          <Typography.Paragraph strong>{uiText("User ID")}</Typography.Paragraph>
          <Typography.Paragraph copyable={{ text: phone.userId, tooltips: [uiText("Salin User ID"), uiText("User ID tersalin")] }} style={{ overflowWrap: "anywhere" }}>{phone.userId}</Typography.Paragraph>
          <p>{uiText("Gunakan UUID ini untuk")} <Typography.Text code>{"dispatch.user_id"}</Typography.Text>  {uiText("pada webhook status pengiriman.")}</p>
        </div>,
      }),
    },
    { type: "divider" },
    {
      label: phone.active === 1 ? "Nonaktifkan" : "Aktifkan",
      key: `${phone.id}-5`,
      icon: phone.active === 1 ? <StopOutlined /> : <CheckCircleOutlined />,
      onClick: (e) =>
        onToggleActiveClick &&
        onToggleActiveClick(phone, phone.active === 1 ? 0 : 1, e),
    },
    {
      label: t("delete"),
      danger: true,
      key: `${phone.id}-3`,
      icon: <DeleteOutlined />,
      onClick: (e) => onDeleteClick && onDeleteClick(phone, e),
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

  return <>
    {contextHolder}
    <ActionDropdown ariaLabel={uiText("Aksi perangkat {{v0}}", { v0: phone.name })} items={items} />
  </>;
}
