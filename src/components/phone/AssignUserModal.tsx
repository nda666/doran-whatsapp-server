import { useEffect, useState } from "react";
import { Alert, Modal, Select, Space, Typography } from "antd";
import axios from "axios";
import type { PhoneRow } from "@/lib/usePhoneData";

type AccountOption = { id: string; name: string | null; email: string | null };
export default function AssignUserModal({ phone, onCancel, onSaved }: { phone?: PhoneRow; onCancel: () => void; onSaved: () => void }) {
  const [users, setUsers] = useState<AccountOption[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setUserId(phone?.assignedUserId || null); setQuery(""); setUsers([]); setError(""); }, [phone]);
  useEffect(() => {
    if (!phone) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await axios.get(`/api/phones/${phone.id}/assign`, { params: { q: query }, signal: controller.signal });
        setUsers(response.data);
      } catch { if (!controller.signal.aborted) setError("Daftar user belum dapat dimuat."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [phone, query]);
  const options = [...users];
  if (phone?.assignee && !options.some(user => user.id === phone.assignee!.id)) options.unshift(phone.assignee);
  return <Modal open={!!phone} title="Assign nomor ke user" okText="Simpan assignment" cancelText="Batal" confirmLoading={saving}
    cancelButtonProps={{ disabled: saving }} closable={!saving} maskClosable={!saving} onCancel={onCancel}
    onOk={async () => {
      if (!phone || saving) return;
      setSaving(true); setError("");
      try {
        await axios.post(`/api/phones/${phone.id}/assign`, { userId, expectedAssignedUserId: phone.assignedUserId || null });
        onSaved();
      } catch (error: any) { setError(error.response?.data?.message || "Assignment belum dapat disimpan."); }
      finally { setSaving(false); }
    }}>
    <Space direction="vertical" style={{ width: "100%" }}>
      <Typography.Text strong>{phone?.name} {phone?.number ? `(${phone.number})` : ""}</Typography.Text>
      <Alert type="info" showIcon message="User hanya dapat mengakses nomor yang diberikan kepadanya. Admin tetap dapat mengakses seluruh nomor. Menghapus assignment mengembalikan akses ke pemilik perangkat." />
      <Select aria-label="User yang mendapat akses nomor" style={{ width: "100%" }} showSearch allowClear filterOption={false} loading={loading} disabled={saving}
        placeholder="Cari nama atau email user" value={userId} onSearch={setQuery} onChange={value => setUserId(value || null)}
        options={options.map(user => ({ value: user.id, label: `${user.name || user.email || user.id}${user.name && user.email ? ` (${user.email})` : ""}` }))} />
      {error && <Alert type="error" showIcon message={error} />}
    </Space>
  </Modal>;
}
