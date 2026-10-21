import SettingToggle from "./SettingToggle";
import { useUiTranslation, type UiTranslator } from "@/lib/uiTranslation";
import { useMemo, useRef, useState } from "react";
import { Alert, Button, Collapse, Form, InputNumber, Modal, Progress, Select, Space, Switch, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import axios from "axios";
import dayjs from "dayjs";
import { useDashboardApi } from "@/lib/useDashboardApi";
import type { PhoneRow } from "@/lib/usePhoneData";
import type { TableState } from "@/lib/useTableState";
import type { PhonePolicySort } from "@/lib/phonePolicySort";
import { deviceSendIntervalRange } from "@/lib/deviceSendInterval";
import OperatingHoursFields from "../OperatingHoursFields";
import { operatingHoursLabel, type OperatingHours } from "@/lib/operatingHours";
import type { QuotaReset } from "@/lib/quotaReset";

export type DevicePolicy = {
  id: string;
  name: string;
  dailyLimit: number;
  useGlobalQuota: boolean;
  operatingHours: OperatingHours | null;
  globalOperatingHours: OperatingHours;
  effectiveOperatingHours: OperatingHours;
  operatingHoursState: { open: boolean; nextOpenAt: string | null };
  globalQuota: number;
  used: number;
  quotaReset: QuotaReset | null;
  globalQuotaReset: QuotaReset;
  effectiveQuotaReset: QuotaReset;
  quotaResetAt: string | null;
  lastSendProcessedAt?: string | null;
  effectiveLimit: number;
  minIntervalSeconds: number | null;
  maxIntervalSeconds: number | null;
  globalInterval: { minSeconds: number; maxSeconds: number };
  adaptiveEnabled: boolean;
  paused: boolean;
  pauseReason?: string | null;
  warmupStartedAt: string | null;
  health: { score: number | null; reason: string; stop: boolean; multiplier: number };
};

const detailStyle = { display: "block", fontSize: 12, lineHeight: 1.5 };

export function phonePolicyColumns(uiText: UiTranslator, getPolicy: (id: string) => DevicePolicy | undefined, sort?: Pick<TableState, "sort" | "order">): ColumnsType<PhoneRow> {
  const sorting = (key: PhonePolicySort | "lastSendProcessedAt") => ({ sorter: true, sortOrder: sort?.sort === key ? sort.order === "asc" ? "ascend" as const : "descend" as const : null });
  return [
    { title: uiText("Kesehatan"), key: "health", ...sorting("health"), width: 250, render: (_, phone) => {
      const policy = getPolicy(phone.id);
      if (!policy) return <Typography.Text type="secondary">{uiText("Belum tersedia")}</Typography.Text>;
      const reason = policy.pauseReason || policy.health.reason;
      const description = policy.health.score === null && reason === "Data belum cukup (minimal 20 percobaan hari ini)"
        ? uiText("Minimal 20 percobaan hari ini") : uiText(reason);
      const stopped = policy.paused || (policy.adaptiveEnabled && policy.health.stop);
      return <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 200, maxWidth: 250 }}>
        {policy.health.score === null ? <Typography.Text>{uiText("Data belum cukup")}</Typography.Text> : <Progress percent={policy.health.score} status={policy.health.stop ? "exception" : "normal"} style={{ margin: 0 }} />}
        <Typography.Text type="secondary" style={{ ...detailStyle, overflowWrap: "anywhere" }}>{description}</Typography.Text>
        <Tag color={stopped ? "red" : policy.operatingHoursState.open ? "green" : "gold"} style={{ alignSelf: "flex-start", whiteSpace: "normal" }}>
          {policy.paused ? policy.pauseReason ? uiText("Dihentikan: pembatasan WhatsApp") : uiText("Dijeda admin") : stopped ? uiText("Dihentikan otomatis") : policy.operatingHoursState.open ? uiText("Siap mengirim") : uiText("Di luar jam operasional")}
        </Tag>
      </div>;
    } },
    { title: uiText("Jam operasional"), key: "operatingHours", width: 230, render: (_, phone) => {
      const policy = getPolicy(phone.id);
      return policy ? <Space direction="vertical" size={4}>
        <Typography.Text>{operatingHoursLabel(policy.effectiveOperatingHours)}</Typography.Text>
        <Tag>{policy.operatingHours == null ? uiText("Ikuti jadwal global") : uiText("Jadwal khusus")}</Tag>
        {!policy.operatingHoursState.open && policy.operatingHoursState.nextOpenAt && <Typography.Text type="secondary">{uiText("Mulai kembali:")} {uiText.date(policy.operatingHoursState.nextOpenAt)} WIB</Typography.Text>}
      </Space> : <Typography.Text type="secondary">{uiText("Belum tersedia")}</Typography.Text>;
    } },
    { title: uiText("Kuota pengiriman"), key: "quota", ...sorting("quota"), width: 160, render: (_, phone) => {
      const policy = getPolicy(phone.id);
      return policy ? <Space direction="vertical" size={4} style={{ minWidth: 130 }}>
        <Typography.Text>{policy.used} / {policy.effectiveLimit}</Typography.Text>
        <Typography.Text type="secondary" style={detailStyle}>{policy.effectiveQuotaReset.mode === "midnight" ? uiText("Reset pukul 00.00 WIB") : policy.quotaResetAt ? `${uiText("Reset:")} ${uiText.date(policy.quotaResetAt)} WIB` : uiText("Reset {{v0}} jam setelah kuota terpenuhi", { v0: policy.effectiveQuotaReset.hours })}</Typography.Text>
        <Tag>{policy.useGlobalQuota ? uiText("Global: {{v0}}", { v0: policy.globalQuota }) : uiText("Custom: {{v0}}", { v0: policy.dailyLimit })}</Tag>
      </Space> : <Typography.Text type="secondary">{uiText("Belum tersedia")}</Typography.Text>;
    } },
    { title: uiText("Terakhir Proses Kirim"), key: "lastSendProcessedAt", ...sorting("lastSendProcessedAt"), width: 200, render: (_, phone) => {
      const policy = getPolicy(phone.id);
      return <div style={{ whiteSpace: "nowrap" }}>
        {policy ? policy.lastSendProcessedAt ? `${uiText.date(policy.lastSendProcessedAt)} WIB` : uiText("Belum tercatat") : <Typography.Text type="secondary">{uiText("Belum tersedia")}</Typography.Text>}
      </div>;
    } },
    { title: uiText("Jeda pengiriman"), key: "sendInterval", ...sorting("sendInterval"), width: 220, render: (_, phone) => {
      const policy = getPolicy(phone.id);
      return policy ? <div style={{ minWidth: 180 }}>
        <div>{policy.minIntervalSeconds == null ? uiText("Ikuti pengaturan global") : policy.maxIntervalSeconds != null ? uiText("Khusus: {{v0}}–{{v1}} detik", { v0: policy.minIntervalSeconds, v1: policy.maxIntervalSeconds }) : uiText("Minimum khusus: {{v0}} detik", { v0: policy.minIntervalSeconds })}</div>
        <Typography.Text type="secondary" style={detailStyle}>{uiText("Global:")} {policy.globalInterval.minSeconds}–{policy.globalInterval.maxSeconds}  {uiText("detik")}{policy.adaptiveEnabled && policy.health.multiplier > 1 ? uiText(" · diperlambat 3×") : ""}</Typography.Text>
      </div> : <Typography.Text type="secondary">{uiText("Belum tersedia")}</Typography.Text>;
    } },
    { title: uiText("Status pemanasan"), key: "warmup", width: 170, render: (_, phone) => {
      const policy = getPolicy(phone.id);
      return policy ? <Space direction="vertical" size={4} style={{ minWidth: 140 }}>
        <Tag color={policy.warmupStartedAt ? "blue" : "default"}>{policy.warmupStartedAt ? uiText("Aktif") : uiText("Tidak aktif")}</Tag>
        {policy.warmupStartedAt && <Typography.Text type="secondary" style={detailStyle}>{uiText("Sejak")} {dayjs(policy.warmupStartedAt).format("DD/MM/YYYY")}</Typography.Text>}
      </Space> : <Typography.Text type="secondary">{uiText("Belum tersedia")}</Typography.Text>;
    } },
  ];
}

