import { useUiTranslation } from "@/lib/uiTranslation";
import Table from "@/components/DashboardTable";
import SummaryCards from "@/components/SummaryCards";
import { useDashboardApi } from "@/lib/useDashboardApi";
import { MobileOutlined, WifiOutlined, DisconnectOutlined, CheckCircleOutlined, StopOutlined } from "@ant-design/icons";
import { useTableState } from "@/lib/useTableState";
import { phoneSearchQuery, readPhoneSearchState } from "@/lib/phoneSearchState";
import {
  ReactElement,
  Key,
  SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Alert, Button, Flex, Modal, notification, Space, Switch, Tag, theme } from "antd";
import { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useSession } from "next-auth/react";
import { useLocalizedTranslation as useTranslation } from "@/lib/uiTranslation";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useRouter } from "next/router";

import Layout from "@/components/Layout";
import ModalQrCode from "@/components/phone/ModalQrCode";
import TestSendModal from "@/components/phone/TestSendModal";
import PhoneCleanupModal from "@/components/phone/PhoneCleanupModal";
import PhoneFormModal, {
  PhoneFormData,
  PhoneFormModalRef,
} from "@/components/phone/PhoneFormModal";
import PhoneTableButton from "@/components/phone/PhoneTableButton";
import PhoneConnectionStatus from "@/components/phone/PhoneConnectionStatus";
import usePhonePolicies, { PhonePolicyHelp } from "@/components/phone/PhonePolicyControls";
import { wrapPhoneText, wrapPhoneToken } from "@/lib/phoneTableText";
import SearchPhoneForm from "@/components/phone/SearchPhoneForm";
import usePhoneData from "@/lib/usePhoneData";
import type { PhoneRow } from "@/lib/usePhoneData";
import { isSuperAdmin } from "@/lib/access";
import useSocket, { SocketEvent } from "@/lib/useSocket";
import { copyToClipboard } from "@/utils/copyToClipboard";
import { Phone } from "@prisma/client";

