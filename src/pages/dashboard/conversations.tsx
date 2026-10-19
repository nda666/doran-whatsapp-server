import { useUiTranslation, type UiTranslator } from "@/lib/uiTranslation";
import { ReactElement, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Alert, Avatar, Badge, Button, Dropdown, Empty, Input, Modal, Pagination, Select, Space, Spin, Tag, Tooltip, message } from "antd";
import { ArrowDownOutlined, ArrowLeftOutlined, AudioOutlined, CopyOutlined, DeleteOutlined, DownOutlined, DownloadOutlined, FileTextOutlined, InboxOutlined, MessageOutlined, PaperClipOutlined, PictureOutlined, PlusOutlined, SendOutlined, SnippetsOutlined, RollbackOutlined } from "@ant-design/icons";
import Image from "next/image";
import axios from "axios";
import { useRouter } from "next/router";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import Layout from "@/components/Layout";
import MessageTemplatePicker from "@/components/MessageTemplatePicker";
import ChatEmojiPicker from "@/components/ChatEmojiPicker";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { insertChatEmoji } from "@/lib/chatEmoji";
import { useDashboardApi } from "@/lib/useDashboardApi";
import { createChatTypingReporter } from "@/lib/chatTyping";
import styles from "@/styles/Conversations.module.css";