export default function usePhonePolicies(sort?: Pick<TableState, "sort" | "order">) {
  const uiText = useUiTranslation();
  const api = useDashboardApi<DevicePolicy[]>("/api/device-policies", 30000);
  const policies = useMemo(() => new Map(api.data?.map(policy => [policy.id, policy])), [api.data]);
  const [editing, setEditing] = useState<DevicePolicy>();
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const update = async (row: DevicePolicy, values: Record<string, unknown>) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      await axios.put("/api/device-policies", {
        phoneId: row.id, dailyLimit: row.dailyLimit, useGlobalQuota: row.useGlobalQuota,
        operatingHours: row.operatingHours,
        quotaReset: row.quotaReset,
        minIntervalSeconds: row.minIntervalSeconds, maxIntervalSeconds: row.maxIntervalSeconds, adaptiveEnabled: row.adaptiveEnabled, paused: row.paused, ...values,
      }, { headers: api.headers });
      api.reload();
      setEditing(undefined);
      message.success(uiText("Kebijakan pengiriman disimpan."));
    } catch (error: any) {
      message.error(uiText(error.response?.data?.message || uiText("Pengaturan gagal disimpan.")));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return {
    error: api.error,
    reload: api.reload,
    hasPolicy: (id: string) => policies.has(id),
    open: (id: string) => {
      const policy = policies.get(id);
      if (policy) setEditing(policy);
    },
    columns: phonePolicyColumns(uiText, id => policies.get(id), sort),
    modal: <Modal className="device-settings-modal" width={640} open={!!editing} title={uiText("Atur batas — {{v0}}", { v0: editing?.name || uiText("Perangkat") })} footer={<Space><Button disabled={busy} onClick={() => setEditing(undefined)}>{uiText("Batal")}</Button><Button form="phone-policy-form" htmlType="submit" type="primary" loading={busy}>{uiText("Simpan")}</Button></Space>}
      onCancel={() => { if (!saving.current) setEditing(undefined); }} closable={!busy} maskClosable={!busy} keyboard={!busy} destroyOnHidden>
      {editing && <Form id="phone-policy-form" key={editing.id} layout="vertical" disabled={busy}
        initialValues={{ ...editing, followGlobalQuotaReset: editing.quotaReset == null, customQuotaReset: editing.quotaReset || editing.globalQuotaReset, followGlobalOperatingHours: editing.operatingHours == null, customOperatingHours: editing.operatingHours || editing.globalOperatingHours, followGlobal: editing.minIntervalSeconds == null, minIntervalSeconds: deviceSendIntervalRange(editing.globalInterval, editing).minSeconds, maxIntervalSeconds: deviceSendIntervalRange(editing.globalInterval, editing).maxSeconds }}
        onFinish={({ followGlobalQuotaReset, customQuotaReset, followGlobal, minIntervalSeconds, maxIntervalSeconds, followGlobalOperatingHours, customOperatingHours, ...values }) => update(editing, {
          operatingHours: followGlobalOperatingHours ? null : customOperatingHours,
          ...values, minIntervalSeconds: followGlobal ? null : minIntervalSeconds, maxIntervalSeconds: followGlobal ? null : maxIntervalSeconds,
          quotaReset: followGlobalQuotaReset ? null : customQuotaReset,
        })}>
        <div className="device-settings-list">
          <SettingToggle name="followGlobalOperatingHours" label={uiText("Ikuti jam operasional global")} onLabel={uiText("Global")} offLabel={uiText("Khusus")}
            description={`${uiText("Jadwal global:")} ${operatingHoursLabel(editing.globalOperatingHours)}. ${uiText("Matikan untuk memakai jadwal khusus yang menggantikan jadwal global pada nomor ini.")}`} />
          <Form.Item noStyle shouldUpdate={(before, after) => before.followGlobalOperatingHours !== after.followGlobalOperatingHours}>{({ getFieldValue }) => !getFieldValue("followGlobalOperatingHours") && <div className="device-setting-dependent"><OperatingHoursFields name="customOperatingHours" /></div>}</Form.Item>
          <SettingToggle name="useGlobalQuota" label={uiText("Gunakan kuota global")} onLabel={uiText("Global")} offLabel={uiText("Custom")}
            description={uiText("Kuota global saat ini {{v0}} percobaan per nomor per hari. Matikan untuk menggunakan kuota custom.", { v0: editing.globalQuota })} />
          <Form.Item noStyle shouldUpdate={(before, after) => before.useGlobalQuota !== after.useGlobalQuota}>{({ getFieldValue }) => !getFieldValue("useGlobalQuota") && <div className="device-setting-dependent"><Form.Item name="dailyLimit" label={uiText("Kuota custom per hari")} rules={[{ required: true }]}><InputNumber min={1} max={100000} precision={0} style={{width: "100%"}} /></Form.Item></div>}</Form.Item>
          <SettingToggle name="followGlobalQuotaReset" label={uiText("Ikuti waktu reset kuota global")} onLabel={uiText("Global")} offLabel={uiText("Khusus")}
            description={editing.globalQuotaReset.mode === "midnight" ? uiText("Global: reset pukul 00.00 WIB. Matikan untuk mengatur waktu reset nomor ini.") : uiText("Global: reset {{v0}} jam setelah kuota terpenuhi. Matikan untuk mengatur waktu reset nomor ini.", { v0: editing.globalQuotaReset.hours })} />
          <Form.Item noStyle shouldUpdate={(before, after) => before.followGlobalQuotaReset !== after.followGlobalQuotaReset}>{({ getFieldValue }) => !getFieldValue("followGlobalQuotaReset") && <div className="device-setting-dependent">
            <Form.Item name={["customQuotaReset", "mode"]} label={uiText("Waktu reset kuota")} rules={[{ required: true }]}><Select options={[{ value: "midnight", label: uiText("Pukul 00.00 WIB") }, { value: "after-full", label: uiText("Beberapa jam setelah kuota terpenuhi") }]} /></Form.Item>
            <Form.Item noStyle shouldUpdate={(before, after) => before.customQuotaReset?.mode !== after.customQuotaReset?.mode}>{({ getFieldValue }) => <Form.Item hidden={getFieldValue(["customQuotaReset", "mode"]) !== "after-full"} name={["customQuotaReset", "hours"]} label={uiText("Jeda setelah kuota terpenuhi (jam)")} rules={[{ required: true, type: "integer", min: 1, max: 168 }]} extra={uiText("Dihitung sejak kuota nomor ini terpenuhi. Pemakaian yang belum penuh berlanjut melewati tengah malam.")}><InputNumber min={1} max={168} precision={0} style={{ width: "100%" }} /></Form.Item>}</Form.Item>
          </div>}</Form.Item>
          <SettingToggle name="followGlobal" label={uiText("Ikuti pengaturan global")} onLabel={uiText("Ya")} offLabel={uiText("Khusus")}
            description={uiText("Jeda acak global saat ini {{v0}}–{{v1}} detik. Matikan untuk menggunakan rentang jeda acak khusus perangkat ini.", { v0: editing.globalInterval.minSeconds, v1: editing.globalInterval.maxSeconds })} />
          <Form.Item noStyle shouldUpdate={(before, after) => before.followGlobal !== after.followGlobal}>{({ getFieldValue }) => !getFieldValue("followGlobal") && <div className="device-setting-dependent">
            <Form.Item name="minIntervalSeconds" label={uiText("Mulai (detik)")} rules={[{ required: true, type: "integer", min: 1, max: 30 }]}><InputNumber min={1} max={30} precision={0} style={{width: "100%"}} /></Form.Item>
            <Form.Item name="maxIntervalSeconds" label={uiText("Hingga (detik)")} dependencies={["minIntervalSeconds"]} rules={[
              { required: true, type: "integer", min: 1, max: 30 },
              ({ getFieldValue }) => ({ validator(_, value) { return value == null || value >= getFieldValue("minIntervalSeconds") ? Promise.resolve() : Promise.reject(new Error(uiText("Hingga harus sama atau lebih besar dari Mulai."))); } }),
            ]} extra={uiText("1–30 detik. Hingga harus sama atau lebih besar dari Mulai.")}><InputNumber min={1} max={30} precision={0} style={{width: "100%"}} /></Form.Item>
          </div>}</Form.Item>
          <SettingToggle name="adaptiveEnabled" label={uiText("Perlambatan dan penghentian adaptif")}
            description={uiText("Setelah minimal 20 percobaan hari ini: tingkat kesalahan 10% atau lebih membuat jeda pengiriman 3×; 30% atau lebih menghentikan pengiriman hingga evaluasi hari berikutnya. Kesalahan yang dihitung adalah kesalahan transport atau konfirmasi.")} />
          <SettingToggle name="paused" label={uiText("Jeda pengiriman")}
            description={uiText("Hentikan pengiriman dari nomor ini secara manual. Matikan lalu Simpan untuk mengizinkan pengiriman kembali, selama batas dan pemeriksaan lainnya terpenuhi.")} />
        </div>
      </Form>}
    </Modal>,
  };
}

