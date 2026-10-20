import { useUiTranslation } from "@/lib/uiTranslation";
import { Alert, Descriptions, Modal, Space, Spin, Tag, Typography } from "antd";
import { useDashboardApi } from "@/lib/useDashboardApi";
import { dispatchStatusInfo } from "@/lib/dispatchPresentation";
import dayjs from "dayjs";

function MessagePayload({ payload: p }: { payload: any }) {
  const uiText = useUiTranslation();
  if (!p) return null;
  if (p.kind === "poll") return <><Typography.Text strong>{uiText("Polling:")} {p.name}</Typography.Text><ul>{p.values.map((value: string, index: number) => <li key={index}>{value}</li>)}</ul><div>{uiText("Pilihan maksimal:")} {p.selectableCount}</div></>;
  if (p.kind === "location") return <div>{uiText("Lokasi:")} {p.name || uiText("Tanpa nama")}<br />{uiText("Lintang:")} {p.latitude}{uiText(", bujur:")} {p.longitude}</div>;
  if (p.kind === "vcard") return <div>{uiText("Kontak:")} {p.name}<br />{uiText("Nomor:")} {p.number}</div>;
  if (p.kind === "button") return <><div style={{ whiteSpace: "pre-wrap" }}>{p.text}</div><ul>{p.buttons.map((b: any) => <li key={b.id}>{b.text}</li>)}</ul></>;
  if (p.kind === "list") return <><Typography.Text strong>{p.title}</Typography.Text><div style={{ whiteSpace: "pre-wrap" }}>{p.text}</div><div>{uiText("Tombol:")} {p.buttonText}</div><ul>{p.rows.map((r: any) => <li key={r.id}>{r.title}{r.description && uiText(" — {{v0}}", { v0: r.description })}</li>)}</ul></>;
  if (p.kind === "sticker") return <div>{uiText("Pesan stiker")}</div>;
  return <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(p, null, 2)}</pre>;
}

export default function DispatchMessageModal({ id, onClose }: { id?: string; onClose: () => void }) {
  const uiText = useUiTranslation();
  const api = useDashboardApi(id ? `/api/dispatch?id=${encodeURIComponent(id)}` : "", 5000);
  const detail = api.data?.id === id ? api.data : undefined;
  const status = detail ? dispatchStatusInfo[detail.status] : undefined;
  return <Modal title={uiText("Isi pesan")} open={!!id} footer={null} onCancel={onClose} width={680}>
    {api.error ? <Alert type="error" showIcon message={uiText(api.error)} /> : !detail ? <Spin /> : <Space direction="vertical" size="middle" style={{ width: "100%", overflowWrap: "anywhere" }}>
      <Descriptions size="small" column={1} items={[{ key: "recipient", label: uiText("Penerima"), children: detail.recipient },
        { key: "origin", label: uiText("Perangkat asal token"), children: detail.phoneId },
        { key: "sender", label: uiText("Perangkat pengirim aktual"), children: detail.senderPhoneId || "—" },
        { key: "status", label: uiText("Status pengiriman"), children: <Tag color={status?.color}>{status?.label || detail.status || uiText("Belum tersedia")}</Tag> }]} />
      <Alert type={detail.status === "FAILED" ? "error" : detail.status === "UNCERTAIN" ? "warning" : "info"} showIcon message={uiText("Isi yang disimpan untuk penerima ini")} description={status?.description || uiText("Status pengiriman belum tersedia.")} />
      {!detail.content_available ? <Alert type="warning" showIcon message={uiText("Isi pesan sudah dihapus sesuai masa penyimpanan.")} description={uiText("Isi pesan terkirim disimpan 7 hari; pesan gagal atau perlu diperiksa disimpan 30 hari. Riwayat status tetap tersedia.")} /> : <>
        {detail.message && <div><Typography.Text strong>{uiText("Teks / caption")}</Typography.Text><div style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{detail.message}</div></div>}
        <MessagePayload payload={detail.payload} />
        {detail.media && <div><Typography.Text strong>{uiText("Lampiran")}</Typography.Text><div>{detail.media.originalName || detail.media.name} ({detail.media.mime})</div><Typography.Link href="/dashboard/media">{uiText("Lihat file di File Manager")}</Typography.Link></div>}
        {detail.image && <div><Typography.Text strong>{uiText("Lampiran gambar")}</Typography.Text><div>{/^https?:\/\//i.test(detail.image) ? detail.image : uiText("Gambar tersimpan dalam format base64.")}</div></div>}
      </>}
      {!!detail.sendAttempts?.length && <div><Typography.Text strong>{uiText("Riwayat percobaan pengiriman")}</Typography.Text>{detail.sendAttempts.map((attempt: any) => <div key={attempt.id} style={{ marginTop: 8 }}>
        {dayjs(attempt.startedAt).format("DD/MM/YYYY HH:mm:ss")} · {attempt.phoneId} · <Tag>{attempt.status}</Tag>{attempt.error && <Typography.Text type="secondary">{attempt.error}</Typography.Text>}
      </div>)}</div>}
    </Space>}
  </Modal>;
}
