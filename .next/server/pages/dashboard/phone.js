"use strict";
(() => {
var exports = {};
exports.id = 625;
exports.ids = [625];
exports.modules = {

/***/ 6484:
/***/ ((module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.a(module, async (__webpack_handle_async_dependencies__, __webpack_async_result__) => { try {
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Z": () => (/* binding */ ModalQrCode)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(997);
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _lib_useSocket__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(6019);
/* harmony import */ var antd__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(5725);
/* harmony import */ var antd__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(antd__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var qrcode_react__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(3860);
/* harmony import */ var qrcode_react__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(qrcode_react__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(6689);
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_4___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_4__);
/* harmony import */ var next_i18next__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(1377);
/* harmony import */ var next_i18next__WEBPACK_IMPORTED_MODULE_5___default = /*#__PURE__*/__webpack_require__.n(next_i18next__WEBPACK_IMPORTED_MODULE_5__);
var __webpack_async_dependencies__ = __webpack_handle_async_dependencies__([_lib_useSocket__WEBPACK_IMPORTED_MODULE_1__]);
_lib_useSocket__WEBPACK_IMPORTED_MODULE_1__ = (__webpack_async_dependencies__.then ? (await __webpack_async_dependencies__)() : __webpack_async_dependencies__)[0];






function ModalQrCode({ open , phone , userId , ...props }) {
    const [waQrCode, setWaQrCode] = (0,react__WEBPACK_IMPORTED_MODULE_4__.useState)(undefined);
    const [waQrCodeTimeout, setWaQrCodeTimeout] = (0,react__WEBPACK_IMPORTED_MODULE_4__.useState)(0);
    const [isOnline, setIsOnline] = (0,react__WEBPACK_IMPORTED_MODULE_4__.useState)(false);
    const [isLoading, setIsLoading] = (0,react__WEBPACK_IMPORTED_MODULE_4__.useState)(false);
    const { socket , setEvents  } = (0,_lib_useSocket__WEBPACK_IMPORTED_MODULE_1__/* ["default"] */ .Z)({
        query: {
            phoneId: phone?.id,
            userId: userId
        }
    });
    const { t  } = (0,next_i18next__WEBPACK_IMPORTED_MODULE_5__.useTranslation)();
    (0,react__WEBPACK_IMPORTED_MODULE_4__.useEffect)(()=>{
        if (!open || !phone) {
            setEvents(null);
            socket?.disconnect();
            return;
        }
        setEvents([
            {
                name: "connect",
                handler () {
                    console.log("connect", "connected");
                }
            },
            {
                name: "disconnect",
                handler () {
                    console.log("connect", "disconnect");
                }
            },
            {
                name: "credsUpdate",
                handler (credsUpdate) {
                    if ("accountSyncCounter" in credsUpdate) {}
                }
            },
            {
                name: "authState",
                handler (authState) {
                    console.log("authState", authState);
                }
            },
            {
                name: "connectionState",
                handler (connectionState) {
                    console.log(connectionState);
                    if ("isOnline" in connectionState) {
                        props.onClose && props.onClose();
                    }
                    if ("connection" in connectionState) {
                        setIsLoading(connectionState.connection === "connecting");
                    }
                }
            },
            {
                name: "qr",
                handler (qr) {
                    if (qr.phoneId == phone?.id) {
                        console.log(qr);
                        setWaQrCode(qr.qr);
                        setWaQrCodeTimeout(qr.timeout > 0 ? qr.timeout / 1000 : 0);
                    }
                }
            }
        ]);
    }, [
        open,
        phone
    ]);
    (0,react__WEBPACK_IMPORTED_MODULE_4__.useEffect)(()=>{
        const timer = setInterval(()=>{
            setWaQrCodeTimeout(waQrCodeTimeout - 1);
        }, 1000);
        return ()=>{
            clearInterval(timer);
        };
    }, [
        waQrCodeTimeout
    ]);
    return /*#__PURE__*/ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.Fragment, {
        children: /*#__PURE__*/ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx(antd__WEBPACK_IMPORTED_MODULE_2__.Modal, {
            title: t("whatsaap_qrcode"),
            closable: false,
            open: open,
            onCancel: ()=>{
                setWaQrCode(undefined);
                props?.onClose && props?.onClose();
            },
            children: /*#__PURE__*/ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx(antd__WEBPACK_IMPORTED_MODULE_2__.Space, {
                direction: "vertical",
                style: {
                    display: "flex",
                    width: "100%",
                    alignItems: "center"
                },
                children: waQrCode ? /*#__PURE__*/ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.Fragment, {
                    children: [
                        /*#__PURE__*/ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx(qrcode_react__WEBPACK_IMPORTED_MODULE_3__.QRCodeSVG, {
                            style: {
                                margin: "0 auto"
                            },
                            width: "300px",
                            height: "300px",
                            value: waQrCode
                        }),
                        /*#__PURE__*/ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(antd__WEBPACK_IMPORTED_MODULE_2__.Typography.Text, {
                            children: [
                                t("timeout"),
                                ": ",
                                waQrCodeTimeout
                            ]
                        }),
                        /*#__PURE__*/ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx(antd__WEBPACK_IMPORTED_MODULE_2__.Typography.Text, {
                            children: t("please_scan_qrcode")
                        })
                    ]
                }) : /*#__PURE__*/ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.Fragment, {
                    children: [
                        /*#__PURE__*/ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx(antd__WEBPACK_IMPORTED_MODULE_2__.Typography.Text, {
                            children: t("getting_qrcode")
                        }),
                        /*#__PURE__*/ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx(antd__WEBPACK_IMPORTED_MODULE_2__.Spin, {
                            size: "large"
                        })
                    ]
                })
            })
        })
    });
}

__webpack_async_result__();
} catch(e) { __webpack_async_result__(e); } });

/***/ }),

/***/ 8981:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Z": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(997);
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(6689);
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var antd__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(5725);
/* harmony import */ var antd__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(antd__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var next_i18next__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(1377);
/* harmony import */ var next_i18next__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(next_i18next__WEBPACK_IMPORTED_MODULE_3__);




const PhoneFormModal = /*#__PURE__*/ (0,react__WEBPACK_IMPORTED_MODULE_1__.forwardRef)(({ open , onSubmit , onCancel , editPhone , ...props }, ref)=>{
    const { t  } = (0,next_i18next__WEBPACK_IMPORTED_MODULE_3__.useTranslation)("common");
    const [form] = antd__WEBPACK_IMPORTED_MODULE_2__.Form.useForm();
    (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(()=>{
        if (editPhone) {
            form.setFieldValue("id", editPhone.id);
            form.setFieldValue("name", editPhone.name);
        }
        return ()=>{
            form.resetFields();
        };
    }, [
        editPhone
    ]);
    const resetForm = ()=>{
        form.resetFields();
    };
    (0,react__WEBPACK_IMPORTED_MODULE_1__.useImperativeHandle)(ref, ()=>({
            resetForm
        }));
    return /*#__PURE__*/ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx(antd__WEBPACK_IMPORTED_MODULE_2__.Modal, {
        open: open,
        title: props.title || "",
        okText: t("save"),
        cancelText: t("cancel"),
        onCancel: onCancel,
        okButtonProps: {
            loading: props?.loading
        },
        cancelButtonProps: {
            disabled: props?.loading
        },
        onOk: ()=>{
            form?.validateFields().then((values)=>{
                onSubmit(values);
            }).catch((info)=>{});
        },
        children: /*#__PURE__*/ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(antd__WEBPACK_IMPORTED_MODULE_2__.Form, {
            disabled: props?.loading,
            form: form,
            layout: "vertical",
            name: "phone-form",
            initialValues: {
                modifier: "public"
            },
            children: [
                /*#__PURE__*/ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx(antd__WEBPACK_IMPORTED_MODULE_2__.Form.Item, {
                    name: "id",
                    hidden: true,
                    children: /*#__PURE__*/ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx(antd__WEBPACK_IMPORTED_MODULE_2__.Input, {})
                }),
                /*#__PURE__*/ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx(antd__WEBPACK_IMPORTED_MODULE_2__.Form.Item, {
                    name: "name",
                    label: t("name"),
                    rules: [
                        {
                            required: true,
                            message: t("validation.required", {
                                field: t("name")
                            }).toString()
                        }
                    ],
                    children: /*#__PURE__*/ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx(antd__WEBPACK_IMPORTED_MODULE_2__.Input, {})
                })
            ]
        })
    });
});
PhoneFormModal.displayName = "PhoneFormModal";
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (PhoneFormModal);


/***/ }),

/***/ 4292:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Z": () => (/* binding */ PhoneTableButton)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(997);
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _ant_design_icons__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(7066);
/* harmony import */ var _ant_design_icons__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_ant_design_icons__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var antd__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(5725);
/* harmony import */ var antd__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(antd__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var next_i18next__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(1377);
/* harmony import */ var next_i18next__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(next_i18next__WEBPACK_IMPORTED_MODULE_3__);




function PhoneTableButton({ phone , onEditClick , onGetQrCodeClick , onDeleteClick  }) {
    const { t  } = (0,next_i18next__WEBPACK_IMPORTED_MODULE_3__.useTranslation)("common");
    const items = [
        {
            label: t("edit"),
            key: "1",
            icon: /*#__PURE__*/ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx(_ant_design_icons__WEBPACK_IMPORTED_MODULE_1__.EditOutlined, {}),
            onClick: (e)=>onEditClick && onEditClick(phone, e)
        },
        {
            label: t("scan_qrcode"),
            key: "2",
            icon: /*#__PURE__*/ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx(_ant_design_icons__WEBPACK_IMPORTED_MODULE_1__.QrcodeOutlined, {}),
            onClick: (e)=>onGetQrCodeClick && onGetQrCodeClick(phone, e)
        },
        {
            label: t("delete"),
            key: "3",
            icon: /*#__PURE__*/ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx(_ant_design_icons__WEBPACK_IMPORTED_MODULE_1__.DeleteOutlined, {}),
            onClick: (e)=>onDeleteClick && onDeleteClick(phone, e)
        }
    ];
    const menuProps = {
        items
    };
    return /*#__PURE__*/ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx(antd__WEBPACK_IMPORTED_MODULE_2__.Dropdown, {
        menu: menuProps,
        trigger: [
            "click"
        ],
        children: /*#__PURE__*/ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx(antd__WEBPACK_IMPORTED_MODULE_2__.Button, {
            children: /*#__PURE__*/ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(antd__WEBPACK_IMPORTED_MODULE_2__.Space, {
                children: [
                    /*#__PURE__*/ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx(_ant_design_icons__WEBPACK_IMPORTED_MODULE_1__.SettingOutlined, {}),
                    "Action",
                    /*#__PURE__*/ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx(_ant_design_icons__WEBPACK_IMPORTED_MODULE_1__.DownOutlined, {})
                ]
            })
        })
    });
}


/***/ }),