export function PhonePolicyHelp() {
  const uiText = useUiTranslation();
  return <Collapse items={[{ key: "policy-help", label: uiText("Tentang kesehatan, kuota, dan pemanasan nomor"), children: <Space direction="vertical" size="middle">
    <Alert type="info" showIcon message={uiText("Skor ini merupakan indikator operasional internal, bukan skor resmi WhatsApp atau jaminan bebas pembatasan. Batas harian menghitung percobaan pengiriman, termasuk retry, dan direset sesuai pengaturan tiap nomor: pukul 00.00 WIB atau beberapa jam setelah kuota terpenuhi.")} />
    <Typography.Paragraph style={{ margin: 0 }}>{uiText("Pemanasan menggunakan batas percobaan per hari dari Setting global, masing-masing tahap selama dua hari, lalu mengikuti batas perangkat. Batas perangkat tetap menjadi batas maksimum. Perlambatan dimulai saat kesalahan transport mencapai 10%; pengiriman dihentikan pada 30%, setelah minimal 20 percobaan. Penghentian otomatis berlangsung sampai evaluasi hari berikutnya atau dinonaktifkan oleh admin. Buka Aksi → Atur batas untuk mengubah kebijakan. Kelola pemanasan nomor melalui form Tambah/Edit perangkat.")}</Typography.Paragraph>
  </Space> }]} />;
}
