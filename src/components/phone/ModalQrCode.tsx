import { useUiTranslation } from "@/lib/uiTranslation";
import { useEffect, useRef, useState } from "react";

import { Alert, Button, Modal, Space, Typography } from "antd";
import axios from "axios";
import { useLocalizedTranslation as useTranslation } from "@/lib/uiTranslation";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";

import useSocket from "@/lib/useSocket";
import { Phone } from "@prisma/client";
import { PairingProgress } from "./PairingProgress";

interface ModalQrCodeProps {
  phone?: Phone;
  userId?: string;
  open: boolean;
  token?: string;
  onClose?: () => void;
  onActivated?: () => void;
  onConnected?: () => void;
}
export default function ModalQrCode({
  open,
  phone,
  userId,
  token,
  ...props
}: ModalQrCodeProps) {
  const uiText = useUiTranslation();
  const [waQrCode, setWaQrCode] = useState<string | undefined>(undefined);
  const [waQrCodeTimeout, setWaQrCodeTimeout] = useState(0);
  const [qrError, setQrError] = useState<string | undefined>();
  const [attempt, setAttempt] = useState(0);
  const [isInactive, setIsInactive] = useState(false);
  const [activating, setActivating] = useState(false);
  const activationRequest = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<"waiting" | "pairing" | "connected">("waiting");
  const phaseRef = useRef<"waiting" | "pairing" | "connected">("waiting");
  const [takingLong, setTakingLong] = useState(false);
  const markPhase = (next: "waiting" | "pairing" | "connected") => {
    const previous = phaseRef.current;
    phaseRef.current = next;
    setPhase(next);
    if (next !== "waiting") {
      setWaQrCode(undefined);
      setWaQrCodeTimeout(0);
      setQrError(undefined);
      setIsInactive(false);
    }
    if (next === "connected" && previous !== "connected") props.onConnected?.();
  };
  const { socket, setEvents } = useSocket({
    autoConnect: false,
    auth: token ? { token } : undefined,
    query: {
      phoneId: phone?.id,
      userId: userId,
    },
    transports: ["websocket"],
  });
  const { t } = useTranslation("common");

  useEffect(() => {
    setTakingLong(false);
    if (!open || phase !== "pairing") return;
    const timer = setTimeout(() => setTakingLong(true), 45_000);
    return () => clearTimeout(timer);
  }, [open, phase]);

  useEffect(() => {
    setActivating(false);
    return () => activationRequest.current?.abort();
  }, [open, phone?.id]);

  const activateDevice = async () => {
    if (!phone?.id || activating) return;
    const controller = new AbortController();
    activationRequest.current = controller;
    setActivating(true);
    try {
      const response = await axios.patch(`/api/phones/${phone.id}/toggle-active`, { active: 1 }, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        timeout: 15_000,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (response.data?.count !== 1) throw new Error(uiText("Perangkat tidak ditemukan atau tidak dapat diaktifkan."));
      setIsInactive(false);
      setQrError(undefined);
      props.onActivated?.();
      setAttempt(value => value + 1);
    } catch (error) {
      if (!controller.signal.aborted) setQrError(axios.isAxiosError(error)
        ? error.response?.data?.message || uiText("Gagal mengaktifkan perangkat. Silakan coba lagi.")
        : error instanceof Error ? error.message : uiText("Gagal mengaktifkan perangkat."));
    } finally {
      if (!controller.signal.aborted) setActivating(false);
    }
  };

  useEffect(() => {
    if (!phone?.id || !open) return;
    const controller = new AbortController();
    setWaQrCode(undefined);
    setWaQrCodeTimeout(0);
    setQrError(undefined);
    setIsInactive(false);
    markPhase("waiting");
    const getQrCode = async () => {
    try {
      const res = await axios.get(`/api/phones/${phone?.id}/qrcode`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        signal: controller.signal,
        timeout: 25_000,
      });
      if (controller.signal.aborted) return;
      if (res.data?.connected) {
        markPhase("connected");
        return;
      }
      if (res.data?.pairing) {
        if (phaseRef.current !== "connected") markPhase("pairing");
        return;
      }
      if (phaseRef.current !== "waiting") return;
      if (res.status == 200 && res.data?.qr) {
        setWaQrCode(res.data?.qr);
        const _timeout =
          res.data?.timeout > 0 ? res.data?.timeout / 1000 - 5 : 0;
        setWaQrCodeTimeout(_timeout);
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      if (phaseRef.current !== "waiting") return;
      setIsInactive(axios.isAxiosError(e) && e.response?.status === 409 && e.response?.data?.code === "DEVICE_INACTIVE");
      setQrError(axios.isAxiosError(e) ? e.response?.data?.message || "QR belum tersedia. Silakan coba lagi." : "Gagal mendapatkan QR. Silakan coba lagi.");
    }
    };
    getQrCode();
    return () => controller.abort();
  }, [phone?.id, token, open, attempt]);

  useEffect(() => {
    if (!open || !phone) {
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
        name: "connectionState",
        handler(connectionState) {
          if (connectionState.phoneId !== phone.id) return;
          if (connectionState.connection === "open") markPhase("connected");
          if (connectionState.connection === "pairing" || connectionState.status === 515) markPhase("pairing");
          if (connectionState.connection === "close" && connectionState.status !== 515) {
            markPhase("waiting");
            setWaQrCode(undefined);
            setQrError(connectionState.status === 401
              ? "WhatsApp mengakhiri sesi login. Perlu scan QR ulang. Tutup panel ini, lalu buka Scan QR untuk menautkan kembali."
              : connectionState.status === 403
                ? "WhatsApp menolak koneksi. Periksa pemberitahuan di HP dan hubungi admin; scan QR belum tentu menyelesaikan masalah ini."
                : connectionState.status === 440
                  ? "Koneksi sesi ini digantikan koneksi lain. Hubungi admin untuk menutup koneksi ganda. Belum perlu scan QR."
                  : [411, 500].includes(connectionState.status)
                    ? "WhatsApp melaporkan masalah sesi. Hubungi admin sebelum melakukan scan QR ulang."
                    : "Koneksi terputus. Tutup panel ini dan lihat Status koneksi pada daftar perangkat untuk memastikan apakah sedang dipulihkan otomatis atau perlu scan QR.");
          }
        },
      },
      {
        name: "qr",
        handler(qr) {
          if (qr.phoneId == phone?.id) {
            markPhase("waiting");
            setWaQrCode(qr.qr);
            setQrError(undefined);
            setIsInactive(false);
            setWaQrCodeTimeout(qr.timeout > 0 ? qr.timeout / 1000 - 5 : 0);
          }
        },
      },
    ]);
    return () => {
      socket?.disconnect();
      setEvents(null);
    };
  }, [open, phone]);

  useEffect(() => {
    const timer = setInterval(() => {
      waQrCodeTimeout >= 0 && setWaQrCodeTimeout(waQrCodeTimeout - 1);
    }, 1000);
    if (waQrCodeTimeout <= 0) {
      clearInterval(timer);
      if (waQrCode) setQrError("QR sudah kedaluwarsa. Silakan coba lagi.");
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
        footer={<Button type={phase === "connected" ? "primary" : "default"} onClick={props.onClose}>{phase === "connected" ? uiText("Selesai") : uiText("Tutup")}</Button>}
      >
        <Space
          direction="vertical"
          style={{ display: "flex", width: "100%", alignItems: "center" }}
        >
          {phase !== "waiting" ? (
            <PairingProgress connected={phase === "connected"} takingLong={takingLong} />
          ) : isInactive ? (
            <Alert
              type="warning"
              showIcon
              message={uiText("Perangkat nonaktif")}
              description={uiText(qrError)}
              action={<Button type="primary" loading={activating} onClick={activateDevice}>{uiText("Aktifkan & Tampilkan QR")}</Button>}
            />
          ) : waQrCode && waQrCodeTimeout > 0 ? (
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
          ) : qrError ? (
            <>
              <Alert type="error" showIcon message={uiText(qrError)} />
              <Button onClick={() => setAttempt(value => value + 1)}>{uiText("Coba lagi")}</Button>
            </>
          ) : (
            <>
              <Typography.Text>{t("getting_qrcode")}</Typography.Text>
              <Image
                src={"/waiting.gif"}
                height={300}
                alt={uiText("Aku menunggu")}
                width={300}
              />
            </>
          )}
        </Space>
      </Modal>
    </>
  );
}
