import React, { ReactElement, useEffect, useState } from "react";
import {
  Card,
  Row,
  Col,
  Input,
  InputNumber,
  Button,
  Space,
  Typography,
  notification,
  Divider,
  Tag,
  Tooltip,
  Alert,
  Spin,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  SendOutlined,
  CopyOutlined,
  KeyOutlined,
  ApiOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SaveOutlined,
  FieldTimeOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { GetServerSideProps } from "next";
import { getToken } from "next-auth/jwt";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useTranslation, i18n } from "next-i18next";
import axios from "axios";

import Layout from "@/components/Layout";
import { copyToClipboard } from "@/utils/copyToClipboard";

const { Title, Text, Paragraph } = Typography;

interface TestResult {
  [key: number]: {
    loading: boolean;
    success?: boolean;
    statusCode?: number;
    durationMs?: number;
    message?: string;
  };
}

const SettingPage = () => {
  const { t } = useTranslation("common");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [webhookUrls, setWebhookUrls] = useState<string[]>([""]);
  const [apiToken, setApiToken] = useState<string>("");
  const [rateLimitMs, setRateLimitMs] = useState<number>(2000);
  const [testResults, setTestResults] = useState<TestResult>({});

  // Fetch current webhook settings
  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await axios.get("/api/settings/webhook");
      if (res.data?.result) {
        const urls = res.data.data.webhookUrls || [];
        setWebhookUrls(urls.length > 0 ? urls : [""]);
        setApiToken(res.data.data.apiToken || "");
        if (res.data.data.rateLimitMs) {
          setRateLimitMs(Number(res.data.data.rateLimitMs));
        }
      }
    } catch (err: any) {
      notification.error({
        message: "Gagal memuat pengaturan",
        description: err.response?.data?.message || err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleUrlChange = (index: number, value: string) => {
    const newUrls = [...webhookUrls];
    newUrls[index] = value;
    setWebhookUrls(newUrls);
  };

  const handleAddUrl = () => {
    setWebhookUrls([...webhookUrls, ""]);
  };

  const handleRemoveUrl = (index: number) => {
    if (webhookUrls.length === 1) {
      setWebhookUrls([""]);
      return;
    }
    const newUrls = webhookUrls.filter((_, i) => i !== index);
    setWebhookUrls(newUrls);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const cleanUrls = webhookUrls.map((u) => u.trim()).filter((u) => u.length > 0);

      // Validate URLs
      const invalidUrl = cleanUrls.find(
        (u) => !u.startsWith("http://") && !u.startsWith("https://")
      );
      if (invalidUrl) {
        notification.error({
          message: "Format URL tidak valid",
          description: `URL "${invalidUrl}" harus diawali dengan http:// atau https://`,
        });
        setSaving(false);
        return;
      }

      const res = await axios.post("/api/settings/webhook", {
        webhookUrls: cleanUrls,
        apiToken: apiToken.trim(),
        rateLimitMs: rateLimitMs || 2000,
      });

      if (res.data?.result) {
        notification.success({
          message: "Berhasil Disimpan",
          description: "Pengaturan Webhook, Rate Limit & API Token berhasil diperbarui dan disimpan ke .env",
        });
        setWebhookUrls(cleanUrls.length > 0 ? cleanUrls : [""]);
      }
    } catch (err: any) {
      notification.error({
        message: "Gagal Menyimpan",
        description: err.response?.data?.message || err.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestWebhook = async (index: number) => {
    const url = webhookUrls[index]?.trim();
    if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
      notification.warning({
        message: "URL Tidak Valid",
        description: "Masukkan URL webhook yang valid (http:// atau https://) sebelum melakukan test",
      });
      return;
    }

    setTestResults((prev) => ({
      ...prev,
      [index]: { loading: true },
    }));

    try {
      const res = await axios.post("/api/settings/webhook", {
        action: "test",
        url,
      });

      const data = res.data;
      setTestResults((prev) => ({
        ...prev,
        [index]: {
          loading: false,
          success: data.result,
          statusCode: data.statusCode,
          durationMs: data.durationMs,
          message: data.message,
        },
      }));

      if (data.result) {
        notification.success({
          message: `Test Sukses (${data.statusCode})`,
          description: `Webhook berhasil merespon dalam ${data.durationMs}ms`,
        });
      } else {
        notification.error({
          message: `Test Gagal (HTTP ${data.statusCode || 500})`,
          description: data.message,
        });
      }
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [index]: {
          loading: false,
          success: false,
          message: err.message,
        },
      }));
      notification.error({
        message: "Test Gagal",
        description: err.message,
      });
    }
  };

  const copyToken = () => {
    if (apiToken) {
      copyToClipboard({ value: apiToken });
      notification.success({
        message: "Disalin!",
        description: "API Token telah disalin ke papan klip",
      });
    }
  };

  const samplePayload = JSON.stringify(
    {
      event: "phone.status",
      timestamp: "2026-08-19T05:25:00.000Z",
      data: {
        phoneId: "278c2e64-f655-46b0-9856-bb6b0bf16834",
        isOnline: true,
        status: "OPEN",
        connection: "open",
        lastDisconnect: null,
        qr: null,
        phone: {
          id: "278c2e64-f655-46b0-9856-bb6b0bf16834",
          name: "Admin CS 1",
          number: "628123456789",
          account_name: "Doran Official",
          status: "OPEN",
          isOnline: true,
          active: 1,
        },
      },
    },
    null,
    2
  );

  return (
    <Spin spinning={loading}>
      <div style={{ maxWidth: 1000, margin: "0 auto", paddingBottom: 40 }}>
        <Row gutter={[16, 16]}>
          {/* Card 1: Webhook URLs */}
          <Col span={24}>
            <Card
              title={
                <Space>
                  <ApiOutlined style={{ color: "#1890ff" }} />
                  <span style={{ fontWeight: "bold" }}>Pengaturan Webhook URL (Bisa Banyak)</span>
                </Space>
              }
              extra={
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={saving}
                  onClick={handleSave}
                >
                  Simpan Perubahan
                </Button>
              }
            >
              <Paragraph type="secondary">
                Daftarkan satu atau lebih URL Webhook. Setiap terjadi perubahan status koneksi
                WhatsApp phone (status <b>OPEN</b>, <b>CLOSE</b>, <b>CONNECTING</b>, atau QR code), server akan
                mengirimkan payload event secara realtime via <b>HTTP POST</b> ke seluruh URL di bawah ini.
              </Paragraph>

              <div style={{ marginTop: 16 }}>
                {webhookUrls.map((url, index) => {
                  const test = testResults[index];
                  return (
                    <div
                      key={index}
                      style={{
                        marginBottom: 16,
                        padding: 12,
                        background: "#fafafa",
                        borderRadius: 6,
                        border: "1px solid #f0f0f0",
                      }}
                    >
                      <Space.Compact style={{ width: "100%" }}>
                        <Input
                          placeholder="https://domain-anda.com/webhook-endpoint"
                          value={url}
                          onChange={(e) => handleUrlChange(index, e.target.value)}
                          addonBefore={`#${index + 1}`}
                          allowClear
                        />
                        <Button
                          icon={<SendOutlined />}
                          loading={test?.loading}
                          onClick={() => handleTestWebhook(index)}
                        >
                          Test
                        </Button>
                        <Button
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => handleRemoveUrl(index)}
                        />
                      </Space.Compact>

                      {test && !test.loading && (
                        <div style={{ marginTop: 8 }}>
                          {test.success ? (
                            <Tag color="success" icon={<CheckCircleOutlined />}>
                              HTTP {test.statusCode} ({test.durationMs}ms) - Terhubung
                            </Tag>
                          ) : (
                            <Tag color="error" icon={<CloseCircleOutlined />}>
                              {test.statusCode ? `HTTP ${test.statusCode} - ` : ""}
                              {test.message || "Gagal"}
                            </Tag>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                <Button
                  type="dashed"
                  onClick={handleAddUrl}
                  block
                  icon={<PlusOutlined />}
                  style={{ marginTop: 8 }}
                >
                  Tambah Webhook URL Baru
                </Button>
              </div>

              <Divider style={{ margin: "24px 0 16px" }} />

              {/* Rate Limit Protection Settings */}
              <div>
                <Space style={{ marginBottom: 8 }}>
                  <SafetyCertificateOutlined style={{ color: "#faad14" }} />
                  <Text strong>Proteksi Rate Limiting & Cooldown Delay Per-URL</Text>
                </Space>
                <Paragraph type="secondary" style={{ marginBottom: 12 }}>
                  Mencegah firewall server webhook Anda memblokir IP server WhatsApp saat banyak event
                  koneksi/reconnect terjadi beruntun. Delay ini memastikan pengiriman ke setiap URL memiliki jeda waktu minimum.
                </Paragraph>
                <Space align="center">
                  <InputNumber
                    min={500}
                    max={60000}
                    step={500}
                    value={rateLimitMs}
                    onChange={(val) => setRateLimitMs(val || 2000)}
                    addonAfter="ms (milidetik)"
                    style={{ width: 220 }}
                  />
                  <Text type="secondary">
                    (Setara {(rateLimitMs / 1000).toFixed(1)} detik per request per URL)
                  </Text>
                </Space>
              </div>
            </Card>
          </Col>

          {/* Card 2: API Token & Authorization */}
          <Col span={24}>
            <Card
              title={
                <Space>
                  <KeyOutlined style={{ color: "#52c41a" }} />
                  <span style={{ fontWeight: "bold" }}>Authorization & API Token (.env)</span>
                </Space>
              }
            >
              <Paragraph type="secondary">
                Token ini digunakan untuk mengamankan <b>Phone Status API</b>. Setiap request ke API
                status wajib menyertakan header <code>Authorization: Bearer &lt;token&gt;</code>.
              </Paragraph>

              <div style={{ marginBottom: 16 }}>
                <Text strong>API Token Saat Ini:</Text>
                <Space.Compact style={{ width: "100%", marginTop: 8 }}>
                  <Input.Password
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}
                    placeholder="API Token (disimpan di .env)"
                  />
                  <Tooltip title="Salin Token">
                    <Button icon={<CopyOutlined />} onClick={copyToken}>
                      Salin
                    </Button>
                  </Tooltip>
                </Space.Compact>
              </div>

              <Alert
                message="Contoh Pemanggilan Phone Status API (cURL)"
                description={
                  <pre
                    style={{
                      margin: "8px 0 0",
                      padding: 8,
                      background: "#282c34",
                      color: "#abb2bf",
                      borderRadius: 4,
                      fontSize: "0.85em",
                      overflowX: "auto",
                    }}
                  >
                    {`curl -X GET "http://localhost:3000/api/phones/status" \\\n  -H "Authorization: Bearer ${apiToken || "<TOKEN>"}"`}
                  </pre>
                }
                type="info"
                showIcon
              />
            </Card>
          </Col>

          {/* Card 3: Payload Documentation */}
          <Col span={24}>
            <Card
              title={
                <Space>
                  <span style={{ fontWeight: "bold" }}>Format Payload Event Webhook</span>
                </Space>
              }
            >
              <Paragraph type="secondary">
                Data JSON yang akan dikirimkan secara otomatis via POST ke semua URL webhook Anda:
              </Paragraph>
              <pre
                style={{
                  margin: 0,
                  padding: 12,
                  background: "#282c34",
                  color: "#98c379",
                  borderRadius: 6,
                  fontSize: "0.85em",
                  overflowX: "auto",
                }}
              >
                {samplePayload}
              </pre>
            </Card>
          </Col>
        </Row>
      </div>
    </Spin>
  );
};

export const getServerSideProps: GetServerSideProps = async (context: any) => {
  const token = await getToken({ req: context.req });
  if (!token) {
    return {
      redirect: {
        destination: "/signin",
        permanent: false,
      },
    };
  }

  return {
    props: {
      ...(await serverSideTranslations(context.locale || "id", ["common"])),
    },
  };
};

SettingPage.getLayout = function getLayout(page: ReactElement) {
  const title = () => i18n?.t("setting") || "PENGATURAN";
  return <Layout title={title().toUpperCase()}>{page}</Layout>;
};

export default SettingPage;
