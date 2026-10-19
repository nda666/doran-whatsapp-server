import { useUiTranslation } from "@/lib/uiTranslation";
import { Button, Upload, message } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import axios from "axios";

export default function StickerPhotoUpload({ headers, busy, onBusy, onUploaded, phoneId }: {
  headers: Record<string, string>; busy: boolean; onBusy: (busy: boolean) => void;
  phoneId?: string;
  onUploaded: (asset: { id: string; name: string; mime: string; size: number }) => void;
}) {
  const uiText = useUiTranslation();
  return <Upload accept=".jpg,.jpeg,.png,.webp" disabled={busy} showUploadList={false} beforeUpload={async file => {
    if (file.size > 25 * 1024 * 1024) { message.error(uiText("Foto maksimal 25 MB.")); return Upload.LIST_IGNORE; }
    onBusy(true);
    try {
      const data = new FormData();
      data.append("file", file);
      data.append("labels", JSON.stringify([`${file.name.replace(/\.[^.]+$/, "").slice(0, 240)} (stiker)`]));
      data.append("asSticker", "1");
      const response = await axios.post(phoneId ? `/api/media?phoneId=${encodeURIComponent(phoneId)}` : "/api/media", data, { headers, timeout: 120000 });
      onUploaded(response.data.data[0]);
      message.success(uiText("Stiker siap dan tersimpan di File Manager."));
    } catch (error: any) { message.error(uiText(error.response?.data?.message || uiText("Foto belum berhasil diubah menjadi stiker."))); }
    finally { onBusy(false); }
    return false;
  }}><Button icon={<UploadOutlined />} loading={busy}>{uiText("Unggah foto menjadi stiker")}</Button></Upload>;
}
