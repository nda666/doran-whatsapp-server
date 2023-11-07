import Layout from "@/components/Layout";
import AutoReplyFormModal, {
  AutoReplyFormModalRef,
  AutoReplyFormData,
  ImageReply,
} from "@/components/auto-reply/AutoReplyFormModal";
import ModalQrCode from "@/components/phone/ModalQrCode";
import PhoneFormModal, {
  PhoneFormData,
  PhoneFormModalRef,
} from "@/components/phone/PhoneFormModal";
// import PhoneTableButton from "@/components/phone/PhoneTableButton";
import ReplyTableButton from "@/components/auto-reply/ReplyTableButton";
import { copyToClipboard } from "@/lib/copyToClipboard";
import useAutoReplyData from "@/lib/useAutoReplyData";
import usePhoneData from "@/lib/usePhoneData";
import useSocket from "@/lib/useSocket";
import { SocketEvent } from "@/lib/useSocket";
import useWhatsappBot from "@/lib/useWhatsappBot";
import { AutoReply, Phone, User } from "@prisma/client";
import {
  Button,
  Dropdown,
  Menu,
  Modal,
  Space,
  Table,
  notification,
} from "antd";
import { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useSession } from "next-auth/react";
import { i18n, useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useRouter } from "next/router";
import {
  ReactElement,
  SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

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
  // console.log(router.query);
  const phone_id = router.query.phone_id ? router.query.phone_id : undefined;
  const phone_num = router.query.phone_num;
  const { data: session } = useSession();
  const [imageReply, setImageReply] = useState<ImageReply>({
    preview: "",
    raw: "",
  });
  const phoneData = usePhoneData(session?.user?.token!);
  const replyData = useAutoReplyData(
    session?.user?.token!,
    phone_id?.toString()
  );
  const [phoneOnline, setPhoneOnline] = useState<string[]>([]);
  const [socketOption, setSocketOption] = useState<any>({
    autoConnect: false,
    transports: ["websocket"],
  });
  const { socket, setEvents } = useSocket(socketOption);
  const { t, i18n } = useTranslation("common");
  const [modal, contextHolder] = Modal.useModal();
  const [notif, notificationContext] = notification.useNotification();
  const form = useRef<PhoneFormModalRef>(null);
  const formAutoRep = useRef<AutoReplyFormModalRef>(null);
  useEffect(() => {
    if ((phoneData.phones?.length || 0) <= 0) {
      setSocketOption(undefined);
      return;
    }
    setSocketOption({
      query: {
        userId: session?.user?.id,
        phoneId: phoneData.phones?.map((x) => x.id),
      },
      autoConnect: false,
      transports: ["websocket"],
    });
    return () => {
      setSocketOption(undefined);
    };
  }, [phoneData.phones]);

  const setPh = (phoneId: string) => {
    // !phoneOnline.includes(phoneId) &&
    //   setPhoneOnline((prevArr) => [...prevArr, phoneId]);
  };

  // console.log("phoneOnline", phoneOnline);

  useEffect(() => {
    if (!socketOption || state.openQrModal || state.openQrModal) {
      // console.log("disconnect");
      setEvents([]);
      socket?.disconnect();
      return;
    }
    const events: SetStateAction<SocketEvent[] | null> = [];

    events.push({
      name: `isOnline`,
      handler: (connection) => {
        // console.log(connection);
        setPh(connection.phoneId);
      },
    });
    events.push({
      name: `waUser`,
      handler: (waUser) => {
        let _phones = phoneData.phones;
        let editPhones = _phones?.find((x) => x.id === waUser.phoneId);
        if (editPhones) {
          editPhones.account_name = waUser.waUser.name;
          editPhones.number = waUser.waUser.id.split(":")[0];
          phoneData.setPhones(_phones);
        }
      },
    });

    events.push({
      name: "connect",
      handler: () => {
        // console.log("connect");
      },
    });
    setEvents(events);
    socket?.connect();
    return () => {
      setEvents([]);
      socket?.disconnect();
    };
  }, [socketOption, state.openForm, state.openQrModal]);

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
            // onAutoReply={
            //   (_phone: Phone | undefined) => {
            //     _phone &&
            //       setState({...state, openReplyForm: true, phoneId: _phone })
            //   }
            // }
            onEditClick={onEditClick}
            onDeleteClick={onDeleteClick}
          />
        );
      },
    },
  ];

  const handleTambahImageReply = (data: ImageReply) => {
    if(data) {
        // setFieldVa("image",data.raw);
        setImageReply({
            preview: data.preview,
            raw: data.raw
        });  
    }
  };

  const onSubmitReply = async (data: AutoReplyFormData) => {
    // console.log(data);
    if(imageReply && (data.type_message == 'image')) {
      data.image = imageReply.raw
    }
    setState({ ...state, formLoading: true });
    const res = await replyData.save(data);
    if (res.success) {
      form.current?.resetForm();
    }
    setState({
      ...state,
      formLoading: false,
      openReplyForm: false,
      phoneId: undefined,
      editReply: undefined,
    });
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
