import { Form, Switch } from "antd";
import { ReactNode, useId } from "react";
import { useUiTranslation } from "@/lib/uiTranslation";

/** Keep each setting's explanation beside its control, including on small screens. */
export default function SettingToggle({ name, label, description, hidden, onLabel, offLabel }: {
  name: string; label: string; description?: ReactNode; hidden?: boolean; onLabel?: string; offLabel?: string;
}) {
  const uiText = useUiTranslation();
  const checked = Form.useWatch(name);
  const id = `setting-${useId()}-${name}`;
  return <div className="device-setting-row" hidden={hidden}>
    <div className="device-setting-copy">
      <label htmlFor={id}>{label}</label>
      {description && <div id={`${id}-help`} className="device-setting-help">{description}</div>}
    </div>
    <div className="device-setting-control">
      <Form.Item name={name} valuePropName="checked" noStyle>
        <Switch id={id} aria-label={label} aria-describedby={description ? `${id}-help` : undefined} />
      </Form.Item>
      <span className="device-setting-state">{checked ? onLabel || uiText("Aktif") : offLabel || uiText("Tidak aktif")}</span>
    </div>
  </div>;
}
