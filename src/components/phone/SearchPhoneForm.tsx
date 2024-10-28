import React, { useState } from "react";

import { Button, Card, Col, Form, Input, Row, Select } from "antd";
import { useTranslation } from "react-i18next";

const { Option } = Select;
interface SearchPhoneFormProps {
  onSubmitSuccess: (values: any) => void;
  visible: boolean;
}

const SearchPhoneForm: React.FC<SearchPhoneFormProps> = ({
  onSubmitSuccess,
  visible,
}) => {
  const [form] = Form.useForm();
  const [isAnimating, setIsAnimating] = useState(false); // Track animation state
  const { t } = useTranslation("common");
  const handleFinish = (values: any) => {
    onSubmitSuccess(values);
  };
  const initialValues = {
    status: "", // This corresponds to the "Show All" option
  };
  return (
    <Card
      title={t("filter")}
      className={`form-container ${visible ? "visible" : "hidden"}`}
    >
      {visible && (
        <Form
          form={form}
          layout="horizontal"
          onFinish={handleFinish}
          initialValues={initialValues}
        >
          <Row style={{ width: "100%" }}>
            <Col xs={24} sm={24} md={12}>
              <Form.Item
                label={t("name")}
                name="name"
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
                <Input placeholder={t("enter_name")} />
              </Form.Item>
              <Form.Item
                label={t("number")}
                name="number"
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
                <Input placeholder={t("enter_number")} />
              </Form.Item>
            </Col>

            <Col xs={24} sm={24} md={12}>
              <Form.Item
                label={t("status")}
                name="is_online"
                initialValue={""}
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
                <Select placeholder="Select status">
                  <Option value="">{t("show_all")}</Option>{" "}
                  {/* Undefined case */}
                  <Option value="1">Online</Option>
                  <Option value="0">Offline</Option>
                </Select>
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
  );
};

export default SearchPhoneForm;