/***/ 5272:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "v": () => (/* binding */ copyToClipboard)
/* harmony export */ });
// https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Interact_with_the_clipboard
/**
 * Interface CopyToClipboard params
 */ const copyToClipboard = async ({ target , message , value  })=>{
    try {
        let copyValue = "";
        if (!navigator.clipboard) {
            throw new Error("Browser don't have support for native clipboard.");
        }
        if (target) {
            const node = document.querySelector(target);
            if (!node || !node.textContent) {
                throw new Error("Element not found");
            }
            value = node.textContent;
        }
        if (value) {
            copyValue = value;
        }
        await navigator.clipboard.writeText(copyValue);
        console.log(message ?? "Copied!!!");
    } catch (error) {
        console.log(error.toString());
    }
};


/***/ }),

/***/ 7382:
/***/ ((module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.a(module, async (__webpack_handle_async_dependencies__, __webpack_async_result__) => { try {
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Z": () => (/* binding */ usePhoneData)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(6689);
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var axios__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(9648);
var __webpack_async_dependencies__ = __webpack_handle_async_dependencies__([axios__WEBPACK_IMPORTED_MODULE_1__]);
axios__WEBPACK_IMPORTED_MODULE_1__ = (__webpack_async_dependencies__.then ? (await __webpack_async_dependencies__)() : __webpack_async_dependencies__)[0];


function usePhoneData(token) {
    const [runRefetchPhone, setRunRefetchPhone] = (0,react__WEBPACK_IMPORTED_MODULE_0__.useState)(false);
    const [phones, setPhones] = (0,react__WEBPACK_IMPORTED_MODULE_0__.useState)([]);
    // const socketRef = useRef<any>();
    const refetchPhone = ()=>{
        setRunRefetchPhone(true);
    };
    (0,react__WEBPACK_IMPORTED_MODULE_0__.useEffect)(()=>{
        setRunRefetchPhone(true);
    }, []);
    (0,react__WEBPACK_IMPORTED_MODULE_0__.useEffect)(()=>{
        const fetchPhones = async ()=>{
            setRunRefetchPhone(false);
            const response = await axios__WEBPACK_IMPORTED_MODULE_1__["default"].get(`/api/phones`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            const result = response.data;
            setPhones(result);
        };
        runRefetchPhone && token && fetchPhones();
    }, [
        runRefetchPhone,
        token
    ]);
    const deleteById = async (phoneId)=>{
        const result = {
            success: false,
            error: undefined,
            data: undefined
        };
        try {
            const resp = await axios__WEBPACK_IMPORTED_MODULE_1__["default"]["delete"](`/api/phones/${phoneId}`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            result.success = true;
            result.data = resp.data;
            setRunRefetchPhone(true);
        } catch (e) {
            if (e instanceof axios__WEBPACK_IMPORTED_MODULE_1__.AxiosError) {
                result.error = e;
            } else {
                result.error = e;
            }
        }
        return result;
    };
    const save = async (data)=>{
        const result = {
            success: false,
            error: undefined,
            data: undefined
        };
        try {
            const resp = await axios__WEBPACK_IMPORTED_MODULE_1__["default"].post(`/api/phones`, data, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            result.success = true;
            result.data = resp.data;
            setRunRefetchPhone(true);
        } catch (e) {
            if (e instanceof axios__WEBPACK_IMPORTED_MODULE_1__.AxiosError) {
                result.error = e;
            } else {
                result.error = e;
            }
        }
        return result;
    };
    return {
        phones,
        setPhones,
        save,
        deleteById,
        refetchPhone
    };
}

__webpack_async_result__();
} catch(e) { __webpack_async_result__(e); } });

/***/ }),

/***/ 6019:
/***/ ((module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.a(module, async (__webpack_handle_async_dependencies__, __webpack_async_result__) => { try {
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Z": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(6689);
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var socket_io_client__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(4612);
var __webpack_async_dependencies__ = __webpack_handle_async_dependencies__([socket_io_client__WEBPACK_IMPORTED_MODULE_1__]);
socket_io_client__WEBPACK_IMPORTED_MODULE_1__ = (__webpack_async_dependencies__.then ? (await __webpack_async_dependencies__)() : __webpack_async_dependencies__)[0];


const useSocket = (option)=>{
    const [socket, setSocket] = (0,react__WEBPACK_IMPORTED_MODULE_0__.useState)(null);
    const [events, setEvents] = (0,react__WEBPACK_IMPORTED_MODULE_0__.useState)(null);
    const disconnectSocket = ()=>{
        if (events) {
            for (const event of events){
                socket?.off(event.name);
            }
            socket?.disconnect();
        }
    };
    (0,react__WEBPACK_IMPORTED_MODULE_0__.useEffect)(()=>{
        if (!events) {
            disconnectSocket();
            return;
        }
        const socketInstance = (0,socket_io_client__WEBPACK_IMPORTED_MODULE_1__.io)(option);
        for (const event of events){
            socketInstance.on(event.name, event.handler);
        }
        socketInstance.connect();
        setSocket(socketInstance);
        return function() {
            disconnectSocket();
        };
    }, [
        events
    ]);
    return {
        socket,
        setEvents,
        disconnectSocket
    };
};
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (useSocket);

__webpack_async_result__();
} catch(e) { __webpack_async_result__(e); } });

/***/ }),

/***/ 9981:
/***/ ((module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.a(module, async (__webpack_handle_async_dependencies__, __webpack_async_result__) => { try {
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__),
/* harmony export */   "getStaticProps": () => (/* binding */ getStaticProps)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(997);
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _components_Layout__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(4763);
/* harmony import */ var _components_phone_ModalQrCode__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(6484);
/* harmony import */ var _components_phone_PhoneFormModal__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(8981);
/* harmony import */ var _components_phone_PhoneTableButton__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(4292);
/* harmony import */ var _lib_copyToClipboard__WEBPACK_IMPORTED_MODULE_13__ = __webpack_require__(5272);
/* harmony import */ var _lib_usePhoneData__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(7382);
/* harmony import */ var _lib_useSocket__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(6019);
/* harmony import */ var antd__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(5725);
/* harmony import */ var antd__WEBPACK_IMPORTED_MODULE_7___default = /*#__PURE__*/__webpack_require__.n(antd__WEBPACK_IMPORTED_MODULE_7__);
/* harmony import */ var dayjs__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(1635);
/* harmony import */ var dayjs__WEBPACK_IMPORTED_MODULE_8___default = /*#__PURE__*/__webpack_require__.n(dayjs__WEBPACK_IMPORTED_MODULE_8__);
/* harmony import */ var next_auth_react__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(1649);
/* harmony import */ var next_auth_react__WEBPACK_IMPORTED_MODULE_9___default = /*#__PURE__*/__webpack_require__.n(next_auth_react__WEBPACK_IMPORTED_MODULE_9__);
/* harmony import */ var next_i18next__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(1377);
/* harmony import */ var next_i18next__WEBPACK_IMPORTED_MODULE_10___default = /*#__PURE__*/__webpack_require__.n(next_i18next__WEBPACK_IMPORTED_MODULE_10__);
/* harmony import */ var next_i18next_serverSideTranslations__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(5460);
/* harmony import */ var next_i18next_serverSideTranslations__WEBPACK_IMPORTED_MODULE_11___default = /*#__PURE__*/__webpack_require__.n(next_i18next_serverSideTranslations__WEBPACK_IMPORTED_MODULE_11__);
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(6689);
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_12___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_12__);
var __webpack_async_dependencies__ = __webpack_handle_async_dependencies__([_components_phone_ModalQrCode__WEBPACK_IMPORTED_MODULE_2__, _lib_usePhoneData__WEBPACK_IMPORTED_MODULE_5__, _lib_useSocket__WEBPACK_IMPORTED_MODULE_6__]);
([_components_phone_ModalQrCode__WEBPACK_IMPORTED_MODULE_2__, _lib_usePhoneData__WEBPACK_IMPORTED_MODULE_5__, _lib_useSocket__WEBPACK_IMPORTED_MODULE_6__] = __webpack_async_dependencies__.then ? (await __webpack_async_dependencies__)() : __webpack_async_dependencies__);














const PhonePage = ()=>{
    const [state, setState] = (0,react__WEBPACK_IMPORTED_MODULE_12__.useState)({
        openForm: false,
        formLoading: false,
        openQrModal: false,
        selectedPhone: undefined,
        editPhone: undefined
    });
    const { data: session  } = (0,next_auth_react__WEBPACK_IMPORTED_MODULE_9__.useSession)();
    const phoneData = (0,_lib_usePhoneData__WEBPACK_IMPORTED_MODULE_5__/* ["default"] */ .Z)(session?.user?.token);
    const [phoneOnline, setPhoneOnline] = (0,react__WEBPACK_IMPORTED_MODULE_12__.useState)([]);
    const [socketOption, setSocketOption] = (0,react__WEBPACK_IMPORTED_MODULE_12__.useState)(undefined);
    const { socket , setEvents  } = (0,_lib_useSocket__WEBPACK_IMPORTED_MODULE_6__/* ["default"] */ .Z)(socketOption);
    const { t , i18n  } = (0,next_i18next__WEBPACK_IMPORTED_MODULE_10__.useTranslation)("common");
    const [modal, contextHolder] = antd__WEBPACK_IMPORTED_MODULE_7__.Modal.useModal();
    const [notif, notificationContext] = antd__WEBPACK_IMPORTED_MODULE_7__.notification.useNotification();
    const form = (0,react__WEBPACK_IMPORTED_MODULE_12__.useRef)(null);
    (0,react__WEBPACK_IMPORTED_MODULE_12__.useEffect)(()=>{
        if ((phoneData.phones?.length || 0) <= 0) {
            setSocketOption(undefined);
            return;
        }
        setSocketOption({
            query: {
                userId: session?.user?.id,
                phoneId: phoneData.phones?.map((x)=>x.id)
            },
            autoConnect: false
        });
        return ()=>{
            setSocketOption(undefined);
        };
    }, [
        phoneData.phones
    ]);
    (0,react__WEBPACK_IMPORTED_MODULE_12__.useEffect)(()=>{
        if (!socketOption || state.openForm) {
            socket?.disconnect();
            return;
        }
        const events = [];
        events.push({
            name: `isOnline`,
            handler: (connection)=>{
                console.log("isOnline", connection);
                setPhoneOnline([
                    ...phoneOnline,
                    connection.phoneId
                ]);
            }
        });
        events.push({
            name: `waUser`,
            handler: (waUser)=>{
                let _phones = phoneData.phones;
                let editPhones = _phones?.find((x)=>x.id === waUser.phoneId);
                if (editPhones) {
                    editPhones.account_name = waUser.waUser.name;
                    editPhones.number = waUser.waUser.id.split(":")[0];
                    phoneData.setPhones(_phones);
                    console.log("waUser updated", waUser);
                }
            }
        });
        events.push({
            name: "connect",
            handler: ()=>{
                console.log("connect");
            }
        });
        setEvents(events);
        socket?.connect();
        return ()=>{
            setEvents([]);
            socket?.disconnect();
        };
    }, [
        socketOption,
        state.openForm
    ]);
    const dataColumn = [
        {
            title: t("name"),
            key: "name",
            dataIndex: "name"
        },
        {
            title: t("number"),
            key: "number",
            dataIndex: "number"
        },
        {
            title: t("account_name"),
            key: "account_name",
            dataIndex: "account_name",
            render: (v)=>/*#__PURE__*/ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx("div", {
                    style: {
                        whiteSpace: "nowrap"
                    },
                    children: v
                })
        },
        {
            title: t("api_token"),
            key: "token",
            dataIndex: "token",
            render: (v)=>/*#__PURE__*/ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(antd__WEBPACK_IMPORTED_MODULE_7__.Space, {
                    direction: "horizontal",
                    style: {
                        whiteSpace: "nowrap"
                    },
                    children: [
                        /*#__PURE__*/ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx(antd__WEBPACK_IMPORTED_MODULE_7__.Button, {
                            onClick: async ()=>{
                                await (0,_lib_copyToClipboard__WEBPACK_IMPORTED_MODULE_13__/* .copyToClipboard */ .v)({
                                    value: v
                                });
                                notif.destroy();
                                notif.success({
                                    closeIcon: false,
                                    duration: 3,
                                    message: t("text_copied", {
                                        text: '"Token"'
                                    }).toString() || "Copied",
                                    placement: "bottom"
                                });
                            },
                            children: "Copy"
                        }),
                        /*#__PURE__*/ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx("div", {
                            children: v
                        })
                    ]
                })
        },
        {
            title: "Online",
            key: "id",
            dataIndex: "id",
            render: (v)=>phoneOnline.includes(v) ? "Online" : "Offline"
        },
        {
            title: t("created_at"),
            key: "createdAt",
            dataIndex: "createdAt",
            render: (v)=>/*#__PURE__*/ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx("div", {
                    style: {
                        whiteSpace: "nowrap"
                    },
                    children: dayjs__WEBPACK_IMPORTED_MODULE_8___default()(v).format("DD/MM/YYYY HH:mm")
                })
        },
        {
            title: t("action"),
            key: "action",
            dataIndex: "id",
            fixed: "right",
            render: (v, phone)=>{
                return /*#__PURE__*/ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx(_components_phone_PhoneTableButton__WEBPACK_IMPORTED_MODULE_4__/* ["default"] */ .Z, {
                    phone: phone,
                    onEditClick: onEditClick,
                    onDeleteClick: onDeleteClick,
                    onGetQrCodeClick: onGetQrCodeClick
                });
            }
        }
    ];
    const onSubmit = async (data)=>{
        setState({
            ...state,
            formLoading: true
        });
        const res = await phoneData.save(data);
        if (res.success) {
            form.current?.resetForm();
        }
        setState({
            ...state,
            formLoading: false,
            openForm: false,
            editPhone: undefined
        });
    };
    const onCancel = ()=>setState({
            ...state,
            openForm: false,
            editPhone: undefined
        });
    const onEditClick = (_phone)=>{
        _phone && setState({
            ...state,
            editPhone: _phone,
            openForm: true
        });
    };
    const onDeleteClick = (_phone)=>{
        _phone && modal.confirm({
            title: t("confirm_delete"),
            content: t("confirm_delete_ask"),
            onOk: async ()=>{
                const result = await phoneData.deleteById(_phone.id);
                notif[result.success ? "success" : "error"]({
                    message: result.success ? t("success") : t("failed"),
                    description: result.success ? t("success_delete") : t("failed_delete")
                });
            }
        });
    };
    const onGetQrCodeClick = (_phone)=>{
        _phone && setState({
            ...state,
            selectedPhone: _phone,
            openQrModal: true
        });
    };
    return /*#__PURE__*/ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.Fragment, {
        children: [
            /*#__PURE__*/ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx(antd__WEBPACK_IMPORTED_MODULE_7__.Button, {
                onClick: ()=>setState({
                        ...state,
                        openForm: true
                    }),
                children: t("add_devices")
            }),
            /*#__PURE__*/ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx(_components_phone_PhoneFormModal__WEBPACK_IMPORTED_MODULE_3__/* ["default"] */ .Z, {
                ref: form,
                loading: state.formLoading,
                open: state.openForm,
                onCancel: onCancel,
                onSubmit: onSubmit,
                editPhone: state.editPhone
            }),
            /*#__PURE__*/ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx(antd__WEBPACK_IMPORTED_MODULE_7__.Table, {
                scroll: {
                    x: true
                },
                onRow: (record)=>{
                    return {
                        onContextMenu: (event)=>{
                            event.preventDefault();
                            console.log(record);
                        }
                    };
                },
                dataSource: phoneData.phones,
                columns: dataColumn
            }),
            /*#__PURE__*/ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx(_components_phone_ModalQrCode__WEBPACK_IMPORTED_MODULE_2__/* ["default"] */ .Z, {
                userId: session?.user?.id,
                open: state.openQrModal,
                phone: state.selectedPhone || undefined,
                onClose: ()=>setState({
                        ...state,
                        openQrModal: false
                    })
            }),
            contextHolder,
            notificationContext
        ]
    });
};
const getStaticProps = async ({ locale  })=>({
        props: {
            ...await (0,next_i18next_serverSideTranslations__WEBPACK_IMPORTED_MODULE_11__.serverSideTranslations)(locale, [
                "common"
            ])
        }
    });
PhonePage.getLayout = function getLayout(page) {
    const title = ()=>next_i18next__WEBPACK_IMPORTED_MODULE_10__.i18n?.t("phone_devices") || "";
    return /*#__PURE__*/ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx(_components_Layout__WEBPACK_IMPORTED_MODULE_1__/* ["default"] */ .Z, {
        title: title().toUpperCase(),
        children: page
    });
};
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (PhonePage);

__webpack_async_result__();
} catch(e) { __webpack_async_result__(e); } });

/***/ }),

