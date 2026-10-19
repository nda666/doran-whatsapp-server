import { useUiTranslation } from "@/lib/uiTranslation";
import FilterSelect from "@/components/FilterSelect";
import { Button, Card, Form, Input } from "antd";
import { useLocalizedTranslation as useTranslation } from "@/lib/uiTranslation";
import type { PhoneSearchState } from "@/lib/phoneSearchState";
export default function SearchPhoneForm({ onSubmitSuccess, visible, initialValues }: { onSubmitSuccess: (values: PhoneSearchState["filters"]) => void; visible: boolean; initialValues?: PhoneSearchState["filters"] }) {
  const uiText = useUiTranslation();
  const { t } = useTranslation("common");
  if (!visible) return null;
  return <Card title={uiText("Pencarian")}><Form key={JSON.stringify(initialValues)} initialValues={initialValues} layout="vertical" colon={false} className="dashboard-filter-grid" onFinish={onSubmitSuccess}>
    <Form.Item name="name" label={uiText("Label / Nama Akun WA")}><Input allowClear placeholder={uiText("Cari label atau nama akun WA")} /></Form.Item>
    <Form.Item name="number" label={t("number")}><Input allowClear placeholder={uiText("Cari nomor perangkat")} /></Form.Item>
    <Form.Item name="is_online" label={uiText("Koneksi")}><FilterSelect allLabel={uiText("Semua koneksi")} options={[{ value: "1", label: uiText("Online") }, { value: "0", label: uiText("Offline") }]} /></Form.Item>
    <Form.Item name="active" label={uiText("Status perangkat")}><FilterSelect allLabel={uiText("Semua status")} options={[{ value: "1", label: uiText("Aktif") }, { value: "0", label: uiText("Tidak aktif") }]} /></Form.Item>
    <div className="dashboard-filter-actions"><Button type="primary" htmlType="submit">{uiText("Cari")}</Button></div>
  </Form></Card>;
}
