import { useUiTranslation } from "@/lib/uiTranslation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Alert, Button, Form, Input, Modal, Pagination, Select, Space, Typography, message } from "antd";
import { useDashboardApi } from "@/lib/useDashboardApi";
import { renderMessageTemplate, templateVariables } from "@/lib/messageTemplates";
type Template = { id: string; name: string; content: string };

export default function MessageTemplatePicker({ onApply, defaults = {}, preserveRecipient = false, preserveVariables = false, disabled = false, maxLength = 10000, renderTrigger }: {
  onApply: (text: string) => void; defaults?: Record<string, string>; preserveRecipient?: boolean; preserveVariables?: boolean; disabled?: boolean; maxLength?: number; renderTrigger?: (openPicker: () => void) => ReactNode;
}) {
  const uiText = useUiTranslation();
  const [open, setOpen] = useState(false), [q, setQ] = useState(""), [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Template>();
  const [values, setValues] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  useEffect(() => { const timer = setTimeout(() => { setQ(search); setPage(1); }, 300); return () => clearTimeout(timer); }, [search]);
  const api = useDashboardApi<{ data: Template[]; total: number }>(open ? `/api/message-templates?q=${encodeURIComponent(q)}&page=${page}` : "");
  const variables = selected && !preserveVariables ? templateVariables(selected.content).filter(key => !preserveRecipient || !["nama", "nomor"].includes(key)) : [];
  const preview = selected ? preserveVariables ? selected.content : renderMessageTemplate(selected.content, values) : "";
  const apply = () => {
    if (!selected || disabled) return;
    if (variables.some(key => !Object.prototype.hasOwnProperty.call(values, key) || typeof values[key] !== "string" || !values[key].trim())) { message.error(uiText("Lengkapi semua variabel template.")); return; }
    if (preview.length > maxLength) { message.error(uiText("Pesan hasil template maksimal {{v0}} karakter.", { v0: maxLength.toLocaleString(uiText.locale) })); return; }
    onApply(preview); setOpen(false);
  };
  const openPicker = () => {
    if (disabled) return;
    setOpen(true); setSelected(undefined); setValues({}); setSearch(""); setQ(""); setPage(1);
  };
  return <>
    {renderTrigger ? renderTrigger(openPicker) : <Button disabled={disabled} onClick={openPicker}>{uiText("Pilih template pesan")}</Button>}
    <Modal title={uiText("Pilih template pesan")} open={open} onCancel={() => setOpen(false)} okText={uiText("Gunakan pesan")} cancelText={uiText("Batal")} onOk={apply} okButtonProps={{ disabled: !selected || disabled }} destroyOnHidden>
      <Space direction="vertical" style={{ width: "100%" }}>
        {api.error && <Alert type="error" message={uiText(api.error)} action={<Button onClick={api.reload}>{uiText("Coba lagi")}</Button>} />}
        <Select style={{ width: "100%" }} showSearch filterOption={false} searchValue={search} onSearch={setSearch} placeholder={uiText("Cari template berdasarkan nama atau isi")} loading={!api.data && !api.error} value={selected?.id}
          options={(api.data?.data || []).map(t => ({ value: t.id, label: t.name }))}
          onChange={id => { const row = api.data?.data.find(t => t.id === id); setSelected(row); setValues({ ...defaults }); }} />
        {!!api.data?.total && <Pagination size="small" current={page} pageSize={20} total={api.data.total} onChange={setPage} />}
        {api.data?.total === 0 && <Typography.Text>{uiText("Belum ada template yang cocok. Buat di menu Template Pesan.")}</Typography.Text>}
        {variables.map(key => <Form.Item key={key} label={uiText("Isi {{{v0}}}", { v0: key })} required style={{ marginBottom: 8 }}><Input maxLength={2000} value={Object.prototype.hasOwnProperty.call(values, key) ? values[key] : ""} onChange={e => setValues(current => ({ ...current, [key]: e.target.value }))} /></Form.Item>)}
        {preserveRecipient && selected && <Typography.Text type="secondary">{preserveVariables ? uiText("Semua variabel akan diisi dari data masing-masing penerima campaign.") : <>{uiText("Variabel")} {"{nama}"}  {uiText("dan")} {"{nomor}"}  {uiText("diisi otomatis untuk setiap penerima campaign.")}</>}</Typography.Text>}
        {selected && <div><strong>{uiText("Pratinjau pesan")}</strong><div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: 12, border: "1px solid #ddd", borderRadius: 8, maxHeight: 240, overflow: "auto" }}>{preview}</div></div>}
      </Space>
    </Modal>
  </>;
}
