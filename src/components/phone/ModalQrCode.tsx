import { useEffect, useState } from "react";

import { Modal, Space, Typography } from "antd";
import axios from "axios";
import { useTranslation } from "next-i18next";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";

import useSocket from "@/lib/useSocket";
import { Phone } from "@prisma/client";

interface ModalQrCodeProps {
  phone?: Phone;
  userId?: string;
  open: boolean;
  token?: string;
  onClose?: () => void;
}
export default function ModalQrCode({
  open,
  phone,
  userId,
  token,
  ...props
}: ModalQrCodeProps) {
  const [waQrCode, setWaQrCode] = useState<string | undefined>(undefined);
  const [waQrCodeTimeout, setWaQrCodeTimeout] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [allowRunSocket, setAllowRunSocket] = useState(false);
  const { socket, setEvents } = useSocket({
    autoConnect: false,
    query: {
      phoneId: phone?.id,
      userId: userId,
    },
    transports: ["websocket"],
  });
  const { t } = useTranslation("common");

  const getQrCode = async () => {
    try {
      const res = await axios.get(`/api/phones/${phone?.id}/qrcode`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.status == 200 && res.data?.qr) {
        setWaQrCode(res.data?.qr);
        const _timeout =
          res.data?.timeout > 0 ? res.data?.timeout / 1000 - 5 : 0;
        setWaQrCodeTimeout(_timeout);
        setTimeout(() => {
          setAllowRunSocket(true);
        }, res.data?.timeout || 10);
      }
    } catch (e) {
      setAllowRunSocket(true);
    }
  };

  useEffect(() => {
    token && phone?.id && open && getQrCode();
  }, [phone?.id, token, open]);

  useEffect(() => {
    if (!open || !phone || !allowRunSocket) {
      socket?.disconnect();
      setEvents(null);
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
            // setIsLoading(connectionState.connection === "connecting");
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
    return () => {
      socket?.disconnect();
      setEvents(null);
    };
  }, [open, phone, allowRunSocket]);

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

  return (
    <>
      <Modal
        title={t("whatsapp_qrcode")}
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
              <Image
                src={"/waiting.gif"}
                height={300}
                alt="Aku menunggu"
                width={300}
              />
            </>
          )}
        </Space>
      </Modal>
    </>
  );
}
