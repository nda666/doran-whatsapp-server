import {
  ReactElement,
  SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";

import { Button, Flex, Modal, notification, Space, Switch, Table } from "antd";
import { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useSession } from "next-auth/react";
import { i18n, useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useRouter } from "next/router";

import Layout from "@/components/Layout";
import ModalQrCode from "@/components/phone/ModalQrCode";
import PhoneFormModal, {
  PhoneFormData,
  PhoneFormModalRef,
} from "@/components/phone/PhoneFormModal";
import PhoneTableButton from "@/components/phone/PhoneTableButton";
import SearchPhoneForm from "@/components/phone/SearchPhoneForm";
import usePhoneData from "@/lib/usePhoneData";
import useSocket, { SocketEvent } from "@/lib/useSocket";
import { copyToClipboard } from "@/utils/copyToClipboard";
import { Phone } from "@prisma/client";

const PhonePage = () => {
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

  const [searchQuery, setSearchQuery] = useState({
    number: undefined,
    name: undefined,
    is_online: undefined,
  });
  const phoneData = usePhoneData(session?.user?.token!, searchQuery);
  const [showSearch, setShowSearch] = useState(true);
  const [phoneOnline, setPhoneOnline] = useState<string[]>([]);
  const [socketOption, setSocketOption] = useState<any>(undefined);
  const { socket, setEvents } = useSocket(socketOption);
  const { t } = useTranslation("common");
  const [modal, contextHolder] = Modal.useModal();
  const [notif, notificationContext] = notification.useNotification();
  const form = useRef<PhoneFormModalRef>(null);
  const router = useRouter();

  useEffect(() => {
    if ((phoneData.phones?.length || 0) <= 0) {
      setSocketOption(undefined);
      return;
    }

    setSocketOption({
      path: "/socket.io",
      query: {
        userId: session?.user?.id,
        phoneId: phoneData.phones?.map((x) => x.id),
      },
      autoConnect: false,
      transports: ["websocket"],
    });
    return () => {
      // setSocketOption(undefined);
    };
  }, [phoneData.phones]);

  const setPh = (phoneId: string) => {
    // !phoneOnline.includes(phoneId) &&
    //   setPhoneOnline((prevArr) => [...prevArr, phoneId]);
  };

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
        //
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
      title: t("name"),
      key: "name",
      dataIndex: "name",
    },
    {
      title: t("number"),
      key: "number",
      dataIndex: "number",
    },
    {
      title: t("account_name"),
      key: "account_name",
      dataIndex: "account_name",
      render: (v) => <div style={{ whiteSpace: "nowrap" }}>{v}</div>,
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
            Copy
          </Button>
          <div>{v}</div>
        </Space>
      ),
    },
    {
      title: "Online",
      key: "isOnline",
      dataIndex: "isOnline",
      render: (v) => (v ? "Online" : "Offline"),
    },
    {
      title: "Save Group",
      key: "is_save_group",
      dataIndex: "is_save_group",
      render: (v, phone) => (
        <Switch
          defaultChecked={v ? true : false}
          checkedChildren="On"
          unCheckedChildren="Off"
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
      render: (v, phone) => {
        return (
          <PhoneTableButton
            phone={phone}
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
                },
              })
            }
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
        <Flex gap="middle">
          <Button
            type="primary"
            onClick={() => setState({ ...state, openForm: true })}
          >
            {t("add_devices")}
          </Button>
          <Button onClick={() => setShowSearch(!showSearch)}>
            {showSearch ? t("hide_search") : t("show_search")}
          </Button>
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
          onSubmitSuccess={(data) => {
            setSearchQuery(data);
            phoneData.refetchPhone();
          }}
        />
        <Table
          scroll={{ x: true }}
          onRow={(record) => {
            return {
              onContextMenu: (event) => {
                event.preventDefault();
                //
              },
            };
          }}
          dataSource={phoneData.phones}
          columns={dataColumn}
          rowKey="id"
        />
        <ModalQrCode
          token={session?.user?.token!}
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

PhonePage.getLayout = function getLayout(page: ReactElement) {
  const title = () => i18n?.t("phone_devices") || "";
  return <Layout title={title().toUpperCase()}>{page}</Layout>;
};

export default PhonePage;
