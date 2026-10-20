import { useUiTranslation } from "@/lib/uiTranslation";
import FilterSelect from "@/components/FilterSelect";
import { Button, Card, Form, Input } from "antd";
import { useLocalizedTranslation as useTranslation } from "@/lib/uiTranslation";
import type { PhoneSearchState } from "@/lib/phoneSearchState";
import { useDashboardApi } from "@/lib/useDashboardApi";
export default function SearchPhoneForm({ onSubmitSuccess, visible, initialValues }: { onSubmitSuccess: (values: PhoneSearchState["filters"]) => void; visible: boolean; initialValues?: PhoneSearchState["filters"] }) {
  const uiText = useUiTranslation();
  const { t } = useTranslation("common");
  const groups = useDashboardApi<{ id: string; name: string; enabled: boolean }[]>("/api/phones?sender_group_options=1", 10000);
  if (!visible) return null;
  return <Card title={uiText("Pencarian")}><Form key={JSON.stringify(initialValues)} initialValues={initialValues} layout="vertical" colon={false} className="dashboard-filter-grid" onFinish={onSubmitSuccess}>
    <Form.Item name="name" label={uiText("Label / Nama Akun WA")}><Input allowClear placeholder={uiText("Cari label atau nama akun WA")} /></Form.Item>
    <Form.Item name="number" label={t("number")}><Input allowClear placeholder={uiText("Cari nomor perangkat")} /></Form.Item>
    <Form.Item name="sender_group" label={uiText("Grup pengirim")} help={groups.error ? uiText(groups.error) : undefined} validateStatus={groups.error ? "warning" : undefined}><FilterSelect showSearch loading={!groups.data && !groups.error} allLabel={uiText("Semua grup")} options={[{ value: "none", label: uiText("Tanpa grup") }, ...(groups.data || []).map(group => ({ value: group.id, label: `${group.name}${group.enabled ? "" : ` (${uiText("Tidak aktif")})`}` }))]} /></Form.Item>
    <Form.Item name="is_online" label={uiText("Koneksi")}><FilterSelect allLabel={uiText("Semua koneksi")} options={[{ value: "1", label: uiText("Online") }, { value: "0", label: uiText("Offline") }]} /></Form.Item>
    <Form.Item name="active" label={uiText("Status perangkat")}><FilterSelect allLabel={uiText("Semua status")} options={[{ value: "1", label: uiText("Aktif") }, { value: "0", label: uiText("Tidak aktif") }]} /></Form.Item>
    <div className="dashboard-filter-actions"><Button type="primary" htmlType="submit">{uiText("Cari")}</Button></div>
  </Form></Card>;
}
