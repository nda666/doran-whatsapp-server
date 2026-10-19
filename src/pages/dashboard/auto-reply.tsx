import { useUiTranslation } from "@/lib/uiTranslation";
import Table from "@/components/DashboardTable";
import { ReactElement, useEffect, useRef, useState } from "react";

import { Alert, Button, Flex, Modal, notification, Select, Space, Switch } from "antd";
import { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useSession } from "next-auth/react";
import { useLocalizedTranslation as useTranslation } from "@/lib/uiTranslation";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useRouter } from "next/router";

import AutoReplyFormModal from "@/components/auto-reply/AutoReplyFormModal";
import ReplyTableButton from "@/components/auto-reply/ReplyTableButton";
import Layout from "@/components/Layout";
import ModalQrCode from "@/components/phone/ModalQrCode";
import useAutoReplyData from "@/lib/useAutoReplyData";
import { useDashboardApi } from "@/lib/useDashboardApi";
import { phoneSearchQuery, readPhoneSearchState } from "@/lib/phoneSearchState";
import { ArrowLeftOutlined } from "@ant-design/icons";
import {
  AutoReplyFormData,
  AutoReplyFormModalRef,
  ImageReply,
} from "@/types/components/IAutoReplyFormModal";
import { AutoReply, Phone } from "@prisma/client";

