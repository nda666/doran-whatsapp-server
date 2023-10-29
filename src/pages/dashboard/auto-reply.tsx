import Layout from "@/components/Layout";
import ModalQrCode from "@/components/phone/ModalQrCode";
import PhoneFormModal, {
  PhoneFormData,
  PhoneFormModalRef,
} from "@/components/phone/PhoneFormModal";
import PhoneTableButton from "@/components/phone/PhoneTableButton";
import { copyToClipboard } from "@/lib/copyToClipboard";
import usePhoneData from "@/lib/usePhoneData";
import useSocket from "@/lib/useSocket";
import { SocketEvent } from "@/lib/useSocket";
import useWhatsappBot from "@/lib/useWhatsappBot";
import { Phone, User } from "@prisma/client";
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
import {
  ReactElement,
  SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const AutoReply = () => {
  const [state, setState] = useState<{
    openForm: boolean;
    formLoading: boolean;
    openQrModal: boolean;
    selectedPhone: Phone | undefined;
    editPhone: Phone | undefined;
  }>({
    openForm: false,
    formLoading: false,
    openQrModal: false,
    selectedPhone: undefined,
    editPhone: undefined,
  });
  const { data: session } = useSession();
  const phoneData = usePhoneData(session?.user?.token!);
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
  useEffect(() => {
    if ((phoneData.phones?.length || 0) <= 0) {
      setSocketOption(undefined);
      return;
    }
    console.log("123123123");
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

  console.log("phoneOnline", phoneOnline);

  useEffect(() => {
    if (!socketOption || state.openQrModal || state.openQrModal) {
      console.log("disconnect");
      setEvents([]);
      socket?.disconnect();
      return;
    }
    const events: SetStateAction<SocketEvent[] | null> = [];

    events.push({
      name: `isOnline`,
      handler: (connection) => {
        console.log(connection);
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
        console.log("connect");
      },
    });
    setEvents(events);
    socket?.connect();
    return () => {
      setEvents([]);
      socket?.disconnect();
    };
  }, [socketOption, state.openForm, state.openQrModal]);

  const dataColumn: ColumnsType<Phone> = [
    {
      title: t("keyword"),
      key: "keyword",
      dataIndex: "name",
    },
    {
      title: t("details"),
      key: "details",
      dataIndex: "number",
    },
    {
      title: t("status"),
      key: "status",
      dataIndex: "account_name",
      render: (v) => <div style={{ whiteSpace: "nowrap" }}>{v}</div>,
    },
    {
      title: t("quoted"),
      key: "quoted",
      dataIndex: "quoted",
    },
    {
      title: "type",
      key: "type",
      dataIndex: "type",
    //   render: (v) => (v ? "Online" : "Offline"),
    },
    // {
    //   title: t("created_at"),
    //   key: "createdAt",
    //   dataIndex: "createdAt",
    //   render: (v) => (
    //     <div style={{ whiteSpace: "nowrap" }}>
    //       {dayjs(v).format("DD/MM/YYYY HH:mm")}
    //     </div>
    //   ),
    // },
    {
      title: t("action"),
      key: "action",
      dataIndex: "id",
      fixed: "right",
      render: (v, phone) => {
        return (
          <PhoneTableButton
            phone={phone}
            onEditClick={onEditClick}
            onDeleteClick={onDeleteClick}
            onGetQrCodeClick={onGetQrCodeClick}
          />
        );
      },
    },
  ];

  const onSubmit = async (data: PhoneFormData) => {
    setState({ ...state, formLoading: true });
    const res = await phoneData.save(data);
    if (res.success) {
      form.current?.resetForm();
    }
    setState({
      ...state,
      formLoading: false,
      openForm: false,
      editPhone: undefined,
    });
  };
  const onCancel = () =>
    setState({ ...state, openForm: false, editPhone: undefined });

  const onEditClick = (_phone: Phone | undefined) => {
    _phone && setState({ ...state, editPhone: _phone, openForm: true });
  };

  const onDeleteClick = (_phone: Phone | undefined) => {
    _phone &&
      modal.confirm({
        title: t("confirm_delete"),
        content: t("confirm_delete_ask"),
        onOk: async () => {
          const result = await phoneData.deleteById(_phone.id);
          notif[result.success ? "success" : "error"]({
            message: result.success ? t("success") : t("failed"),
            description: result.success
              ? t("success_delete")
              : t("failed_delete"),
          });
        },
      });
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
      <Button onClick={() => setState({ ...state, openForm: true })}>
        {t("new_reply")}
      </Button>
      <PhoneFormModal
        ref={form}
        loading={state.formLoading}
        open={state.openForm}
        onCancel={onCancel}
        onSubmit={onSubmit}
        editPhone={state.editPhone}
      />
      <Table
        scroll={{ x: true }}
        onRow={(record) => {
          return {
            onContextMenu: (event) => {
              event.preventDefault();
              console.log(record);
            },
          };
        }}
        dataSource={phoneData.phones}
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

AutoReply.getLayout = function getLayout(page: ReactElement) {
  const title = () => i18n?.t("auto_reply") || "";
  return <Layout title={title().toUpperCase()}>{page}</Layout>;
};

export default AutoReply;
