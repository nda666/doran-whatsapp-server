import { ReactElement, useRef, useState } from "react";

import { Button, Flex, Modal, notification, Table } from "antd";
import { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useSession } from "next-auth/react";
import { i18n, useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useRouter } from "next/router";

import AutoReplyFormModal from "@/components/auto-reply/AutoReplyFormModal";
import ReplyTableButton from "@/components/auto-reply/ReplyTableButton";
import Layout from "@/components/Layout";
import ModalQrCode from "@/components/phone/ModalQrCode";
import { PhoneFormModalRef } from "@/components/phone/PhoneFormModal";
import useAutoReplyData from "@/lib/useAutoReplyData";
import {
  AutoReplyFormData,
  AutoReplyFormModalRef,
  ImageReply,
} from "@/types/components/IAutoReplyFormModal";
import { AutoReply, Phone } from "@prisma/client";

const AutoReplyPage = () => {
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
  //
  const phone_id = router.query.phone_id ? router.query.phone_id : undefined;

  const phone_num = router.query.phone_num;
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
  const form = useRef<PhoneFormModalRef>(null);
  const formAutoRep = useRef<AutoReplyFormModalRef>(null);

  const dataColumn: ColumnsType<AutoReply> = [
    {
      title: t("keyword"),
      key: "keyword",
      dataIndex: "keyword",
    },
    {
      title: t("details"),
      key: "details",
      dataIndex: "details",
      render: (v, row) => (
        <div style={{ whiteSpace: "nowrap" }}>
          <p>
            Will respond if Keyword{" "}
            <span
              style={{
                display: "inline-block",
                padding: "0.1em 0.2em",
                color: "#fff",
                backgroundColor: "#12bf24",
                border: "1px solid transparent",
                borderRadius: "0.375rem",
                whiteSpace: "nowrap",
                verticalAlign: "baseline",
              }}
            >
              {row.type_keyword}
            </span>
          </p>
        </div>
      ),
    },
    {
      title: t("reply_status"),
      key: "reply_status",
      dataIndex: "reply_status",
      render: (v) => <div style={{ whiteSpace: "nowrap" }}>{v}</div>,
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
              backgroundColor: "#12bf24",
              border: "1px solid transparent",
              borderRadius: "0.375rem",
              whiteSpace: "nowrap",
              verticalAlign: "baseline",
            }}
          >
            Active
          </span>
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
            Disable
          </span>
        ),
    },
    {
      title: "type",
      key: "type",
      dataIndex: "type",
      //   render: (v) => (v ? "Online" : "Offline"),
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
      form.current?.resetForm();

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
        <Flex>
          <Button
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
        </Flex>
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
    ...(await serverSideTranslations(locale, ["common"])),
  },
});

AutoReplyPage.getLayout = function getLayout(page: ReactElement) {
  const title = () => i18n?.t("auto_reply") || "";
  return <Layout title={title().toUpperCase()}>{page}</Layout>;
};

export default AutoReplyPage;
