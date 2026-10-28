import { DEFAULT_WARMUP_DAILY_LIMITS, parseWarmupDailyLimits } from "@/lib/warmupSettings";
import SettingToggle from "./SettingToggle";
import { useUiTranslation } from "@/lib/uiTranslation";
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { Alert, Button, Form, FormInstance, Input, Modal, Radio, Switch } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";
import { useLocalizedTranslation as useTranslation } from "@/lib/uiTranslation";
import { parsePhoneNumber } from "libphonenumber-js";
import { PhoneFormField, parsePhoneFormFields } from "@/lib/phoneFormFields";
import { Phone } from "@prisma/client";
import { telegramUnsupportedSettings, type MessagingChannel } from "@/lib/messagingChannel";

export interface PhoneFormModalRef {
  resetForm: () => void;
}

export type PhoneFormData = {
  id?: string;
  channel?: MessagingChannel;
  name: string;
  is_save_group?: boolean;
  webhookUrl?: string | null;
  readReceipt?: boolean;
  rejectCall?: boolean;
  showOnline?: boolean;
  showTyping?: boolean;
  autoReplyEnabled?: boolean;
  saveIncomingMessages?: boolean;
  warmupEnabled?: boolean;
};

interface CollectionCreateFormProps {
  open: boolean;
  onSubmit: (values: PhoneFormData) => void;
  onCancel: () => void;
  title?: string;
  loading?: boolean;
  editPhone?: Phone | undefined;
}