const PhonePage = () => {
  const uiText = useUiTranslation();
  // Warna status berasal dari token dan ikut berubah bersama aksen tema.
  const { token } = theme.useToken();
  const statusColor = (color: string) => `color-mix(in srgb, ${color} 80%, var(--ui-accent))`;
  const router = useRouter();
  const searchState = readPhoneSearchState(router.query);
  const replaceSearch = (next: typeof searchState) => {
    void router.replace({ pathname: router.pathname, query: phoneSearchQuery(next) }, undefined, { shallow: true, scroll: false });
  };
  const table = useTableState({ value: searchState.table, onChange: next => replaceSearch({ ...searchState, table: next }) });
  const [testPhone, setTestPhone] = useState<Phone>();
  const [cleanupPhone, setCleanupPhone] = useState<Phone>();
  const [state, setState] = useState<{
    openForm: boolean;
    openReplyForm: boolean;
    formLoading: boolean;
    openQrModal: boolean;
    selectedPhone: Phone | undefined;
    editPhone: Phone | undefined;
    phoneId: Phone | undefined;
  }>({
    openForm: false,
    openReplyForm: false,
    formLoading: false,
    openQrModal: false,
    selectedPhone: undefined,
    editPhone: undefined,
    phoneId: undefined,
  });
  const { data: session } = useSession();
  const summary = useDashboardApi<{ total: number; online: number; offline: number; active: number; inactive: number }>("/api/phones?summary=1", 10000);
  const policies = usePhonePolicies(table);
  const admin = !!session?.user && isSuperAdmin({
    id: session.user.id, email: session.user.email,
    role: session.user.role || "USER", approvalStatus: session.user.approvalStatus || "",
  });

  const searchQuery = searchState.filters;
  const phoneData = usePhoneData(session?.user?.token!, { ...searchQuery, page: table.page, limit: table.limit, sort: table.sort, order: table.order });
  const showSearch = searchState.showSearch;
  const socketOption = useMemo(() => session?.user?.id ? {
    path: "/socket.io",
    autoConnect: false,
    transports: ["websocket"],
  } : undefined, [session?.user?.id]);
  const { socket, setEvents } = useSocket(socketOption);
  const refreshPhones = useRef(phoneData.refetchPhone);
  refreshPhones.current = phoneData.refetchPhone;
  const { t } = useTranslation("common");
  const [modal, contextHolder] = Modal.useModal();
  const [notif, notificationContext] = notification.useNotification();
  const form = useRef<PhoneFormModalRef>(null);
  const [selectedPhoneIds, setSelectedPhoneIds] = useState<Key[]>([]);
  const [generatingTokens, setGeneratingTokens] = useState(false);
  const generatingRef = useRef(false);

  useEffect(() => { setSelectedPhoneIds([]); }, [session?.user?.id]);

  const confirmGenerateTokens = (ids?: string[], phone?: PhoneRow) => {
    const all = !ids;
    const target = all ? (admin ? uiText("semua nomor dari seluruh pemilik") : uiText("semua nomor milik Anda"))
      : phone ? uiText("nomor {{v0}}", { v0: phone.number || phone.name }) : `${ids.length} nomor yang dipilih`;
    modal.confirm({
      title: uiText("Generate token untuk {{v0}}?", { v0: target }),
      content: uiText("Token lama untuk {{v0}} akan langsung diganti. Perbarui token pada integrasi API Anda setelah selesai.{{v1}}", { v0: target, v1: all ? uiText(" Berlaku untuk seluruh nomor, termasuk di halaman lain dan di luar hasil pencarian.") : "" }),
      okText: uiText("Buat token"), cancelText: uiText("Batal"),
      onOk: async () => {
        if (generatingRef.current) return;
        generatingRef.current = true;
        setGeneratingTokens(true);
        try {
          const result = await phoneData.generateTokens(ids ? { scope: "selected", ids } : { scope: "all" });
          if (!result.success) {
            notif.error({ message: uiText("Generate token gagal"), description: uiText(result.error?.response?.data?.message || "Hasil belum dapat dipastikan. Muat ulang untuk memeriksa token sebelum mencoba lagi.") });
            throw new Error(uiText("Generate token gagal"));
          }
          setSelectedPhoneIds(current => all ? [] : current.filter(id => !ids!.includes(String(id))));
          notif.success({ message: uiText("Token baru berhasil dibuat untuk {{v0}} nomor.", { v0: result.data.count }) });
        } finally {
          generatingRef.current = false;
          setGeneratingTokens(false);
        }
      },
    });
  };

  useEffect(() => {
    if (!session?.user?.id) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refreshPhones.current();
    }, 10000);
    return () => clearInterval(timer);
  }, [session?.user?.id]);

  useEffect(() => {
    if (!socketOption || state.openForm || state.openQrModal) {
      setEvents([]);
      socket?.disconnect();
      return;
    }
    const events: SetStateAction<SocketEvent[] | null> = [];

    events.push({
      name: `isOnline`,
      handler: (connection) => {
        if (typeof connection.isOnline === "boolean") refreshPhones.current();
      },
    });
    events.push({
      name: `waUser`,
      handler: () => refreshPhones.current(),
    });
    events.push({
      name: "qrScanned",
      handler: () => refreshPhones.current(),
    });

    events.push({
      name: "connect",
      handler: () => {
        refreshPhones.current();
      },
    });
    setEvents(events);
    socket?.connect();
    return () => {
      setEvents([]);
      socket?.disconnect();
    };
  }, [socketOption, state.openForm, state.openQrModal]);

  const dataColumn: ColumnsType<PhoneRow> = [
    {
      title: t("number"),
      key: "number",
      dataIndex: "number",
    },
    {
      title: t("account_name"),
      key: "account_name",
      dataIndex: "account_name",
      render: (v) => <div style={{ whiteSpace: "pre", wordBreak: "normal", overflowWrap: "normal" }}>{wrapPhoneText(v)}</div>,
    },
    {
      title: t("phone_label"),
      key: "name",
      dataIndex: "name",
      render: (v) => <div style={{ whiteSpace: "pre", wordBreak: "normal", overflowWrap: "normal" }}>{wrapPhoneText(v)}</div>,
    },
    {
      title: uiText("Grup pengirim"),
      key: "senderGroup.name",
      dataIndex: ["senderGroup", "name"],
      render: (_v, phone) => <div style={{ minWidth: 140, maxWidth: 240, overflowWrap: "anywhere" }}>
        {phone.senderGroup ? <>{phone.senderGroup.name}{!phone.senderGroup.enabled && <div style={{ color: "var(--ui-muted)", fontSize: 12 }}>{uiText("Tidak aktif")}</div>}</> : <span style={{ color: "var(--ui-muted)" }}>{uiText("Tanpa grup")}</span>}
      </div>,
    },
    {
      title: uiText("Status koneksi"),
      key: "isOnline",
      dataIndex: "isOnline",
      render: (_v, phone) => <Space size={8} style={{ whiteSpace: "nowrap" }}><PhoneConnectionStatus connection={phone.connection} />{phone.connection?.action === "scan_qr" && <Button size="small" onClick={() => onGetQrCodeClick(phone)}>{uiText("Scan QR")}</Button>}</Space>,
    },
    {
      title: uiText("Terakhir Offline"),
      key: "lastOfflineAt",
      dataIndex: "lastOfflineAt",
      render: (v) => (
        <div style={{ whiteSpace: "nowrap" }}>
          {v ? `${uiText.date(v)} WIB` : uiText("Belum tercatat")}
        </div>
      ),
    },
    {
      title: uiText("Terakhir Scan QR"),
      key: "lastQrScanAt",
      dataIndex: "lastQrScanAt",
      render: (v) => (
        <div style={{ whiteSpace: "nowrap" }}>
          {v ? `${uiText.date(v)} WIB` : uiText("Belum tercatat")}
        </div>
      ),
    },
    {
      title: uiText("Status Perangkat"),
      key: "active",
      dataIndex: "active",
      render: (v) => (
        <Tag color={v === 1 ? "green" : "red"}>
          {v === 1 ? uiText("Aktif") : uiText("Tidak Aktif")}
        </Tag>
      ),
    },
    ...policies.columns.filter(column => column.key !== "health"),
    {
      title: uiText("Save Group"),
      key: "is_save_group",
      dataIndex: "is_save_group",
      render: (v, phone) => (
        <Switch
          defaultChecked={v ? true : false}
          checkedChildren={uiText("On")}
          unCheckedChildren={uiText("Off")}
          onChange={(checked) => {
            onSaveGroup(phone, checked);
            // setIsSendGroup({
            //   phoneId: String(phone.id),
            //   is_send_group: checked,
            // })
          }}
        />
      ),
    },
    {
      title: t("api_token"),
      key: "token",
      dataIndex: "token",

      render: (v) => (
        <Space direction="horizontal" style={{ whiteSpace: "nowrap" }}>
          <Button
            onClick={async () => {
              await copyToClipboard({ value: v });
              notif.destroy();
              notif.success({
                closeIcon: false,
                duration: 3,
                message:
                  t("text_copied", { text: '"Token"' }).toString() || "Copied",
                placement: "bottom",
              });
            }}
          >
            {uiText("Copy")}</Button>
          <div style={{ whiteSpace: "pre" }}>{wrapPhoneToken(v)}</div>
        </Space>
      ),
    },
    ...(admin ? [{
      title: uiText("Kepemilikan"),
      key: "user.name",
      dataIndex: ["user", "name"],
      width: 220,
      render: (_: unknown, phone: PhoneRow) => <div style={{ minWidth: 160, maxWidth: 240, overflowWrap: "anywhere" }}>
        <div>{phone.user?.name || phone.user?.email || phone.userId}</div>
        {phone.user?.name && phone.user?.email && <div style={{ color: "var(--ui-muted)", fontSize: 12 }}>{phone.user.email}</div>}
      </div>,
    }] : []),
    {
      title: t("created_at"),
      key: "createdAt",
      dataIndex: "createdAt",
      render: (v) => (
        <div style={{ whiteSpace: "nowrap" }}>
          {dayjs(v).format("DD/MM/YYYY HH:mm")}
        </div>
      ),
    },
    ...policies.columns.filter(column => column.key === "health"),
    {
      title: t("action"),
      key: "action",
      dataIndex: "id",
      fixed: "right",
      render: (v, phone) => {
        return (
          <PhoneTableButton
            phone={phone}
            generatingToken={generatingTokens}
            policyAvailable={policies.hasPolicy(phone.id)}
            onPolicyClick={() => policies.open(phone.id)}
            onGenerateTokenClick={() => confirmGenerateTokens([phone.id], phone)}
            // onAutoReply={
            //   (_phone: Phone | undefined) => {
            //     _phone &&
            //       setState({...state, openReplyForm: true, phoneId: _phone })
            //   }
            // }
            onListReply={(_phone: Phone | undefined) =>
              router.push({
                pathname: "/dashboard/auto-reply",
                query: {
                  phone_id: _phone?.id,
                  phone_num: _phone?.number,
                  phone_search: new URLSearchParams(phoneSearchQuery(searchState)).toString(),
                },
              })
            }
            onEditClick={onEditClick}
            onDeleteClick={onDeleteClick}
            onGetQrCodeClick={onGetQrCodeClick}
            onToggleActiveClick={onToggleActiveClick}
            onTestSendClick={phone => setTestPhone(phone)}
          />
        );
      },
    },
  ];

  const onSubmit = async (data: PhoneFormData) => {
    setState({ ...state, formLoading: true });
    const res = await phoneData.save(data);
    if (res.success) {
      policies.reload();
      form.current?.resetForm();
    } else {
      notif.error({ message: uiText("Device belum tersimpan"), description: uiText(res.error?.response?.data?.message || "Coba lagi.") });
      setState({ ...state, formLoading: false });
      return;
    }
    setState({
      ...state,
      formLoading: false,
      openForm: false,
      editPhone: undefined,
    });
  };

  const onCancel = () =>
    setState({
      ...state,
      openForm: false,
      editPhone: undefined,
      openReplyForm: false,
      phoneId: undefined,
    });

  const onEditClick = (_phone: Phone | undefined) => {
    _phone && setState({ ...state, editPhone: _phone, openForm: true });
  };

  const onDeleteClick = (_phone: Phone | undefined) => {
    if (_phone) setCleanupPhone(_phone);
  };

  const onToggleActiveClick = (_phone: Phone | undefined, active: number) => {
    if (_phone) {
      modal.confirm({
        title: active === 1 ? uiText("Konfirmasi Aktifkan Perangkat") : uiText("Konfirmasi Nonaktifkan Perangkat"),
        content: uiText("Apakah Anda yakin ingin {{v0}} perangkat {{v1}}?", { v0: active === 1 ? uiText("mengaktifkan") : uiText("menonaktifkan"), v1: _phone.name }),
        onOk: async () => {
          const result = await phoneData.toggleActive(_phone.id, active);
          notif[result.success ? "success" : "error"]({
            message: result.success ? t("success") : t("failed"),
            description: result.success
              ? uiText("Perangkat berhasil {{v0}}", { v0: active === 1 ? uiText("diaktifkan") : uiText("dinonaktifkan") })
              : uiText("Gagal {{v0}} perangkat", { v0: active === 1 ? uiText("mengaktifkan") : uiText("menonaktifkan") }),
          });
        },
      });
    }
  };

  const onSaveGroup = (_phone: Phone | undefined, checked: boolean) => {
    // const enable_save_group = async (data: PhoneFormData) => {
    //   const result = await phoneData.save(data);
    //   if(result.success) {
    //
    //   }
    // }
    const enable_save_group = async (
      phoneId: string,
      is_save_group: boolean
    ) => {
      const result = await phoneData.isSaveGroup(phoneId, is_save_group);
      if (result.success) {
      }
    };

    if (_phone) {
      // const data = {..._phone, is_save_group: checked};
      // enable_save_group(data);
      const { id } = _phone;
      enable_save_group(id, checked);
    }
  };

  const onGetQrCodeClick = (_phone: Phone | undefined) => {
    _phone &&
      setState({
        ...state,
        selectedPhone: _phone,
        openQrModal: true,
      });
  };

  return (
    <>
      <Flex gap="middle" vertical>
        <SummaryCards title={uiText("Ringkasan perangkat")} caption={uiText("Seluruh perangkat yang dapat diakses akun Anda • diperbarui otomatis setiap 10 detik")} items={[
          { key: "total", label: uiText("Jumlah perangkat"), value: summary.data?.total, color: statusColor(token.colorInfoText), icon: <MobileOutlined /> },
          { key: "online", label: uiText("Online"), value: summary.data?.online, color: statusColor(token.colorSuccessText), icon: <WifiOutlined /> },
          { key: "offline", label: uiText("Offline"), value: summary.data?.offline, color: statusColor(token.colorTextSecondary), icon: <DisconnectOutlined /> },
          { key: "active", label: uiText("Aktif"), value: summary.data?.active, color: statusColor(token.purple6), icon: <CheckCircleOutlined /> },
          { key: "inactive", label: uiText("Tidak aktif"), value: summary.data?.inactive, color: statusColor(token.colorWarningText), icon: <StopOutlined /> },
        ]} />
        {summary.error && <Alert type="error" showIcon message={uiText(summary.error)} />}
        {policies.error && <Alert type="warning" showIcon message={uiText("Kesehatan dan kebijakan pengiriman belum dapat diperbarui")} description={uiText(policies.error)} />}
        {phoneData.connectionStatusError && <Alert type="warning" showIcon message={uiText("Status koneksi belum dapat diperbarui")} description={uiText("Sambungan ke server bermasalah. Tunggu pembaruan berikutnya atau muat ulang. Jangan scan QR sebelum status sesi berhasil diperiksa.")} />}
        {/* Tombol sejajar dengan gap 12px; aksi netral memakai ghost berborder. */}
        <Flex className="phone-actions" gap={12} wrap="wrap">
          <Button
            className="phone-action-primary"
            type="primary"
            onClick={() => setState({ ...state, openForm: true })}
          >
            {t("add_devices")}
          </Button>
          <Button className="phone-action-ghost" onClick={() => replaceSearch({ ...searchState, showSearch: !showSearch })}>
            {showSearch ? t("hide_search") : t("show_search")}
          </Button>
          <Button className="phone-action-ghost" disabled={!selectedPhoneIds.length || generatingTokens} onClick={() => confirmGenerateTokens(selectedPhoneIds.map(String))}>
            {uiText("Buat token Terpilih (")}{selectedPhoneIds.length})
          </Button>
          <Button className="phone-action-secondary" disabled={generatingTokens} onClick={() => confirmGenerateTokens()}>
            {uiText("Buat token untuk semua perangkat")}</Button>
          {!!selectedPhoneIds.length && <Button className="phone-action-ghost" disabled={generatingTokens} onClick={() => setSelectedPhoneIds([])}>{uiText("Hapus Pilihan")}</Button>}
        </Flex>
        <PhoneFormModal
          ref={form}
          loading={state.formLoading}
          open={state.openForm}
          onCancel={onCancel}
          onSubmit={onSubmit}
          editPhone={state.editPhone}
        />
        {/* <AutoReplyFormModal
      ref={formAutoRep}
      loading={state.formLoading}
      open={state.openReplyForm}
      onCancel={onCancel}
      onSubmitReply={onSubmitReply}
      onChangeImageReply={handleTambahImageReply}
      phoneId={state.phoneId} 
      />*/}
        <SearchPhoneForm
          visible={showSearch}
          initialValues={searchQuery}
          onSubmitSuccess={(data) => {
            replaceSearch({ ...searchState, filters: { name: data.name || "", number: data.number || "", is_online: data.is_online || "", active: data.active || "", sender_group: data.sender_group || "" }, table: { ...searchState.table, page: 1 } });
          }}
        />
        {/* Border tema membedakan info Save Group dari latar halaman. */}
        <Alert
          className="phone-save-group-info"
          type="info"
          showIcon
          message={uiText("Tentang Save Group")}
          description={
            <Space direction="vertical" size={4}>
              <span><strong>{uiText("On:")}</strong>  {uiText("saat nomor perangkat menerima pesan dari grup WhatsApp, Jeblast menyimpan grup yang belum tercatat, termasuk ID, nama, deskripsi, dan daftar anggotanya.")}</span>
              <span><strong>{uiText("Off:")}</strong>  {uiText("penyimpanan data grup otomatis dinonaktifkan.")}</span>
              <span>{uiText("Penyimpanan dipicu oleh pesan masuk dari grup, bukan langsung mengambil semua grup saat diaktifkan. Fitur ini tidak mencadangkan riwayat chat atau mengirim blast otomatis.")}</span>
            </Space>
          }
        />
        <PhonePolicyHelp />
        <Table
          className="table-with-data-count"
          scroll={{ x: true }}
          dataSource={phoneData.phones}
          columns={dataColumn}
          rowKey="id"
          rowSelection={{
            selectedRowKeys: selectedPhoneIds,
            preserveSelectedRowKeys: true,
            onChange: keys => setSelectedPhoneIds(keys),
            getCheckboxProps: () => ({ disabled: generatingTokens }),
          }}
          table={table}
          total={phoneData.total}
        />
        <ModalQrCode
          onConnected={phoneData.refetchPhone}
          onActivated={phoneData.refetchPhone}
          token={session?.user?.token!}
          userId={session?.user?.id}
          open={state.openQrModal}
          phone={state.selectedPhone || undefined}
          onClose={() => { setState({ ...state, openQrModal: false }); refreshPhones.current(); }}
        />
        <TestSendModal open={!!testPhone} phone={testPhone} token={session?.user?.token}
          onClose={() => setTestPhone(undefined)} />
        {policies.modal}

        {contextHolder}
        {notificationContext}
        {cleanupPhone && <PhoneCleanupModal key={cleanupPhone.id} phone={cleanupPhone} onCancel={() => setCleanupPhone(undefined)}
          onSubmit={async options => {
            const result = await phoneData.deleteById(cleanupPhone.id, options);
            if (!result.success) {
              const message = result.error?.response?.data?.message || uiText("Pembersihan belum berhasil. Coba kembali.");
              notif.error({ message: uiText("Pembersihan gagal"), description: uiText(message) });
              phoneData.refetchPhone();
              throw new Error(message);
            }
            setCleanupPhone(undefined);
            setSelectedPhoneIds(ids => ids.filter(id => id !== cleanupPhone.id));
            notif.success({ message: options.deleteRecord ? uiText("Perangkat berhasil dihapus") : uiText("Perangkat berhasil dibersihkan/reset") });
          }} />}
      </Flex>
    </>
  );
};

export const getStaticProps = async ({ locale }: { locale: string }) => ({
  props: {
    ...(await serverSideTranslations(locale, ["common", "upgrade", "interface"])),
  },
});

PhonePage.getLayout = function getLayout(page: ReactElement) {
  return <Layout title="Perangkat WhatsApp">{page}</Layout>;
};

export default PhonePage;
