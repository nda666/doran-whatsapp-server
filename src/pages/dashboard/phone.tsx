import Layout from "@/components/Layout";
import ModalQrCode from "@/components/phone/ModalQrCode";
import PhoneFormModal, {
  PhoneFormData,
  PhoneFormModalRef,
} from "@/components/phone/PhoneFormModal";
import PhoneTableButton from "@/components/phone/PhoneTableButton";
import usePhoneData from "@/lib/usePhoneData";
import useSocket from "@/lib/useSocket";
import { SocketEvent } from "@/lib/useSocket";
import useWhatsappBot from "@/lib/useWhatsappBot";
import { Phone, User } from "@prisma/client";
import { Button, Dropdown, Menu, Modal, Table, notification } from "antd";
import { ColumnsType } from "antd/es/table";
import { AxiosError } from "axios";
import dayjs from "dayjs";
import { getToken } from "next-auth/jwt";
import { useSession } from "next-auth/react";
import { i18n, useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useRouter } from "next/router";
import {
  ReactElement,
  SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import io from "socket.io-client";

const PhonePage = () => {
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
  const [socketOption, setSocketOption] = useState<any>(undefined);
  const { socket, setEvents } = useSocket(socketOption);
  const { t, i18n } = useTranslation("common");
  const [modal, contextHolder] = Modal.useModal();
  const [api, notificationContext] = notification.useNotification();
  const form = useRef<PhoneFormModalRef>(null);
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
    });
    return () => {
      setSocketOption(undefined);
    };
  }, [phoneData.phones]);

  useEffect(() => {
    if (!socketOption || state.openForm) {
      socket?.disconnect();
      return;
    }
    const events: SetStateAction<SocketEvent[] | null> = [];

    events.push({
      name: `connectionState`,
      handler: (connection) => {
        setPhoneOnline([...phoneOnline, connection.phoneId]);
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
  }, [socketOption, state.openForm]);

  const dataColumn: ColumnsType<Phone> = [
    {
      title: t("name"),
      key: "name",
      dataIndex: "name",
    },
    {
      title: "Api Token",
      key: "token",
      dataIndex: "token",
    },
    {
      title: t("isOnline"),
      key: "id",
      dataIndex: "id",
      render: (v) => (phoneOnline.includes(v) ? "Online" : "Offline"),
    },
    {
      title: t("created_at"),
      key: "createdAt",
      dataIndex: "createdAt",
      render: (v) => dayjs(v).format("DD/MM/YYYY HH:mm"),
    },
    {
      title: t("action"),
      key: "action",
      dataIndex: "id",
      render: (v, phone) => {
        return (
          <PhoneTableButton
            phone={phone}
            onEditClick={(_phone) => {
              _phone &&
                setState({ ...state, editPhone: _phone, openForm: true });
            }}
            onDeleteClick={(_phone) => {
              _phone &&
                modal.confirm({
                  title: t("confirm_delete"),
                  content: t("confirm_delete_ask"),
                  onOk: async () => {
                    const result = await phoneData.deleteById(_phone.id);
                    api[result.success ? "success" : "error"]({
                      message: result.success ? t("success") : t("failed"),
                      description: result.success
                        ? t("success_delete")
                        : t("failed_delete"),
                    });
                  },
                });
            }}
            onGetQrCodeClick={(_phone) => {
              _phone &&
                setState({
                  ...state,
                  selectedPhone: _phone,
                  openQrModal: true,
                });
            }}
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
  return (
    <>
      <Button onClick={() => setState({ ...state, openForm: true })}>
        {t("add_devices")}
      </Button>
      <PhoneFormModal
        ref={form}
        loading={state.formLoading}
        open={state.openForm}
        onCancel={onCancel}
        onSubmit={onSubmit}
        editPhone={state.editPhone}
      />
      <Table dataSource={phoneData.phones} columns={dataColumn} />
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

PhonePage.getLayout = function getLayout(page: ReactElement) {
  const title = () => i18n?.t("phone_devices") || "";
  return <Layout title={title().toUpperCase()}>{page}</Layout>;
};

export default PhonePage;