/***/ 7066:
/***/ ((module) => {

module.exports = require("@ant-design/icons");

/***/ }),

/***/ 5725:
/***/ ((module) => {

module.exports = require("antd");

/***/ }),

/***/ 1635:
/***/ ((module) => {

module.exports = require("dayjs");

/***/ }),

/***/ 1649:
/***/ ((module) => {

module.exports = require("next-auth/react");

/***/ }),

/***/ 1377:
/***/ ((module) => {

module.exports = require("next-i18next");

/***/ }),

/***/ 5460:
/***/ ((module) => {

module.exports = require("next-i18next/serverSideTranslations");

/***/ }),

/***/ 3918:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/amp-context.js");

/***/ }),

/***/ 5732:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/amp-mode.js");

/***/ }),

/***/ 3280:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/app-router-context.js");

/***/ }),

/***/ 2796:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/head-manager-context.js");

/***/ }),

/***/ 3539:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/i18n/detect-domain-locale.js");

/***/ }),

/***/ 4014:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/i18n/normalize-locale-path.js");

/***/ }),

/***/ 4486:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/image-blur-svg.js");

/***/ }),

/***/ 744:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/image-config-context.js");

/***/ }),

/***/ 5843:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/image-config.js");

/***/ }),

/***/ 9552:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/image-loader");

