"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStaticProps = void 0;
const Layout_1 = __importDefault(require("@/components/Layout"));
const ModalQrCode_1 = __importDefault(require("@/components/phone/ModalQrCode"));
const PhoneFormModal_1 = __importDefault(require("@/components/phone/PhoneFormModal"));
const PhoneTableButton_1 = __importDefault(require("@/components/phone/PhoneTableButton"));
const copyToClipboard_1 = require("@/lib/copyToClipboard");
const usePhoneData_1 = __importDefault(require("@/lib/usePhoneData"));
const useSocket_1 = __importDefault(require("@/lib/useSocket"));
const antd_1 = require("antd");
const dayjs_1 = __importDefault(require("dayjs"));
const react_1 = require("next-auth/react");
const next_i18next_1 = require("next-i18next");
const serverSideTranslations_1 = require("next-i18next/serverSideTranslations");
const react_2 = require("react");
const PhonePage = () => {
    var _a, _b;
    const [state, setState] = (0, react_2.useState)({
        openForm: false,
        formLoading: false,
        openQrModal: false,
        selectedPhone: undefined,
        editPhone: undefined,
    });
    const { data: session } = (0, react_1.useSession)();
    const phoneData = (0, usePhoneData_1.default)((_a = session === null || session === void 0 ? void 0 : session.user) === null || _a === void 0 ? void 0 : _a.token);
    const [phoneOnline, setPhoneOnline] = (0, react_2.useState)([]);
    const [socketOption, setSocketOption] = (0, react_2.useState)(undefined);
    const { socket, setEvents } = (0, useSocket_1.default)(socketOption);
    const { t, i18n } = (0, next_i18next_1.useTranslation)("common");
    const [modal, contextHolder] = antd_1.Modal.useModal();
    const [notif, notificationContext] = antd_1.notification.useNotification();
    const form = (0, react_2.useRef)(null);
    (0, react_2.useEffect)(() => {
        var _a, _b, _c;
        if ((((_a = phoneData.phones) === null || _a === void 0 ? void 0 : _a.length) || 0) <= 0) {
            setSocketOption(undefined);
            return;
        }
        setSocketOption({
            query: {
                userId: (_b = session === null || session === void 0 ? void 0 : session.user) === null || _b === void 0 ? void 0 : _b.id,
                phoneId: (_c = phoneData.phones) === null || _c === void 0 ? void 0 : _c.map((x) => x.id),
            },
            autoConnect: false,
        });
        return () => {
            setSocketOption(undefined);
        };
    }, [phoneData.phones]);
    (0, react_2.useEffect)(() => {
        if (!socketOption || state.openForm) {
            socket === null || socket === void 0 ? void 0 : socket.disconnect();
            return;
        }
        const events = [];
        events.push({
            name: `isOnline`,
            handler: (connection) => {
                console.log("isOnline", connection);
                setPhoneOnline([...phoneOnline, connection.phoneId]);
            },
        });
        events.push({
            name: `waUser`,
            handler: (waUser) => {
                let _phones = phoneData.phones;
                let editPhones = _phones === null || _phones === void 0 ? void 0 : _phones.find((x) => x.id === waUser.phoneId);
                if (editPhones) {
                    editPhones.account_name = waUser.waUser.name;
                    editPhones.number = waUser.waUser.id.split(":")[0];
                    phoneData.setPhones(_phones);
                    console.log("waUser updated", waUser);
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
        socket === null || socket === void 0 ? void 0 : socket.connect();
        return () => {
            setEvents([]);
            socket === null || socket === void 0 ? void 0 : socket.disconnect();
        };
    }, [socketOption, state.openForm]);
    const dataColumn = [
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
            render: (v) => (<antd_1.Space direction="horizontal" style={{ whiteSpace: "nowrap" }}>
          <antd_1.Button onClick={async () => {
                    await (0, copyToClipboard_1.copyToClipboard)({ value: v });
                    notif.destroy();
                    notif.success({
                        closeIcon: false,
                        duration: 3,
                        message: t("text_copied", { text: '"Token"' }).toString() || "Copied",
                        placement: "bottom",
                    });
                }}>
            Copy
          </antd_1.Button>
          <div>{v}</div>
        </antd_1.Space>),
        },
        {
            title: "Online",
            key: "id",
            dataIndex: "id",
            render: (v) => (phoneOnline.includes(v) ? "Online" : "Offline"),
        },
        {
            title: t("created_at"),
            key: "createdAt",
            dataIndex: "createdAt",
            render: (v) => (<div style={{ whiteSpace: "nowrap" }}>
          {(0, dayjs_1.default)(v).format("DD/MM/YYYY HH:mm")}
        </div>),
        },
        {
            title: t("action"),
            key: "action",
            dataIndex: "id",
            fixed: "right",
            render: (v, phone) => {
                return (<PhoneTableButton_1.default phone={phone} onEditClick={onEditClick} onDeleteClick={onDeleteClick} onGetQrCodeClick={onGetQrCodeClick}/>);
            },
        },
    ];
    const onSubmit = async (data) => {
        var _a;
        setState({ ...state, formLoading: true });
        const res = await phoneData.save(data);
        if (res.success) {
            (_a = form.current) === null || _a === void 0 ? void 0 : _a.resetForm();
        }
        setState({
            ...state,
            formLoading: false,
            openForm: false,
            editPhone: undefined,
        });
    };
    const onCancel = () => setState({ ...state, openForm: false, editPhone: undefined });
    const onEditClick = (_phone) => {
        _phone && setState({ ...state, editPhone: _phone, openForm: true });
    };
    const onDeleteClick = (_phone) => {
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
    const onGetQrCodeClick = (_phone) => {
        _phone &&
            setState({
                ...state,
                selectedPhone: _phone,
                openQrModal: true,
            });
    };
    return (<>
      <antd_1.Button onClick={() => setState({ ...state, openForm: true })}>
        {t("add_devices")}
      </antd_1.Button>
      <PhoneFormModal_1.default ref={form} loading={state.formLoading} open={state.openForm} onCancel={onCancel} onSubmit={onSubmit} editPhone={state.editPhone}/>
      <antd_1.Table scroll={{ x: true }} onRow={(record) => {
            return {
                onContextMenu: (event) => {
                    event.preventDefault();
                    console.log(record);
                },
            };
        }} dataSource={phoneData.phones} columns={dataColumn}/>
      <ModalQrCode_1.default userId={(_b = session === null || session === void 0 ? void 0 : session.user) === null || _b === void 0 ? void 0 : _b.id} open={state.openQrModal} phone={state.selectedPhone || undefined} onClose={() => setState({ ...state, openQrModal: false })}/>

      {contextHolder}
      {notificationContext}
    </>);
};
const getStaticProps = async ({ locale }) => ({
    props: {
        ...(await (0, serverSideTranslations_1.serverSideTranslations)(locale, ["common"])),
    },
});
exports.getStaticProps = getStaticProps;
PhonePage.getLayout = function getLayout(page) {
    const title = () => (next_i18next_1.i18n === null || next_i18next_1.i18n === void 0 ? void 0 : next_i18next_1.i18n.t("phone_devices")) || "";
    return <Layout_1.default title={title().toUpperCase()}>{page}</Layout_1.default>;
};
exports.default = PhonePage;
