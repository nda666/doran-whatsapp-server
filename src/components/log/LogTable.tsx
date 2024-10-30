import {
  useEffect,
  useState,
} from 'react';

import {
  Button,
  Card,
  Col,
  Form,
  Image,
  Input,
  Row,
  Table,
  TablePaginationConfig,
  Tooltip,
} from 'antd';
import { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';

import useWebhookLogData, { SearchWebhookLogParams } from '@/lib/useWebhookLog';
import { InboxMessage } from '@prisma/client';

export const LogTable = ({
  token,
  showSearch,
}: {
  token: string;
  showSearch: boolean;
}) => {
  const [searchQuery, setSearchQuery] = useState<SearchWebhookLogParams>({
    limit: 10,
    page: 1,
    recipient: "",
    sender: "",
  });

  const log = useWebhookLogData(token, searchQuery);
  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 10,
    total: 0,
  });
  useEffect(() => {
    setPagination({
      ...pagination,
      total: log?.data.totalData,
      current: log?.data.currentPage,
    });
  }, [log?.data.totalData, log?.data.currentPage, log?.data.totalPage]);
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

  const onSearch = (val: any) => {
    setSearchQuery({ ...searchQuery, ...val });
  };
  return (
    <>
      <Card
        title={t("filter")}
        className={`form-container ${showSearch ? "visible" : "hidden"}`}
      >
        {showSearch && (
          <Form
            layout="horizontal"
            onFinish={onSearch}
            // initialValues={initialValues}
          >
            <Row style={{ width: "100%" }}>
              <Col xs={24} sm={24} md={12}>
                <Form.Item
                  label={t("sender")}
                  name="sender"
                  labelCol={{
                    xs: { span: 24 },
                    sm: { span: 24 },
                    md: { span: 5 },
                  }} // Control the label width
                  wrapperCol={{
                    xs: { span: 24 },
                    sm: { span: 24 },
                    md: { span: 19 },
                  }} // Control the input width
                >
                  <Input placeholder={t("enter_sender")} />
                </Form.Item>
              </Col>

              <Col xs={24} sm={24} md={12}>
                <Form.Item
                  label={t("recipient")}
                  name="recipient"
                  labelCol={{
                    xs: { span: 24 },
                    sm: { span: 24 },
                    md: { span: 5 },
                  }} // Control the label width
                  wrapperCol={{
                    xs: { span: 24 },
                    sm: { span: 24 },
                    md: { span: 19 },
                  }} // Control the input width
                >
                  <Input placeholder={t("enter_recipient")} />
                </Form.Item>
                <Form.Item
                  wrapperCol={{
                    xs: { span: 24 },
                    sm: { span: 24 },
                    md: { span: 19, offset: 5 },
                  }}
                >
                  <Button block type="primary" htmlType="submit">
                    {t("search")}
                  </Button>
                </Form.Item>
              </Col>
            </Row>
          </Form>
        )}
      </Card>
      <Table
        loading={log.loading}
        pagination={pagination} // Disable default pagination
        onChange={(pagination: TablePaginationConfig) => {
          setSearchQuery({
            ...searchQuery,
            limit: pagination.pageSize,
            page: pagination.current || 1,
          });
        }}
        dataSource={log.data?.data}
        columns={dataColumn}
        rowKey="id"
      />
    </>
  );
};
