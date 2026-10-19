import { useUiTranslation } from "@/lib/uiTranslation";
import { useEffect, useState } from "react";
import { Badge, Button, Popover, Space } from "antd";
import { BellOutlined } from "@ant-design/icons";
import Link from "next/link";
import { useDashboardApi } from "@/lib/useDashboardApi";

export default function ApprovalNotifications() {
  const uiText = useUiTranslation();
  const [open, setOpen] = useState(false);
  const notifications = useDashboardApi<{ pendingCount: number }>("/api/admin/approval-notifications", 30000);
  const { reload } = notifications;
  const count = notifications.data?.pendingCount || 0;
  useEffect(() => {
    const refresh = () => reload();
    window.addEventListener("dashboard:users-updated", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("dashboard:users-updated", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [reload]);

  return <Popover title={uiText("Notifikasi")} trigger="click" placement="bottomRight" open={open}
    onOpenChange={value => { setOpen(value); if (value) notifications.reload(); }}
    content={<Space direction="vertical" style={{ maxWidth: 260 }}>
      <span role="status">{notifications.error ? uiText("Notifikasi belum dapat dimuat.") : !notifications.data ? uiText("Memuat notifikasi…") : count ? uiText("{{v0}} pengguna menunggu persetujuan.", { v0: count }) : uiText("Tidak ada permintaan persetujuan user.")}</span>
      <Link href="/dashboard/admin?tab=users&status=PENDING" onClick={() => { setOpen(false); window.dispatchEvent(new Event("dashboard:pending-users")); }}>{uiText("Lihat permintaan persetujuan")}</Link>
    </Space>}>
    <Badge count={count} overflowCount={99} size="small" offset={[-3, 3]}>
      <Button aria-label={count ? uiText("Notifikasi: {{v0}} pengguna menunggu persetujuan", { v0: count }) : uiText("Notifikasi persetujuan user")}
        icon={<BellOutlined />} />
    </Badge>
  </Popover>;
}
