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
  const [waQrCode, setWaQrCode] = useState<string | undefined>(undefined);
  const [waQrCodeTimeout, setWaQrCodeTimeout] = useState(0);
  const [isOnline, setIsOnline] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { socket, setEvents } = useSocket({
    query: {
      phoneId: phone?.id,
      userId: userId,
    },
    transports: ["websocket"],
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
          console.info("connect qr modal IO");
        },
      },
      {
        name: "disconnect",
        handler() {
          console.info("disconnect qr modal IO");
        },
      },
      {
        name: "isOnline",
        handler: (update) => {
          if (phone.id == update.phoneId) {
            if ("isOnline" in update) {
              props.onClose && update.isOnline && props.onClose();
            }
          }
        },
      },
      {
        name: "connectionState",
        handler(connectionState) {
          if ("connection" in connectionState) {
            setIsLoading(connectionState.connection === "connecting");
          }
        },
      },
      {
        name: "qr",
        handler(qr) {
          if (qr.phoneId == phone?.id) {
            setWaQrCode(qr.qr);
            setWaQrCodeTimeout(qr.timeout > 0 ? qr.timeout / 1000 - 5 : 0);
          }
        },
      },
    ]);
  }, [open, phone]);

  useEffect(() => {
    const timer = setInterval(() => {
      waQrCodeTimeout >= 0 && setWaQrCodeTimeout(waQrCodeTimeout - 1);
    }, 1000);
    if (waQrCodeTimeout <= 0) {
      clearInterval(timer);
    }
    return () => {
      clearInterval(timer);
    };
  }, [waQrCodeTimeout]);

  // useEffect(() => {
  //   setWaQrCode(phone?.qrCode || "");
  //   setWaQrCodeTimeout(30);
  // }, [phone?.qrCode]);

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
          {waQrCode && waQrCodeTimeout > 0 ? (
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
