import useSocket from "@/lib/useSocket";
import { Phone } from "@prisma/client";
import { Button, Image, Modal, Space, Spin, Typography } from "antd";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { useTranslation } from "next-i18next";
import { Socket, io } from "socket.io-client";

interface ModalQrCodeProps {
  phone?: Phone;
  userId?: string;
  open: boolean;
  onClose?: () => void;
}
export default function ModalQrCode({
  open,
  phone,
  userId,
  ...props
}: ModalQrCodeProps) {
  const [waQrCode, setWaQrCode] = useState(undefined);
  const [waQrCodeTimeout, setWaQrCodeTimeout] = useState(0);
  const [isOnline, setIsOnline] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { socket, setEvents } = useSocket({
    query: {
      phoneId: phone?.id,
      userId: userId,
    },
  });
  const { t } = useTranslation();

  useEffect(() => {
    if (!open || !phone) {
      setEvents(null);
      socket?.disconnect();
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
          if (qr.phoneId == phone?.id) {
            console.log(qr);
            setWaQrCode(qr.qr);
            setWaQrCodeTimeout(qr.timeout > 0 ? qr.timeout / 1000 : 0);
          }
        },
      },
    ]);
  }, [open, phone]);

  useEffect(() => {
    const timer = setInterval(() => {
      setWaQrCodeTimeout(waQrCodeTimeout - 1);
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [waQrCodeTimeout]);

  return (
    <>
      <Modal
        title={t("whatsaap_qrcode")}
        closable={false}
        open={open}
        onCancel={() => {
          setWaQrCode(undefined);
          props?.onClose && props?.onClose();
        }}
        // cancelButtonProps={{ loading: isLoading }}
        // okButtonProps={{ loading: isLoading }}
      >
        <Space
          direction="vertical"
          style={{ display: "flex", width: "100%", alignItems: "center" }}
        >
          {waQrCode ? (
            <>
              <QRCodeSVG
                style={{ margin: "0 auto" }}
                width={"300px"}
                height={"300px"}
                value={waQrCode}
              />
              <Typography.Text>
                {t("timeout")}: {waQrCodeTimeout}
              </Typography.Text>
              <Typography.Text>{t("please_scan_qrcode")}</Typography.Text>
            </>
          ) : (
            <>
              <Typography.Text>{t("getting_qrcode")}</Typography.Text>
              <Spin size="large"></Spin>
            </>
          )}
        </Space>
      </Modal>
    </>
  );
}
