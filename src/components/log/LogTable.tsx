import { useUiTranslation } from "@/lib/uiTranslation";
import { useState } from "react";
import { Alert, Button, Card, DatePicker, Form, Image, Input, Space, Tooltip } from "antd";
import { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useLocalizedTranslation as useTranslation } from "@/lib/uiTranslation";
import Table from "@/components/DashboardTable";
import { useTableState } from "@/lib/useTableState";
import { useDashboardApi } from "@/lib/useDashboardApi";
import { InboxMessage } from "@prisma/client";
import { defaultDispatchDates } from "@/lib/dispatchDateFilter";
export const LogTable = ({ token, showSearch }: { token: string; showSearch: boolean }) => {
  const uiText = useUiTranslation();
  const table = useTableState();
  const [filters, setFilters] = useState(() => ({ sender: "", recipient: "", ...defaultDispatchDates() }));
  const log = useDashboardApi(`/api/log?${table.params}&${new URLSearchParams(filters).toString()}`);
  const { t } = useTranslation("common");
  const dataColumn: ColumnsType<InboxMessage> = [
    {
      title: t("sender"),
      key: "sender",
      dataIndex: "sender",
    },
    {
      title: t("recipient"),
      key: "recipient",
      dataIndex: "recipient",
    },
    {
      title: t("message"),
      key: "message",
      dataIndex: "message",
      width: "150px",
      ellipsis: {
        showTitle: false,
      },
      render: (v) => (
        <Tooltip placement="topLeft" title={v}>
          {v}
        </Tooltip>
      ),
    },
    {
      title: t("quote"),
      key: "quote",
      dataIndex: "quote",
      ellipsis: {
        showTitle: false,
      },
      render: (v) => (
        <Tooltip placement="topLeft" title={v}>
          {v}
        </Tooltip>
      ),
    },
    {
      title: t("response"),
      key: "respons",
      dataIndex: "respons",
      ellipsis: {
        showTitle: false,
      },
      render: (v) => (
        <Tooltip placement="topLeft" title={v}>
          {v}
        </Tooltip>
      ),
    },
    {
      title: t("image_in"),
      key: "image_in",
      dataIndex: "image_in",
      render: (v) =>
        v ? (
          <Image
            width={50}
            height={50}
            src={`${process.env.NEXT_PUBLIC_APP_URL}/api/image/${v}`}
            alt={v}
          />
        ) : (
          ""
        ),
    },
    {
      title: t("request_type"),
      key: "type_request",
      dataIndex: "type_request",
    },
    {
      title: t("url"),
      key: "url",
      dataIndex: "url",
      width: "150px",
      render: (v) => (
        <Tooltip placement="topLeft" title={v}>
          <code
            style={{ overflow: "auto", whiteSpace: "nowrap", display: "block" }}
          >
            {v}
          </code>
        </Tooltip>
      ),
    },
    {
      title: t("sentAt"),
      key: "sentAt",
      dataIndex: "sentAt",
      render: (v) => {
        const date = dayjs(v);
        return date.isValid() ? date.format("DD/MM/YYYY HH:mm:ss") : "-";
      },
    },
    {
      title: t("receivedAt"),
      key: "receivedAt",
      dataIndex: "receivedAt",
      render: (v) => {
        const date = dayjs(v);
        return date.isValid() ? date.format("DD/MM/YYYY HH:mm:ss") : "-";
      },
    },
  ];

  return <Space direction="vertical" size="middle" style={{ width: "100%" }}>
    {showSearch && <Card title={uiText("Pencarian")}><Form layout="vertical" colon={false} className="dashboard-filter-grid" initialValues={{ start_date: dayjs(filters.start_date), end_date: dayjs(filters.end_date) }} onFinish={values => { setFilters({ sender: values.sender || "", recipient: values.recipient || "", start_date: values.start_date.format("YYYY-MM-DD"), end_date: values.end_date.format("YYYY-MM-DD") }); table.reset(); }}>
      <Form.Item name="start_date" label={uiText("Tanggal mulai")} tooltip={uiText("Berdasarkan tanggal Diterima, mulai pukul 00:00 WIB.")} rules={[{ required: true, message: uiText("Pilih tanggal mulai.") }]}><DatePicker allowClear={false} format="DD/MM/YYYY" style={{ width: "100%" }} /></Form.Item>
      <Form.Item name="end_date" label={uiText("Tanggal selesai")} tooltip={uiText("Mencakup seluruh hari pada tanggal selesai (WIB). Default 3 hari terakhir.")} dependencies={["start_date"]} rules={[{ required: true, message: uiText("Pilih tanggal selesai.") }, ({ getFieldValue }) => ({ validator(_, value) { const start = getFieldValue("start_date"); return !value || !start || !value.isBefore(start, "day") ? Promise.resolve() : Promise.reject(new Error(uiText("Tanggal selesai harus sama atau setelah tanggal mulai."))); } })]}><DatePicker allowClear={false} format="DD/MM/YYYY" style={{ width: "100%" }} /></Form.Item>
      <Form.Item name="sender" label={t("sender")}><Input allowClear placeholder={t("enter_sender")} /></Form.Item>
      <Form.Item name="recipient" label={t("recipient")}><Input allowClear placeholder={t("enter_recipient")} /></Form.Item>
      <div className="dashboard-filter-actions"><Button type="primary" htmlType="submit">{uiText("Cari")}</Button></div>
    </Form></Card>}
    {log.error && <Alert type="error" message={uiText(log.error)} />}
    <Table table={table} total={log.data?.totalData} className="table-with-data-count" scroll={{ x: true }} dataSource={log.data?.data || []} columns={dataColumn} rowKey="id" />
  </Space>;
};
