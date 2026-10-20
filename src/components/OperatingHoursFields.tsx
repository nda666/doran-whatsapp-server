import { Form, Input, Switch, Typography } from "antd";
import { useUiTranslation } from "@/lib/uiTranslation";

export default function OperatingHoursFields({ name }: { name: string }) {
  const uiText = useUiTranslation();
  const form = Form.useFormInstance();
  const enabled = Form.useWatch([name, "enabled"], form);
  const timeRules = [{ required: true, message: uiText("Isi jam dalam format HH:mm.") },
    { pattern: /^([01]\d|2[0-3]):[0-5]\d$/, message: uiText("Gunakan jam 00:00–23:59.") }];
  return <>
    <Form.Item name={[name, "enabled"]} label={uiText("Batasi jam pengiriman")} valuePropName="checked"><Switch checkedChildren={uiText("Aktif")} unCheckedChildren={uiText("24 jam")} /></Form.Item>
    <Form.Item name={[name, "start"]} label={uiText("Jam mulai (WIB)")} rules={timeRules}><Input type="time" step={60} disabled={!enabled} /></Form.Item>
    <Form.Item name={[name, "end"]} label={uiText("Jam selesai (WIB)")} dependencies={[[name, "start"], [name, "enabled"]]} rules={[...timeRules,
      { validator: (_, value) => !form.getFieldValue([name, "enabled"]) || value !== form.getFieldValue([name, "start"]) ? Promise.resolve() : Promise.reject(new Error(uiText("Jam mulai dan selesai harus berbeda."))) },
    ]}><Input type="time" step={60} disabled={!enabled} /></Form.Item>
    <Typography.Paragraph type="secondary">{uiText("Berlaku setiap hari dalam WIB. Jam selesai tidak termasuk waktu pengiriman. Contoh 22:00–06:00 berarti sampai pukul 06:00 hari berikutnya. Matikan pembatasan untuk pengiriman 24 jam.")}</Typography.Paragraph>
  </>;
}