const PhoneFormModal = forwardRef<PhoneFormModalRef, CollectionCreateFormProps>(
  ({ open, onSubmit, onCancel, editPhone, ...props }, ref) => {
  const uiText = useUiTranslation();
    const { t } = useTranslation("common");
    const [form] = Form.useForm();
    const channel = Form.useWatch("channel", form) || editPhone?.channel || "whatsapp";
    const telegram = channel === "telegram";
    const [visibleFields, setVisibleFields] = useState<PhoneFormField[]>([]);
    const [warmupLimits, setWarmupLimits] = useState(DEFAULT_WARMUP_DAILY_LIMITS);
    const [warmupStartedAt, setWarmupStartedAt] = useState<string | null>(null);
    const [fieldsReady, setFieldsReady] = useState(false);
    const [fieldsError, setFieldsError] = useState("");
    const [fieldsVersion, setFieldsVersion] = useState(0);
    useEffect(() => {
      if (!open) return;
      const controller = new AbortController();
      setFieldsReady(false); setFieldsError("");
      void (async () => {
        try {
          const response = await fetch("/api/phones/form-fields", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
          if (!response.ok) throw new Error();
          const data = await response.json();
          const fields = parsePhoneFormFields(JSON.stringify(data.fields));
          const limits = Array.isArray(data.warmupLimits) ? parseWarmupDailyLimits(data.warmupLimits.join(",")) : null;
          if (!fields || !limits) throw new Error();
          let startedAt: string | null = null;
          if (editPhone) {
            const policyResponse = await fetch("/api/device-policies", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
            if (!policyResponse.ok) throw new Error();
            const policies = await policyResponse.json();
            const policy = policies.find((item: { id: string }) => item.id === editPhone.id);
            if (!policy) throw new Error();
            startedAt = policy.warmupStartedAt;
          }
          if (!controller.signal.aborted) {
            setWarmupLimits(limits);
            setWarmupStartedAt(startedAt);
            form.setFieldValue("warmupEnabled", !!startedAt);
            setVisibleFields(fields); setFieldsReady(true);
          }
        } catch { if (!controller.signal.aborted) setFieldsError("Pengaturan form belum dapat dimuat."); }
      })();
      return () => controller.abort();
    }, [open, fieldsVersion, editPhone, form]);
    useEffect(() => {
      if (editPhone) {
        form.setFieldValue("id", editPhone.id);
        form.setFieldValue("channel", editPhone.channel || "whatsapp");
        form.setFieldValue("name", editPhone.name);
        form.setFieldValue("autoReplyEnabled", editPhone.autoReplyEnabled);
        form.setFieldValue("saveIncomingMessages", editPhone.saveIncomingMessages);
        form.setFieldsValue({ webhookUrl: editPhone.webhookUrl, readReceipt: editPhone.readReceipt, rejectCall: editPhone.rejectCall, showOnline: editPhone.showOnline, showTyping: editPhone.showTyping });
      }
      return () => {
        form.resetFields();
      };
    }, [editPhone, form]);

    const resetForm = () => {
      form.resetFields();
    };
    useImperativeHandle(ref, () => ({
      resetForm,
    }));
    return (
      <Modal
        className="device-settings-modal"
        width={640}
        open={open}
        title={props.title || t(editPhone ? "edit_device" : "add_device")}
        okText={t("save")}
        cancelText={t("cancel")}
        onCancel={onCancel}
        okButtonProps={{
          loading: props?.loading || (!fieldsReady && !fieldsError),
          disabled: !fieldsReady,
        }}
        cancelButtonProps={{
          disabled: props?.loading,
        }}
        onOk={() => {
          if (!fieldsReady) return;
          form
            ?.validateFields()
            .then((values) => {
              const submitted = { ...values };
              if (telegram) {
                for (const key of telegramUnsupportedSettings) delete submitted[key];
                delete submitted.webhookUrl;
              }
              for (const key of ["saveIncomingMessages", "autoReplyEnabled", "readReceipt", "rejectCall", "showOnline", "showTyping"] as PhoneFormField[]) {
                if (!visibleFields.includes(key)) delete submitted[key];
              }
              onSubmit(submitted);
            })
            .catch((info) => {});
        }}
      >
        {fieldsError && <Alert type="error" showIcon message={uiText(fieldsError)} action={<Button onClick={() => setFieldsVersion(value => value + 1)}>{uiText("Coba lagi")}</Button>} />}
        <Form
          disabled={props?.loading || !fieldsReady}
          form={form}
          layout="vertical"
          name="phone-form"
          initialValues={{ channel: "whatsapp", warmupEnabled: false, modifier: "public", showOnline: true, readReceipt: false, rejectCall: false, showTyping: false, autoReplyEnabled: false, saveIncomingMessages: false }}
        >
          <Form.Item name="id" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="channel" label={uiText("Kanal pengiriman")} rules={[{ required: true }]}>
            <Radio.Group disabled={!!editPhone} options={[{ value: "whatsapp", label: "WhatsApp" }, { value: "telegram", label: "Telegram" }]} />
          </Form.Item>
          {telegram && <Alert type="info" showIcon style={{ marginBottom: 16 }} message={uiText("Telegram menggunakan API provider server, tanpa scan QR. Kuota, jeda, jam operasional, pause, dan pemanasan mengikuti pengaturan pengiriman yang sama. Provider saat ini mendukung teks dan gambar; fitur sesi dan pesan masuk belum tersedia.")} />}
          <Form.Item
            name="name"
            label={t("phone_label")}
            rules={[
              {
                required: true,
                message: t("validation.required", {
                  field: t("phone_label"),
                }).toString(),
              },
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item hidden={telegram} name="webhookUrl" label={uiText("Webhook URL")}
            tooltip={{
              title: uiText("Meneruskan data pesan WhatsApp yang masuk ke aplikasi atau sistem lain melalui URL ini. Tetap berjalan meski Balasan Otomatis nonaktif. Balasan ke customer perlu diatur di sistem penerima. Kosongkan jika tidak digunakan."),
              icon: <InfoCircleOutlined tabIndex={0} aria-label={uiText("Informasi Webhook URL")} />,
              trigger: ["hover", "focus", "click"],
            }}><Input placeholder="https://..." /></Form.Item>
          <div className="device-settings-list">
            <SettingToggle name="warmupEnabled" label={uiText("Pemanasan nomor")}
              description={<>
                <div>{uiText("Batasi pengiriman bertahap: {{v0}} percobaan per hari, masing-masing selama dua hari, lalu mengikuti kuota perangkat. Kuota perangkat tetap menjadi batas maksimum.", { v0: warmupLimits.join(" → ") })}</div>
                {fieldsReady && warmupStartedAt && <p className="device-setting-note">{uiText("Pemanasan aktif sejak {{v0}}. Tetap aktif tidak mengulang tanggal mulai. Matikan lalu Simpan untuk mengakhiri pemanasan.", { v0: new Date(warmupStartedAt).toLocaleDateString("en-GB", { timeZone: "Asia/Jakarta" }) })}</p>}
                {fieldsReady && warmupStartedAt && <p className="device-setting-note">{uiText("Untuk kembali ke tahap pertama, gunakan Aksi → Ulangi pemanasan pada daftar perangkat. Pemakaian kuota hari ini dan status jeda tetap berlaku.")}</p>}
              </>} />
            <SettingToggle hidden={telegram || !fieldsReady || !visibleFields.includes("saveIncomingMessages")} name="saveIncomingMessages" label={uiText("Simpan Pesan Masuk")}
              description={uiText("Simpan pesan baru agar bisa dibaca dan dibalas melalui menu Percakapan. Pesan lama sebelum fitur aktif tidak ikut diambil.")} />
            <SettingToggle hidden={telegram || !fieldsReady || !visibleFields.includes("autoReplyEnabled")} name="autoReplyEnabled" label={uiText("Aktifkan Balasan Otomatis")}
              description={uiText("Jika dinonaktifkan, semua aturan balasan pada perangkat ini tidak akan dijalankan.")} />
            <SettingToggle hidden={telegram || !fieldsReady || !visibleFields.includes("readReceipt")} name="readReceipt" label={uiText("Read receipt")}
              description={uiText("Jika aktif, server otomatis menandai pesan masuk sebagai sudah dibaca. Customer dapat melihat centang biru sesuai pengaturan privasi WhatsApp. Jika nonaktif, server tidak otomatis menandainya sebagai dibaca; membuka chat di HP tetap dapat menandainya sebagai dibaca.")} />
            <SettingToggle hidden={telegram || !fieldsReady || !visibleFields.includes("rejectCall")} name="rejectCall" label={uiText("Tolak panggilan")} />
            <SettingToggle hidden={telegram || !fieldsReady || !visibleFields.includes("showOnline")} name="showOnline" label={uiText("Tampilkan online (berlaku setelah reconnect)")} />
            <SettingToggle hidden={telegram || !fieldsReady || !visibleFields.includes("showTyping")} name="showTyping" label={uiText("Tampilkan typing saat mengirim")} />
          </div>
        </Form>
      </Modal>
    );
  }
);
PhoneFormModal.displayName = "PhoneFormModal";
export default PhoneFormModal;
