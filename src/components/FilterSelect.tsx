import { Select } from "antd";
import type { SelectProps } from "antd";

type FilterSelectProps = Omit<SelectProps<string>, "mode" | "labelInValue"> & {
  allLabel: string;
};

export default function FilterSelect({
  allLabel,
  options = [],
  value,
  onChange,
  ...props
}: FilterSelectProps) {
  return (
    <Select<string>
      {...props}
      allowClear
      value={value ?? ""}
      options={[{ value: "", label: allLabel }, ...options]}
      optionFilterProp="label"
      filterOption={(input, option) =>
        option?.value === "" ||
        String(option?.label ?? "").toLowerCase().includes(input.toLowerCase())
      }
      onChange={(nextValue, option) => onChange?.(nextValue ?? "", option)}
    />
  );
}
