"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const useSocket_1 = __importDefault(require("@/lib/useSocket"));
const antd_1 = require("antd");
const qrcode_react_1 = require("qrcode.react");
const react_1 = require("react");
const next_i18next_1 = require("next-i18next");
function ModalQrCode({ open, phone, userId, ...props }) {
    const [waQrCode, setWaQrCode] = (0, react_1.useState)(undefined);
    const [waQrCodeTimeout, setWaQrCodeTimeout] = (0, react_1.useState)(0);
    const [isOnline, setIsOnline] = (0, react_1.useState)(false);
    const [isLoading, setIsLoading] = (0, react_1.useState)(false);
    const { socket, setEvents } = (0, useSocket_1.default)({
        query: {
            phoneId: phone === null || phone === void 0 ? void 0 : phone.id,
            userId: userId,
        },
    });
    const { t } = (0, next_i18next_1.useTranslation)();
    (0, react_1.useEffect)(() => {
        if (!open || !phone) {
            setEvents(null);
            socket === null || socket === void 0 ? void 0 : socket.disconnect();
            return;
        }
        setEvents([
            {
                name: "connect",
                handler() {
                    console.log("connect", "connected");
                },
            },
            {
                name: "disconnect",
                handler() {
                    console.log("connect", "disconnect");
                },
            },
            {
                name: "credsUpdate",
                handler(credsUpdate) {
                    if ("accountSyncCounter" in credsUpdate) {
                    }
                },
            },
            {
                name: "authState",
                handler(authState) {
                    console.log("authState", authState);
                },
            },
            {
                name: "connectionState",
                handler(connectionState) {
                    console.log(connectionState);
                    if ("isOnline" in connectionState) {
                        props.onClose && props.onClose();
                    }
                    if ("connection" in connectionState) {
                        setIsLoading(connectionState.connection === "connecting");
                    }
                },
            },
            {
                name: "qr",
                handler(qr) {
                    if (qr.phoneId == (phone === null || phone === void 0 ? void 0 : phone.id)) {
                        console.log(qr);
                        setWaQrCode(qr.qr);
                        setWaQrCodeTimeout(qr.timeout > 0 ? qr.timeout / 1000 : 0);
                    }
                },
            },
        ]);
    }, [open, phone]);
    (0, react_1.useEffect)(() => {
        const timer = setInterval(() => {
            setWaQrCodeTimeout(waQrCodeTimeout - 1);
        }, 1000);
        return () => {
            clearInterval(timer);
        };
    }, [waQrCodeTimeout]);
    return (<>
      <antd_1.Modal title={t("whatsaap_qrcode")} closable={false} open={open} onCancel={() => {
            setWaQrCode(undefined);
            (props === null || props === void 0 ? void 0 : props.onClose) && (props === null || props === void 0 ? void 0 : props.onClose());
        }}>
        <antd_1.Space direction="vertical" style={{ display: "flex", width: "100%", alignItems: "center" }}>
          {waQrCode ? (<>
              <qrcode_react_1.QRCodeSVG style={{ margin: "0 auto" }} width={"300px"} height={"300px"} value={waQrCode}/>
              <antd_1.Typography.Text>
                {t("timeout")}: {waQrCodeTimeout}
              </antd_1.Typography.Text>
              <antd_1.Typography.Text>{t("please_scan_qrcode")}</antd_1.Typography.Text>
            </>) : (<>
              <antd_1.Typography.Text>{t("getting_qrcode")}</antd_1.Typography.Text>
              <antd_1.Spin size="large"></antd_1.Spin>
            </>)}
        </antd_1.Space>
      </antd_1.Modal>
    </>);
}
exports.default = ModalQrCode;
