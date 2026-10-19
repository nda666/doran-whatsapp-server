import { useUiTranslation } from "@/lib/uiTranslation";
import { useEffect, useState } from "react";
import { Button, Empty, Input, Popover, Space } from "antd";
import { SmileOutlined } from "@ant-design/icons";
import { chatEmojiGroups } from "@/lib/chatEmoji";
import styles from "@/styles/ChatEmojiPicker.module.css";

export default function ChatEmojiPicker({ disabled, onOpen, onSelect }: { disabled: boolean; onOpen: () => void; onSelect: (emoji: string) => boolean }) {
  const uiText = useUiTranslation();
  const [open, setOpen] = useState(false), [query, setQuery] = useState(""), [group, setGroup] = useState("Semua");
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  const search = query.trim().toLocaleLowerCase(uiText.locale);
  const items = chatEmojiGroups.filter(item => group === "Semua" || item.name === group).flatMap(item => item.items)
    .filter(([emoji, label]) => !search || label.includes(search) || uiText(label).toLocaleLowerCase(uiText.locale).includes(search) || emoji.includes(search));
  return <Popover trigger="click" placement="top" autoAdjustOverflow open={open && !disabled} onOpenChange={value => { if (!disabled) { if (value) { onOpen(); setQuery(""); setGroup("Semua"); } setOpen(value); } }}
    content={<section className={styles.panel} aria-label={uiText("Pilihan emoji")}>
      <div className={styles.heading}><strong>{uiText("Pilih emoji")}</strong><Button type="text" size="small" onClick={() => setOpen(false)} aria-label={uiText("Tutup pilihan emoji")}>{uiText("Tutup")}</Button></div>
      <Input.Search aria-label={uiText("Cari emoji")} placeholder={uiText("Cari: senyum, terima kasih, paket…")} allowClear value={query} onChange={e => setQuery(e.target.value)} />
      <Space wrap size={4} className={styles.groups}>{["Semua", ...chatEmojiGroups.map(item => item.name)].map(name => <Button key={name} size="small" type={group === name ? "primary" : "text"} aria-pressed={group === name} onClick={() => setGroup(name)}>{uiText(name)}</Button>)}</Space>
      <div className={styles.grid} role="group" aria-label={uiText("Daftar emoji")}>
        {items.map(([emoji, label]) => <button key={emoji} type="button" className={styles.emoji} title={uiText(label)} aria-label={`${emoji} ${uiText(label)}`} disabled={disabled} onClick={() => { if (!disabled && onSelect(emoji)) setOpen(false); }}>{emoji}</button>)}
      </div>
      {!items.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={uiText("Emoji tidak ditemukan. Coba kata lain.")} />}
      <small className={styles.note}>{uiText("Dikirim sebagai emoji Unicode. Tampilannya dapat berbeda di tiap perangkat.")}</small>
    </section>}>
    <Button type="text" shape="circle" className={styles.trigger} icon={<SmileOutlined />} aria-label={uiText("Sisipkan emoji")} title={uiText("Sisipkan emoji")} disabled={disabled} />
  </Popover>;
}