const AutoReplyPage = () => {
  const uiText = useUiTranslation();
  const [state, setState] = useState<{
    openForm: boolean;
    openReplyForm: boolean;
    formLoading: boolean;
    openQrModal: boolean;
    selectedPhone: Phone | undefined;
    editReply: AutoReply | undefined;
    phoneId: Phone | undefined;
  }>({
    openForm: false,
    openReplyForm: false,
    formLoading: false,
    openQrModal: false,
    selectedPhone: undefined,
    editReply: undefined,
    phoneId: undefined,
  });
  const router = useRouter();
  const phoneSearch = typeof router.query.phone_search === "string" ? router.query.phone_search : "";
  const returnQuery = phoneSearchQuery(readPhoneSearchState(Object.fromEntries(new URLSearchParams(phoneSearch))));
  //
  const phone_id = typeof router.query.phone_id === "string" ? router.query.phone_id : undefined;
  const phones = useDashboardApi("/api/phones?options=1");
  const [draftPhone, setDraftPhone] = useState<string>();
  useEffect(() => { setDraftPhone(phone_id); }, [phone_id]);
  const selectedDevice = (phones.data || []).find((phone: any) => phone.id === phone_id);
  const phone_num = selectedDevice?.number || (typeof router.query.phone_num === "string" ? router.query.phone_num : "");
  const { data: session } = useSession();
  const [imageReply, setImageReply] = useState<ImageReply>({
    preview: "",
    raw: "",
  });

  const replyData = useAutoReplyData(
    session?.user?.token!,
    phone_id?.toString()
  );

  const { t } = useTranslation("common");
  const [modal, contextHolder] = Modal.useModal();
  const [notif, notificationContext] = notification.useNotification();
  const formAutoRep = useRef<AutoReplyFormModalRef>(null);

  const dataColumn: ColumnsType<AutoReply> = [
    { title: uiText("Balasan terkirim"), dataIndex: "sentCount" },
    { title: uiText("Jeda (detik)"), dataIndex: "delaySeconds" },
    {
      title: t("keyword"),
      key: "keyword",
      dataIndex: "keyword",
    },
    {
      title: uiText("Pencocokan kata kunci"),
      key: "details",
      dataIndex: "details",
      render: (v, row) => (
        <div style={{ whiteSpace: "nowrap" }}>
          <p>
            <span
              style={{
                display: "inline-block",
                padding: "0.1em 0.2em",
                color: "#fff",
                backgroundColor: "#237b38",
                border: "1px solid transparent",
                borderRadius: "0.375rem",
                whiteSpace: "nowrap",
                verticalAlign: "baseline",
              }}
            >
              {{ Equal: uiText("Sama dengan"), Contain: uiText("Berisi"), Any: uiText("Cocok dengan segalanya") }[row.type_keyword]}
            </span>
          </p>
        </div>
      ),
    },
    {
      title: t("reply_status"),
      key: "reply_status",
      dataIndex: "reply_status",
      render: (v, row) => <Switch
        checked={v === "active"}
        checkedChildren={uiText("Aktif")}
        unCheckedChildren={uiText("Tidak aktif")}
        aria-label={`${v === "active" ? "Nonaktifkan" : "Aktifkan"} balasan ${row.keyword || row.id}`}
        loading={replyData.updatingIds.includes(row.id)}
        disabled={replyData.loading || state.openReplyForm}
        onChange={async checked => {
          const result = await replyData.setStatus(row, checked ? "active" : "inactive");
          if (result.success) notif.success({ message: checked ? uiText("Balasan diaktifkan.") : uiText("Balasan dinonaktifkan.") });
          else if (result.error) notif.error({ message: uiText("Status balasan gagal diubah. Silakan coba lagi.") });
        }}
      />,
    },
    {
      title: t("quoted"),
      key: "quoted",
      dataIndex: "quoted",
      render: (v) =>
        v ? (
          <span
            style={{
              display: "inline-block",
              padding: "0.1em 0.2em",
              color: "#fff",
              backgroundColor: "#237b38",
              border: "1px solid transparent",
              borderRadius: "0.375rem",
              whiteSpace: "nowrap",
              verticalAlign: "baseline",
            }}
          >
            {uiText("Active")}</span>
        ) : (
          <span
            style={{
              display: "inline-block",
              padding: "0.1em 0.2em",
              color: "#fff",
              backgroundColor: "#e72e2e",
              border: "1px solid transparent",
              borderRadius: "0.375rem",
              whiteSpace: "nowrap",
              verticalAlign: "baseline",
            }}
          >
            {uiText("Disable")}</span>
        ),
    },
    {
      title: uiText("Jenis balasan"),
      key: "type",
      dataIndex: "type",
      render: (value, row) => value === "ai" ? `AI · ${(row.reply as any)?.provider || ""}` : value,
    },
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
    {
      title: t("action"),
      key: "action",
      dataIndex: "id",
      fixed: "right",
      render: (v, auto_replies) => {
        return (
          <ReplyTableButton
            auto_replies={auto_replies}
            onEditClick={onEditClick}
            onDeleteClick={onDeleteClick}
          />
        );
      },
    },
  ];

  const handleTambahImageReply = (data: ImageReply) => {
    if (data) {
      // setFieldVa("image",data.raw);
      setImageReply({
        preview: data.preview,
        raw: data.raw,
      });
    }
  };

  const onSubmitReply = async (data: AutoReplyFormData) => {
    // return;
    if (imageReply && data.type_message == "image") {
      data.image = imageReply.raw;
    }
    setState({ ...state, formLoading: true });
    const res = await replyData.save(data);
    notif.destroy();
    console.log(res);
    if (res.success) {
      formAutoRep.current?.resetForm();

      notif.success({
        closeIcon: true,
        message: t("save_success"),
      });
      setState({
        ...state,
        openReplyForm: false,
        phoneId: undefined,
        editReply: undefined,
        formLoading: false,
      });
    } else {
      notif.error({
        closeIcon: true,
        message: res.error?.message ? t(res.error.message) : t("save_failed"),
      });
      setState({
        ...state,
        formLoading: false,
      });
    }
  };

  const onCancel = () =>
    setState({
      ...state,
      openForm: false,
      editReply: undefined,
      openReplyForm: false,
      phoneId: undefined,
    });

  const onEditClick = (_reply: AutoReply | undefined) => {
    _reply &&
      setState({
        ...state,
        editReply: _reply,
        openReplyForm: true,
        phoneId: { id: phone_id, number: phone_num } as Phone,
      });
  };

  const onDeleteClick = (_reply: AutoReply | undefined) => {
    _reply &&
      modal.confirm({
        title: t("confirm_delete"),
        content: t("confirm_delete_ask"),
        onOk: async () => {
          const result = await replyData.deleteById(_reply.id, _reply.phoneId);
          notif[result.success ? "success" : "error"]({
            message: result.success ? t("success") : t("failed"),
            description: result.success
              ? t("success_delete")
              : t("failed_delete"),
          });
        },
      });
  };

  return (
    <>
      <Flex gap="middle" vertical>
        <div><Button icon={<ArrowLeftOutlined />} onClick={() => void router.push({ pathname: "/dashboard/phone", query: returnQuery })}>{uiText("Kembali ke Perangkat HP")}</Button></div>
        <Space wrap>
          <label htmlFor="auto-reply-device">{uiText("Perangkat WhatsApp")}</label>
          <Select id="auto-reply-device" value={draftPhone} showSearch optionFilterProp="label"
            placeholder={uiText("Pilih perangkat untuk mengelola balasan otomatis")} style={{ width: 300, maxWidth: "100%" }}
            disabled={state.openReplyForm || state.formLoading}
            options={(phones.data || []).map((phone: any) => ({ value: phone.id, label: `${phone.name} (${phone.number || "—"})` }))}
            onChange={setDraftPhone} />
          <Button type="primary" disabled={!draftPhone || state.openReplyForm || state.formLoading} onClick={() => {
            const phone = (phones.data || []).find((device: any) => device.id === draftPhone);
            setImageReply({ preview: "", raw: "" });
            void router.push({ pathname: router.pathname, query: { ...router.query, phone_id: draftPhone, phone_num: phone?.number || "" } }, undefined, { shallow: true });
            if (draftPhone === phone_id) replyData.refetchReply();
          }}>{uiText("Cari")}</Button>
          <Button
            disabled={!phone_id || replyData.loading}
            onClick={() =>
              setState({
                ...state,
                openReplyForm: true,
                phoneId: { id: phone_id, number: phone_num } as Phone,
              })
            }
          >
            {t("new_reply")}
          </Button>
        </Space>
        {!phone_id && <Alert type="info" showIcon message={uiText("Pilih perangkat untuk melihat dan mengelola balasan otomatis.")} />}
        {selectedDevice && <Alert type={selectedDevice.autoReplyEnabled ? "success" : "info"} showIcon
          message={uiText("Balasan Otomatis perangkat: {{v0}}", { v0: selectedDevice.autoReplyEnabled ? uiText("Aktif") : uiText("Tidak aktif") })}
          description={selectedDevice.autoReplyEnabled
            ? uiText("Hanya aturan balasan yang aktif akan dijalankan.")
            : uiText("Anda dapat menyiapkan aturan balasan terlebih dahulu. Aktifkan Balasan Otomatis melalui Edit Perangkat untuk menjalankannya.")} />}
        {phones.error && <Alert type="error" message={uiText(phones.error)} />}
        {replyData.error && <Alert type="error" message={uiText(replyData.error)} />}
        <AutoReplyFormModal
          ref={formAutoRep}
          loading={state.formLoading}
          open={state.openReplyForm}
          onCancel={onCancel}
          onSubmitReply={onSubmitReply}
          onChangeImageReply={handleTambahImageReply}
          editReply={state.editReply}
          phoneId={state.phoneId}
        />
        <Table
          loading={replyData.loading}
          className="table-with-data-count"
          rowKey="id"
          pagination={{ showTotal: total => uiText("Jumlah data: {{v0}}", { v0: total.toLocaleString(uiText.locale) }) }}
          scroll={{ x: true }}
          onRow={(record) => {
            return {
              onContextMenu: (event) => {
                event.preventDefault();
              },
            };
          }}
          dataSource={replyData.auto_replies}
          columns={dataColumn}
        />
        <ModalQrCode
          userId={session?.user?.id}
          open={state.openQrModal}
          phone={state.selectedPhone || undefined}
          onClose={() => setState({ ...state, openQrModal: false })}
        />

        {contextHolder}
        {notificationContext}
      </Flex>
    </>
  );
};

export const getStaticProps = async ({ locale }: { locale: string }) => ({
  props: {
    ...(await serverSideTranslations(locale, ["common", "upgrade", "interface"])),
  },
});

AutoReplyPage.getLayout = function getLayout(page: ReactElement) {
  return <Layout title="Balasan Otomatis">{page}</Layout>;
};

export default AutoReplyPage;
