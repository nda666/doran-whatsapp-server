import { useUiTranslation } from "@/lib/uiTranslation";
import { useState } from "react";
import axios from "axios";
import { Alert, Button, Descriptions, Form, Input, Modal, Select, Space } from "antd";
import { dispatchStatusInfo } from "@/lib/dispatchPresentation";
import { useDashboardApi } from "@/lib/useDashboardApi";

function formatResponse(body: string) {
  try { return JSON.stringify(JSON.parse(body), null, 2); }
  catch { return body; }
}

export default function DispatchWebhookModal({ row, onClose }: { row?: any; onClose: () => void }) {
  const uiText = useUiTranslation();
  const api = useDashboardApi("");
  const [status, setStatus] = useState(row?.status || "DELIVERED");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; eventId?: string }>();
  const [details, setDetails] = useState<any>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [copyResult, setCopyResult] = useState("");
  const detailText = details ? JSON.stringify(details, null, 2) : "";
  const showDetails = async () => {
    setDetailOpen(true); setCopyResult(""); setDetailError("");
    if (details || !row) return;
    setDetailBusy(true);
    try {
      const response = await axios.post("/api/dispatch-webhook", { id: row.id, status, action: "preview" }, { headers: api.headers, timeout: 15000 });
      setDetails(response.data.details);
    } catch (error: any) {
      setDetailError(error.response?.data?.message || uiText("Detail webhook belum dapat dimuat."));
    } finally { setDetailBusy(false); }
  };
  const copyDetails = async () => {
    try { await navigator.clipboard.writeText(detailText); setCopyResult(uiText("Detail lengkap berhasil disalin.")); }
    catch { setCopyResult(uiText("Tidak dapat menyalin otomatis. Pilih seluruh teks di bawah lalu salin.")); }
  };
  const send = async () => {
    if (busy || !row || result?.ok) return;
    setBusy(true); setResult(undefined); setDetails(undefined); setCopyResult("");
    try {
      const response = await axios.post("/api/dispatch-webhook", { id: row.id, status }, { headers: api.headers, timeout: 25000 });
      setResult({ ok: true, message: response.data.message, eventId: response.data.event_id });
      setDetails(response.data.details);
    } catch (error: any) {
      setResult({ ok: false, message: error.response?.data?.message || uiText("Hasil webhook belum diketahui. Periksa riwayat kasir sebelum mengirim lagi."), eventId: error.response?.data?.event_id });
      setDetails(error.response?.data?.details);
    } finally { setBusy(false); }
  };
  return <><Modal title={uiText("Kirim webhook ke kasir")} open={!!row} onCancel={() => { if (!busy) onClose(); }}
    closable={!busy} maskClosable={!busy} keyboard={!busy} confirmLoading={busy}
    okText={uiText("Kirim webhook")} cancelText={uiText("Tutup")} onOk={send} okButtonProps={{ disabled: !!result?.ok || detailBusy }} cancelButtonProps={{ disabled: busy }} width={680} style={{ top: 24 }} styles={{ body: { maxHeight: "calc(100dvh - 160px)", overflowY: "auto" } }}>
    <Space direction="vertical" size="small" style={{ width: "100%", overflowWrap: "anywhere" }}>
      <Alert type="info" showIcon message={uiText("Pilih status untuk dikirim ke kasir, tanpa mengirim ulang WhatsApp.")} />
      <Descriptions column={1} size="small" colon={false}
        styles={{ label: { width: 120, minWidth: 120, paddingRight: 12 }, content: { minWidth: 0, overflowWrap: "anywhere" } }}
        items={[
        { key: "url", label: uiText("Endpoint"), children: "https://kasir.doran.id/api/webhooks/jeblast/dispatch-status" },
        { key: "id", label: uiText("ID Pengiriman"), children: row?.id },
        { key: "job", label: uiText("Job ID Request"), children: row?.job_id || "—" },
        { key: "store", label: uiText("Store"), children: row?.store_id },
        { key: "transaction", label: uiText("ID transaksi"), children: row?.transaction_id },
        { key: "recipient", label: uiText("Penerima"), children: row?.recipient },
      ]} />
      <Form layout="vertical"><Form.Item label={uiText("Status webhook")} required style={{ marginBottom: 0 }}>
        <Select value={status} disabled={busy || detailBusy} onChange={value => { setStatus(value); setResult(undefined); setDetails(undefined); setCopyResult(""); }}
          options={Object.entries(dispatchStatusInfo).map(([value, info]) => ({ value, label: `${uiText(info.label)} (${value})` }))} />
      </Form.Item></Form>
      <Button onClick={showDetails} disabled={busy} loading={detailBusy}>{uiText("Detail webhook")}</Button>
      {result && <Alert type={result.ok ? "success" : "error"} showIcon message={uiText(result.message)} description={<Space direction="vertical" size="small" style={{ width: "100%" }}>
        {result.eventId && <div>{uiText("Event ID:")} {result.eventId}</div>}
        {details?.response ? <>
          <div><strong>{uiText("Respons kasir — HTTP")} {details.response.status}</strong></div>
          <Input.TextArea aria-label={uiText("Respons webhook kasir")} readOnly value={formatResponse(details.response.body) || "(Respons kosong)"}
            autoSize={{ minRows: 2, maxRows: 5 }} style={{ fontFamily: "monospace", fontSize: 12 }} />
        </> : <div>{uiText("Belum menerima respons HTTP dari kasir.")}</div>}
      </Space>} />}
    </Space>
  </Modal>
    <Modal title={uiText("Detail pengiriman webhook")} open={detailOpen} onCancel={() => setDetailOpen(false)} width={900} style={{ top: 24 }}
      footer={<Space><Button onClick={() => setDetailOpen(false)}>{uiText("Tutup")}</Button><Button type="primary" onClick={copyDetails} disabled={!detailText || detailBusy}>{uiText("Salin lengkap")}</Button></Space>}>
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        {detailBusy && <Alert type="info" message={uiText("Memuat detail webhook...")} />}
        {detailError && <Alert type="error" showIcon message={uiText(detailError)} />}
        {details && <Alert type="info" showIcon message={uiText(details.mode === "preview" ? uiText("Pratinjau webhook — belum dikirim") : uiText("Detail request dan hasil pengiriman terakhir"))}
          description={uiText("Endpoint, header Authorization, payload lengkap, waktu, dan hasil pengiriman tersedia dalam satu teks.")} />}
        {copyResult && <Alert type={copyResult === "Detail lengkap berhasil disalin." ? "success" : "warning"} showIcon message={uiText(copyResult)} />}
        {detailText && <Input.TextArea aria-label={uiText("Detail webhook lengkap")} readOnly value={detailText} style={{ fontFamily: "monospace", height: "min(45vh, 420px)", minHeight: 160 }} />}
      </Space>
    </Modal></>;
}