type Device = { id: string; name: string; number: string | null; isOnline: boolean; active: number; saveIncomingMessages: boolean };
type Conversation = { id: string; name: string; jid: string; lastMessage: string | null; lastMessageAt: string; unreadCount: number; archived: boolean };
type ChatMessage = { id: string; direction: string; type: string; text: string; status: string; sender: string | null; quotedText: string | null; createdAt: string; mediaUrl: string | null; mediaMime: string | null; mediaName: string | null };
const time = (uiText: UiTranslator, value: string) => new Intl.DateTimeFormat(uiText.locale, { timeZone: "Asia/Jakarta", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
const statusLabel = (uiText: UiTranslator, status: string, at: string) => ({ SENDING: Date.now() - Date.parse(at) > 60000 ? uiText("Status belum pasti") : uiText("Mengirim…"), SENT: uiText("Dikirim ✓"), DELIVERED: uiText("Diterima ✓✓"), READ: uiText("Dibaca ✓✓"), UNCERTAIN: uiText("Status belum pasti"), FAILED: uiText("Gagal dikirim") }[status] || status);

function ConversationPanel({ conversation, device, onChange, onBack }: { conversation: Conversation; device: Device; onChange: () => void; onBack: () => void }) {
  const uiText = useUiTranslation();
  const [rows, setRows] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false), [olderBusy, setOlderBusy] = useState(false);
  const [showJumpLatest, setShowJumpLatest] = useState(false);
  const [text, setText] = useState(""), [file, setFile] = useState<File>();
  const [replyTo, setReplyTo] = useState<ChatMessage>();
  const [busy, setBusy] = useState(false), [sendError, setSendError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false), [deleting, setDeleting] = useState(false);
  const [pending, setPending] = useState<{ requestId: string; text: string; mediaId?: string; replyToId?: string }>();
  const bodyRef = useRef<HTMLDivElement>(null), fileRef = useRef<HTMLInputElement>(null);
  const messageInput = useRef<TextAreaRef>(null), selection = useRef({ start: 0, end: 0 });
  const knownMessageIds = useRef(new Set<string>()), scrollToBottom = useRef(false);
  const historyAnchor = useRef<{ top: number; height: number }>();
  const busyRef = useRef(false), initial = useRef(true), active = useRef(true), lastRead = useRef("");
  const callback = useRef(onChange); callback.current = onChange;
  const [refresh, setRefresh] = useState(0);
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (loading || !body) return;
    if (historyAnchor.current) {
      body.scrollTop = historyAnchor.current.top + body.scrollHeight - historyAnchor.current.height;
      historyAnchor.current = undefined;
      scrollToBottom.current = false;
    } else if (scrollToBottom.current) {
      body.scrollTop = body.scrollHeight;
      scrollToBottom.current = false;
    }
    setShowJumpLatest(body.scrollHeight - body.scrollTop - body.clientHeight > 80);
  }, [rows, loading]);
  const typing = useRef<ReturnType<typeof createChatTypingReporter>>();
  useEffect(() => {
    const clientId = crypto.randomUUID();
    let requests = Promise.resolve();
    const reporter = createChatTypingReporter(value => {
      // Keepalive lets the final pause reach the server when leaving the page.
      requests = requests.then(async () => {
        await fetch(`/api/conversations/${conversation.id}/typing`, { method: "POST", credentials: "same-origin", keepalive: true,
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, typing: value }) });
      }).catch(() => {});
    });
    typing.current = reporter;
    const hide = () => { if (document.hidden) reporter.stop(); };
    const blur = () => reporter.stop();
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", blur);
    window.addEventListener("blur", blur);
    return () => {
      reporter.stop(); typing.current = undefined;
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", blur);
      window.removeEventListener("blur", blur);
    };
  }, [conversation.id]);
  useEffect(() => {
    if (!device.saveIncomingMessages || device.active !== 1 || !device.isOnline || busy || pending) typing.current?.stop();
  }, [device.saveIncomingMessages, device.active, device.isOnline, busy, pending]);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController(); let fetching = false;
    const load = async () => {
      if (fetching || document.hidden) return; fetching = true;
      try {
        const { data } = await axios.get(`/api/conversations/${conversation.id}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        const nearBottom = !bodyRef.current || bodyRef.current.scrollHeight - bodyRef.current.scrollTop - bodyRef.current.clientHeight < 140;
        const hasNewMessage = data.data.some((row: ChatMessage) => !knownMessageIds.current.has(row.id));
        for (const row of data.data) knownMessageIds.current.add(row.id);
        if (initial.current || (hasNewMessage && nearBottom)) scrollToBottom.current = true;
        setRows(previous => {
          const map = new Map(previous.map(row => [row.id, row]));
          for (const row of data.data) map.set(row.id, row);
          return Array.from(map.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
        });
        if (initial.current) setHasMore(data.hasMore);
        initial.current = false; setError("");
        const latest = data.data.at(-1)?.id;
        if (latest && data.conversation.unreadCount && latest !== lastRead.current) {
          await axios.patch(`/api/conversations/${conversation.id}`, { action: "read", through: latest }, { signal: controller.signal });
          lastRead.current = latest; callback.current();
        }
      } catch (e: any) { if (!controller.signal.aborted) setError(e.response?.data?.message || "Pesan belum dapat dimuat. Mencoba menghubungkan kembali…"); }
      finally { fetching = false; if (!controller.signal.aborted) setLoading(false); }
    };
    void load(); const timer = setInterval(load, 3000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [conversation.id, refresh]);

  const older = async () => {
    if (!rows.length || olderBusy) return;
    setOlderBusy(true);
    try {
      const { data } = await axios.get(`/api/conversations/${conversation.id}?before=${rows[0].id}`);
      if (!active.current) return;
      if (bodyRef.current) historyAnchor.current = { top: bodyRef.current.scrollTop, height: bodyRef.current.scrollHeight };
      for (const row of data.data) knownMessageIds.current.add(row.id);
      setRows(current => {
        const map = new Map([...data.data, ...current].map(row => [row.id, row as ChatMessage]));
        return Array.from(map.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      });
      setHasMore(data.hasMore);
    } catch { message.error(uiText("Pesan sebelumnya belum dapat dimuat.")); }
    finally { if (active.current) setOlderBusy(false); }
  };
  const send = async () => {
    if (deleteOpen || deleting || busyRef.current || (!pending && !text.trim() && !file)) return;
    typing.current?.stop();
    busyRef.current = true; setBusy(true); setSendError("");
    const beforeSend = new Set(knownMessageIds.current);
    let submitted = !!pending;
    try {
      let attempt = pending;
      if (!attempt) {
        let mediaId: string | undefined;
        if (file) {
          const form = new FormData(); form.append("file", file);
          const { data } = await axios.post("/api/media", form, { timeout: 60000 });
          mediaId = data.id;
        }
        attempt = { requestId: crypto.randomUUID(), text, ...(mediaId ? { mediaId } : {}), ...(replyTo ? { replyToId: replyTo.id } : {}) };
        setPending(attempt);
      }
      submitted = true;
      const { data } = await axios.post(`/api/conversations/${conversation.id}/send`, attempt, { timeout: 45000 });
      if (!active.current) return;
      if (!beforeSend.has(data.id)) scrollToBottom.current = true;
      knownMessageIds.current.add(data.id);
      setRows(current => [...current.filter(row => row.id !== data.id), data].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)));
      setText(""); setFile(undefined); setPending(undefined); setReplyTo(undefined);
      if (fileRef.current) fileRef.current.value = "";
      if (["UNCERTAIN", "SENDING"].includes(data.status)) setSendError(uiText("Status pesan belum pasti. Periksa riwayat sebelum mengirim ulang."));
      else if (data.status === "FAILED") setSendError(uiText("Pesan tidak dikirim karena pengaturan perangkat berubah."));
      setRefresh(v => v + 1); callback.current();
    } catch (e: any) {
      if (active.current) {
        if (e.response?.status && e.response.status < 500) setPending(undefined);
        setSendError(uiText(e.response?.data?.message || (submitted ? uiText("Koneksi terputus. Klik Periksa status untuk memeriksa kiriman yang sama.") : uiText("Lampiran belum dapat diunggah. Coba lagi."))));
      }
    } finally { busyRef.current = false; if (active.current) setBusy(false); }
  };
  const canSend = device.saveIncomingMessages && device.active === 1 && device.isOnline;
  const deleteConversation = async () => {
    if (deleting || busyRef.current || pending) return;
    setDeleting(true); typing.current?.stop();
    try {
      await axios.delete(`/api/conversations/${conversation.id}`);
      message.success(uiText("Percakapan berhasil dihapus."));
      onChange(); onBack();
    } catch (e: any) {
      if (active.current) message.error(uiText(e.response?.data?.message || uiText("Percakapan belum dapat dihapus. Coba lagi.")));
    } finally { if (active.current) setDeleting(false); }
  };
  return <section className={styles.panel} aria-label={uiText("Isi percakapan")}>
    <Modal title={uiText("Hapus percakapan?")} open={deleteOpen} okText={uiText("Hapus percakapan")} cancelText={uiText("Batal")} okButtonProps={{ danger: true }} confirmLoading={deleting} cancelButtonProps={{ disabled: deleting }} closable={!deleting} maskClosable={!deleting} keyboard={!deleting}
      onCancel={() => { if (!deleting) setDeleteOpen(false); }} onOk={deleteConversation}>
      <p>{uiText("Riwayat pesan dan lampiran percakapan dengan")} <strong>{conversation.name}</strong>  {uiText("akan dihapus permanen dari dashboard.")}</p>
      <p>{uiText("Pesan di WhatsApp tetap ada. Pesan baru yang masuk akan membuat percakapan muncul kembali.")}</p>
    </Modal>
    <header className={styles.chatHeader}>
      <Button className={styles.back} type="text" icon={<ArrowLeftOutlined />} aria-label={uiText("Kembali ke daftar percakapan")} onClick={onBack} />
      <Avatar style={{ background: "#14866b" }}>{conversation.name.slice(0, 1).toUpperCase()}</Avatar>
      <div className={styles.contactTitle}><strong>{conversation.name}</strong><small>{conversation.jid.endsWith("@g.us") ? uiText("Percakapan grup") : conversation.jid.endsWith("@lid") ? uiText("Kontak WhatsApp") : uiText("+{{v0}}", { v0: conversation.jid.split("@")[0] })}</small></div>
      <Tooltip title={conversation.archived ? uiText("Keluarkan dari arsip") : uiText("Arsipkan percakapan")}><Button disabled={deleteOpen || deleting} icon={<InboxOutlined />} aria-label={conversation.archived ? uiText("Keluarkan dari arsip") : uiText("Arsipkan percakapan")} onClick={async () => {
        try { await axios.patch(`/api/conversations/${conversation.id}`, { action: "archive", archived: !conversation.archived }); onChange(); onBack(); }
        catch { message.error(uiText("Percakapan belum dapat diarsipkan.")); }
      }} /></Tooltip>
      <Tooltip title={uiText("Hapus percakapan")}><Button danger icon={<DeleteOutlined />} aria-label={uiText("Hapus percakapan")} disabled={busy || !!pending || deleting} onClick={() => { typing.current?.stop(); setDeleteOpen(true); }} /></Tooltip>
    </header>
    {error && <Alert type="error" showIcon message={uiText(error)} />}
    <div className={styles.messageViewport}>
    <div className={styles.messageArea} ref={bodyRef} role="log" aria-label={uiText("Riwayat pesan")} aria-live="polite"
      onScroll={e => { const body = e.currentTarget; setShowJumpLatest(body.scrollHeight - body.scrollTop - body.clientHeight > 80); }}>
      {loading ? <div className={styles.center}><Spin /></div> : <>
        {hasMore && <div className={styles.center}><Button size="small" loading={olderBusy} onClick={older}>{uiText("Muat pesan sebelumnya")}</Button></div>}
        {rows.map(row => <article key={row.id} className={`${styles.bubble} ${row.direction === "OUT" ? styles.outgoing : styles.incoming}`}>
          <Dropdown trigger={["click"]} placement="bottomRight" menu={{ items: [
            { key: "reply", label: uiText("Balas"), icon: <RollbackOutlined />, disabled: !canSend || busy || !!pending, onClick: () => setReplyTo(row) },
            ...(row.text ? [{ key: "copy", label: uiText("Salin teks"), icon: <CopyOutlined />, onClick: async () => {
              try { await navigator.clipboard.writeText(row.text); message.success(uiText("Teks disalin.")); }
              catch { message.error(uiText("Teks belum dapat disalin.")); }
            } }] : []),
            ...(row.mediaUrl ? [{ key: "download", label: <a href={`${row.mediaUrl}?download=1`} download={row.mediaName || uiText("Lampiran")}>{uiText("Unduh lampiran")}</a>, icon: <DownloadOutlined /> }] : []),
          ] }}>
            <Button className={styles.messageMenu} type="text" size="small" icon={<DownOutlined />} aria-label={uiText("Opsi pesan {{v0}}", { v0: row.text.slice(0, 40) || row.mediaName || uiText("Lampiran") })} />
          </Dropdown>
          {row.direction === "IN" && conversation.jid.endsWith("@g.us") && row.sender && <small className={styles.sender}>{row.sender.split("@")[0]}</small>}
          {row.quotedText && <blockquote className={styles.quote}>{row.quotedText}</blockquote>}
          {row.mediaUrl && (row.type === "image" || row.type === "sticker" ? <a href={row.mediaUrl} target="_blank" rel="noreferrer"><Image unoptimized width={320} height={240} className={styles.image} src={row.mediaUrl} alt={row.mediaName || uiText("Foto masuk")} style={{ height: "auto" }} /></a>
            : row.type === "video" ? <video className={styles.image} src={row.mediaUrl} controls preload="metadata" />
            : row.type === "audio" ? <audio className={styles.audio} src={row.mediaUrl} controls preload="metadata" />
            : <a className={styles.attachment} href={row.mediaUrl} download>{row.mediaName || uiText("Unduh lampiran")}</a>)}
          {row.text && <p className={styles.messageText}>{row.text}</p>}
          <footer className={styles.messageMeta}><time dateTime={row.createdAt}>{time(uiText, row.createdAt)}</time>
            {row.direction === "OUT" && <span className={row.status === "READ" ? styles.read : ["FAILED", "UNCERTAIN"].includes(row.status) ? styles.failed : ""}>{statusLabel(uiText, row.status, row.createdAt)}</span>}
          </footer>
        </article>)}
      </>}
    </div>
    {showJumpLatest && <Tooltip title={uiText("Ke pesan terbaru")} placement="top">
      <Button className={styles.jumpLatest} shape="circle" icon={<ArrowDownOutlined />} aria-label={uiText("Gulir ke pesan terbaru")}
        onClick={() => {
          const body = bodyRef.current;
          if (body) body.scrollTo({ top: body.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        }} />
    </Tooltip>}
    </div>
    {!canSend && <Alert type="warning" showIcon message={uiText(!device.saveIncomingMessages ? uiText("Penyimpanan pesan pada perangkat ini nonaktif. Aktifkan untuk membalas.") : uiText("Perangkat belum terhubung. Hubungkan melalui menu Perangkat HP untuk membalas."))} />}
    {sendError && <Alert closable onClose={() => setSendError("")} type="warning" message={uiText(sendError)} />}
    <div className={styles.composer}>
      {replyTo && <div className={styles.quote}><strong>{uiText("Membalas pesan")}</strong><p className={styles.messageText}>{replyTo.text.slice(0, 200) || uiText("[{{v0}}]", { v0: replyTo.type })}</p><Button size="small" type="text" disabled={busy || !!pending} onClick={() => setReplyTo(undefined)}>{uiText("Batal membalas")}</Button></div>}
      {file && <div className={styles.fileLabel}><PaperClipOutlined /> {file.name}<Button type="text" size="small" disabled={busy || !!pending} onClick={() => { setFile(undefined); if (fileRef.current) fileRef.current.value = ""; }}>{uiText("Hapus")}</Button></div>}
      <div className={styles.composerRow}>
        <input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,audio/mpeg,audio/ogg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain" onChange={e => {
          const selected = e.target.files?.[0];
          if (selected && selected.size > 25 * 1024 * 1024) { message.error(uiText("Lampiran maksimal 25 MB.")); e.target.value = ""; return; }
          setFile(selected);
        }} />
        <MessageTemplatePicker disabled={!canSend || busy || !!pending || deleting || deleteOpen} defaults={{ nama: conversation.name, ...(/^\d+@s\.whatsapp\.net$/.test(conversation.jid) ? { nomor: conversation.jid.split("@")[0] } : {}) }} onApply={value => { setText(value); selection.current = { start: value.length, end: value.length }; }}
          renderTrigger={openTemplate => <Dropdown trigger={["click"]} placement="topLeft" overlayClassName={styles.composerMenu} disabled={!canSend || busy || !!pending || deleting || deleteOpen}
            menu={{ items: [
              { key: "photos", label: uiText("Foto & video"), icon: <PictureOutlined className={styles.menuPhoto} /> },
              { key: "document", label: uiText("Dokumen"), icon: <FileTextOutlined className={styles.menuDocument} /> },
              { key: "audio", label: uiText("Audio"), icon: <AudioOutlined className={styles.menuAudio} /> },
              { type: "divider" },
              { key: "template", label: uiText("Template pesan"), icon: <SnippetsOutlined className={styles.menuTemplate} /> },
            ], onClick: ({ key }) => {
              if (key === "template") { openTemplate(); return; }
              const input = fileRef.current;
              if (!input) return;
              input.accept = key === "photos" ? "image/jpeg,image/png,image/gif,image/webp,video/mp4"
                : key === "audio" ? "audio/mpeg,audio/ogg" : ".pdf,.doc,.docx,.xlsx,.txt";
              input.click();
            } }}>
            <Button className={styles.addButton} type="text" shape="circle" icon={<PlusOutlined />} aria-label={uiText("Tambah ke pesan")} title={uiText("Tambah lampiran atau template")} disabled={!canSend || busy || !!pending || deleting || deleteOpen} />
          </Dropdown>} />
        <ChatEmojiPicker disabled={!canSend || busy || !!pending || deleting || deleteOpen} onOpen={() => {
          const input = messageInput.current?.resizableTextArea?.textArea;
          if (input) selection.current = { start: input.selectionStart, end: input.selectionEnd };
        }} onSelect={emoji => {
          if (!canSend || busy || pending || deleting || deleteOpen) return false;
          const result = insertChatEmoji(text, emoji, selection.current.start, selection.current.end);
          if (!result) { message.warning(uiText("Pesan maksimal 10.000 karakter. Hapus sebagian teks sebelum menambah emoji.")); return false; }
          setText(result.text); selection.current = { start: result.caret, end: result.caret };
          requestAnimationFrame(() => {
            const input = messageInput.current?.resizableTextArea?.textArea;
            input?.focus({ preventScroll: true }); input?.setSelectionRange(result.caret, result.caret);
          });
          return true;
        }} />
        <Input.TextArea ref={messageInput} value={text} onSelect={e => { selection.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd }; }} onChange={e => { setText(e.target.value); selection.current = { start: e.target.selectionStart, end: e.target.selectionEnd }; typing.current?.input(!!e.target.value.trim()); }} onBlur={() => typing.current?.stop()} autoSize={{ minRows: 1, maxRows: 5 }} maxLength={10000} placeholder={uiText("Tulis pesan…")} aria-label={uiText("Tulis balasan")} disabled={busy || !!pending || !canSend} onPressEnter={e => {
          if (!e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
        }} />
        <Button className={styles.sendButton} type="primary" icon={<SendOutlined />} aria-label={pending && !busy ? uiText("Periksa status pengiriman") : uiText("Kirim pesan")} loading={busy} disabled={!pending && (!canSend || (!text.trim() && !file))} onClick={send}>{pending && !busy ? uiText("Periksa status") : <span className={styles.sendLabel}>{uiText("Kirim")}</span>}</Button>
      </div>
      <small className={styles.hint}>{uiText("Waktu dalam WIB · Enter untuk kirim · Shift+Enter untuk baris baru")}</small>
    </div>
  </section>;
}

export default function Conversations() {
  const uiText = useUiTranslation();
  const router = useRouter();
  const devices = useDashboardApi("/api/phones?options=1", 10000);
  const [phoneId, setPhoneId] = useState<string>();
  const [selected, setSelected] = useState<Conversation>();
  const [search, setSearch] = useState(""), [query, setQuery] = useState(""), [archived, setArchived] = useState(false), [page, setPage] = useState(1);
  const [enabling, setEnabling] = useState(false);
  const device: Device | undefined = devices.data?.find((d: Device) => d.id === phoneId);
  const api = useDashboardApi(phoneId ? `/api/conversations?phone_id=${phoneId}&q=${encodeURIComponent(query)}&archived=${archived ? 1 : 0}&page=${page}` : "", 3000);
  useEffect(() => {
    if (!devices.data?.length || phoneId) return;
    const requested = typeof router.query.phone_id === "string" ? router.query.phone_id : undefined;
    setPhoneId(devices.data.find((d: Device) => d.id === requested)?.id || devices.data.find((d: Device) => d.saveIncomingMessages)?.id || devices.data[0].id);
  }, [devices.data, router.query.phone_id, phoneId]);
  useEffect(() => { const timer = setTimeout(() => { setQuery(search); setPage(1); }, 300); return () => clearTimeout(timer); }, [search]);
  return <div className={styles.page}>
    <div className={styles.toolbar}>
      <div><h1>{uiText("Percakapan")}</h1><p>{uiText("Baca pesan masuk dan balas langsung dari nomor perangkat Anda.")}</p></div>
      <div className={styles.devicePicker}><label htmlFor="chat-device">{uiText("Perangkat WhatsApp")}</label><Select id="chat-device" showSearch optionFilterProp="label" placeholder={uiText("Pilih perangkat")} value={phoneId} loading={!devices.data && !devices.error} style={{ width: "100%" }}
        options={(devices.data || []).map((d: Device) => ({ value: d.id, label: uiText("{{v0}} · {{v1}}", { v0: d.name, v1: d.number || uiText("Belum tertaut") }) }))}
        onChange={value => { setPhoneId(value); setSelected(undefined); setPage(1); setSearch(""); void router.replace({ pathname: router.pathname, query: { phone_id: value } }, undefined, { shallow: true }); }} /></div>
    </div>
    {(devices.error || api.error) && <Alert type="error" showIcon message={uiText(devices.error || api.error)} action={<Button onClick={() => { devices.reload(); api.reload(); }}>{uiText("Coba lagi")}</Button>} />}
    {device && !device.saveIncomingMessages && <Alert type="info" showIcon message={uiText("Simpan Pesan Masuk belum aktif pada perangkat ini.")}
      description={uiText("Aktifkan untuk menyimpan pesan baru dan membalas melalui menu ini. Pesan lama sebelum diaktifkan tidak ikut diambil.")}
      action={<Button loading={enabling} onClick={async () => {
        setEnabling(true);
        try { await axios.post("/api/phones", { id: device.id, name: device.name, saveIncomingMessages: true }); devices.reload(); api.reload(); message.success(uiText("Simpan Pesan Masuk aktif.")); }
        catch { message.error(uiText("Pengaturan belum tersimpan.")); } finally { setEnabling(false); }
      }}>{uiText("Aktifkan penyimpanan")}</Button>} />}
    <div className={`${styles.workspace} ${selected ? styles.hasSelection : ""}`}>
      <aside className={styles.listPane} aria-label={uiText("Daftar percakapan")}>
        <div className={styles.listTools}><Input.Search allowClear placeholder={uiText("Cari nama, nomor, atau isi pesan")} aria-label={uiText("Cari percakapan")} value={search} onChange={e => setSearch(e.target.value)} />
          <Space><Button size="small" type={!archived ? "primary" : "default"} onClick={() => { setArchived(false); setPage(1); setSelected(undefined); }}>{uiText("Semua")}</Button><Button size="small" type={archived ? "primary" : "default"} icon={<InboxOutlined />} onClick={() => { setArchived(true); setPage(1); setSelected(undefined); }}>{uiText("Arsip")}</Button>{device && <Tag color={device.isOnline ? "green" : "default"}>{device.isOnline ? uiText("Terhubung") : uiText("Offline")}</Tag>}</Space>
        </div>
        <div className={styles.conversationList}>
          {!api.data && phoneId && !api.error ? <div className={styles.center}><Spin /></div> : !api.data?.data?.length ? <div className={styles.center}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={query ? uiText("Percakapan tidak ditemukan") : uiText("Belum ada percakapan tersimpan")} /></div> : api.data.data.map((c: Conversation) => <button key={c.id} type="button" className={`${styles.conversation} ${selected?.id === c.id ? styles.selected : ""}`} onClick={() => setSelected(c)}>
            <Avatar style={{ background: "#14866b", flexShrink: 0 }}>{c.name.slice(0, 1).toUpperCase()}</Avatar>
            <div className={styles.conversationText}><div className={styles.listLine}><strong>{c.name}</strong><time>{time(uiText, c.lastMessageAt)}</time></div><div className={styles.listLine}><span>{c.lastMessage || uiText("Lampiran")}</span><Badge count={c.unreadCount} overflowCount={99} color="#14866b" /></div></div>
          </button>)}
        </div>
        {!!api.data?.total && <div className={styles.pagination}><Pagination size="small" simple current={page} pageSize={40} total={api.data.total} onChange={setPage} /></div>}
      </aside>
      {selected && device ? <ConversationPanel key={selected.id} conversation={selected} device={device} onChange={api.reload} onBack={() => setSelected(undefined)} />
        : <section className={styles.emptyPane}><MessageOutlined /><h2>{uiText("Percakapan Anda")}</h2><p>{uiText("Pilih percakapan untuk membaca dan membalas pesan.")}</p><small>{uiText("Pesan mulai tersimpan setelah Simpan Pesan Masuk diaktifkan pada perangkat.")}</small></section>}
    </div>
  </div>;
}
Conversations.getLayout = (page: ReactElement) => <Layout title="PERCAKAPAN">{page}</Layout>;
export const getStaticProps = async ({ locale }: { locale: string }) => ({ props: { ...(await serverSideTranslations(locale, ["common", "upgrade", "interface"])) } });