/***/ }),

/***/ 4964:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/router-context.js");

/***/ }),

/***/ 3431:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/router/utils/add-locale.js");

/***/ }),

/***/ 1751:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/router/utils/add-path-prefix.js");

/***/ }),

/***/ 3938:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/router/utils/format-url.js");

/***/ }),

/***/ 1109:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/router/utils/is-local-url.js");

/***/ }),

/***/ 8854:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/router/utils/parse-path.js");

/***/ }),

/***/ 3297:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/router/utils/remove-trailing-slash.js");

/***/ }),

/***/ 7782:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/router/utils/resolve-href.js");

/***/ }),

/***/ 2470:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/side-effect.js");

/***/ }),

/***/ 9232:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/utils.js");

/***/ }),

/***/ 618:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/utils/warn-once.js");

/***/ }),

/***/ 1853:
/***/ ((module) => {

module.exports = require("next/router");

/***/ }),

/***/ 3860:
/***/ ((module) => {

module.exports = require("qrcode.react");

/***/ }),

/***/ 6689:
/***/ ((module) => {

module.exports = require("react");

/***/ }),

/***/ 997:
/***/ ((module) => {

module.exports = require("react/jsx-runtime");

/***/ }),

/***/ 9648:
/***/ ((module) => {

module.exports = import("axios");;

/***/ }),

/***/ 4612:
/***/ ((module) => {

module.exports = import("socket.io-client");;

/***/ })

};
;

// load runtime
var __webpack_require__ = require("../../webpack-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = __webpack_require__.X(0, [636,675,664,763], () => (__webpack_exec__(9981)));
module.exports = __webpack_exports__;

})();