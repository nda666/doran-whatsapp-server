import { Form, Switch, TimePicker, Typography } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useUiTranslation } from "@/lib/uiTranslation";
import styles from "@/styles/OperatingHoursFields.module.css";

// Keep form/API values as HH:mm strings while the picker works with Dayjs.
const timeFieldProps = {
  getValueProps: (value?: string) => ({ value: value ? dayjs(`2000-01-01T${value}:00`) : null }),
  getValueFromEvent: (value: Dayjs | null) => value ? value.format("HH:mm") : "",
};

export default function OperatingHoursFields({ name, stackedToggle = false }: { name: string; stackedToggle?: boolean }) {
  const uiText = useUiTranslation();
  const form = Form.useFormInstance();
  const enabled = Form.useWatch([name, "enabled"], form);
  const timeRules = [{ required: true, message: uiText("Isi jam dalam format HH:mm.") },
    { pattern: /^([01]\d|2[0-3]):[0-5]\d$/, message: uiText("Gunakan jam 00:00–23:59.") }];
  return <div className={styles.fields}>
    <Form.Item className={`${styles.toggle}${stackedToggle ? ` ${styles.stackedToggle}` : ""}`} name={[name, "enabled"]} label={uiText("Batasi jam pengiriman")} valuePropName="checked"><Switch checkedChildren={uiText("Aktif")} unCheckedChildren={uiText("24 jam")} /></Form.Item>
    <div className={styles.timeRange}>
      <Form.Item {...timeFieldProps} name={[name, "start"]} label={uiText("Jam mulai (WIB)")} rules={timeRules}><TimePicker format="HH:mm" use12Hours={false} allowClear={false} disabled={!enabled} style={{ width: "100%" }} /></Form.Item>
      <Form.Item {...timeFieldProps} name={[name, "end"]} label={uiText("Jam selesai (WIB)")} dependencies={[[name, "start"], [name, "enabled"]]} rules={[...timeRules,
        { validator: (_, value) => !form.getFieldValue([name, "enabled"]) || value !== form.getFieldValue([name, "start"]) ? Promise.resolve() : Promise.reject(new Error(uiText("Jam mulai dan selesai harus berbeda."))) },
      ]}><TimePicker format="HH:mm" use12Hours={false} allowClear={false} disabled={!enabled} style={{ width: "100%" }} /></Form.Item>
    </div>
    <Typography.Paragraph className={styles.help} type="secondary">{uiText("Berlaku setiap hari dalam WIB, hingga sebelum jam selesai. Jadwal 22:00–06:00 melewati tengah malam. Matikan pembatasan untuk pengiriman 24 jam.")}</Typography.Paragraph>
  </div>;
}
