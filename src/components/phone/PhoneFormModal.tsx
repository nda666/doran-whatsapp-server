import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { Button, Form, FormInstance, Input, Modal, Radio } from "antd";
import { useTranslation } from "next-i18next";
import { parsePhoneNumber } from "libphonenumber-js";
import { Phone } from "@prisma/client";

export interface PhoneFormModalRef {
  resetForm: () => void;
}

export type PhoneFormData = {
  id?: string;
  name: string;
  is_save_group?: boolean;
};

interface CollectionCreateFormProps {
  open: boolean;
  onSubmit: (values: PhoneFormData) => void;
  onCancel: () => void;
  title?: string;
  loading?: boolean;
  editPhone?: Phone | undefined;
}

const PhoneFormModal = forwardRef<PhoneFormModalRef, CollectionCreateFormProps>(
  ({ open, onSubmit, onCancel, editPhone, ...props }, ref) => {
    const { t } = useTranslation("common");
    const [form] = Form.useForm();
    useEffect(() => {
      if (editPhone) {
        form.setFieldValue("id", editPhone.id);
        form.setFieldValue("name", editPhone.name);
      }
      return () => {
        form.resetFields();
      };
    }, [editPhone]);

    const resetForm = () => {
      form.resetFields();
    };
    useImperativeHandle(ref, () => ({
      resetForm,
    }));
    return (
      <Modal
        open={open}
        title={props.title || ""}
        okText={t("save")}
        cancelText={t("cancel")}
        onCancel={onCancel}
        okButtonProps={{
          loading: props?.loading,
        }}
        cancelButtonProps={{
          disabled: props?.loading,
        }}
        onOk={() => {
          form
            ?.validateFields()
            .then((values) => {
              onSubmit(values);
            })
            .catch((info) => {});
        }}
      >
        <Form
          disabled={props?.loading}
          form={form}
          layout="vertical"
          name="phone-form"
          initialValues={{ modifier: "public" }}
        >
          <Form.Item name="id" hidden>
            <Input />
          </Form.Item>
          <Form.Item
            name="name"
            label={t("name")}
            rules={[
              {
                required: true,
                message: t("validation.required", {
                  field: t("name"),
                }).toString(),
              },
            ]}
          >
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    );
  }
);
PhoneFormModal.displayName = "PhoneFormModal";
export default PhoneFormModal;
