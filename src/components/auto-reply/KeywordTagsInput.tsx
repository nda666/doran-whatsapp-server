import { useUiTranslation } from "@/lib/uiTranslation";
import { useState } from "react";
import { Button, Input, Space, Tag } from "antd";
import { CloseOutlined } from "@ant-design/icons";

type Props = {
  id?: string;
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
};

// Keep the existing API/storage format, including keywords containing commas.
export default function KeywordTagsInput({ id, value = "", onChange, disabled }: Props) {
  const uiText = useUiTranslation();
  const [draft, setDraft] = useState("");
  const keywords = value.split("|").map(word => word.trim()).filter(Boolean);

  const addDraft = () => {
    const next = [...keywords];
    for (const word of draft.split("|").map(word => word.trim()).filter(Boolean)) {
      if (!next.some(existing => existing.toLowerCase() === word.toLowerCase())) next.push(word);
    }
    if (draft.trim()) onChange?.(next.join("|"));
    setDraft("");
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <div style={{ textAlign: "right" }}>
        <Button size="small" danger htmlType="button" disabled={disabled || (!keywords.length && !draft.trim())}
          onClick={() => { setDraft(""); onChange?.(""); }}>
          {uiText("Hapus semua tag")}</Button>
      </div>
      {keywords.length > 0 && <Space wrap size={[4, 4]}>
        {keywords.map((word, index) => <Tag key={`${index}:${word}`} style={{ marginInlineEnd: 0, whiteSpace: "normal", overflowWrap: "anywhere", maxWidth: "100%" }}>
          {word}
          <Button type="text" size="small" htmlType="button" disabled={disabled}
            aria-label={uiText("Hapus kata kunci {{v0}}", { v0: word })} icon={<CloseOutlined />}
            onClick={() => onChange?.(keywords.filter((_, position) => position !== index).join("|"))} />
        </Tag>)}
      </Space>}
      <Input id={id} value={draft} disabled={disabled} placeholder={uiText("Ketik kata kunci")}
        onChange={event => setDraft(event.target.value)} onBlur={addDraft}
        onKeyDown={event => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          event.stopPropagation();
          if (!event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) addDraft();
        }} />
    </Space>
  );
}
