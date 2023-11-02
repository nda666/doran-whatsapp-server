import React, {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useState,
    MouseEvent,
  } from "react";
  import { Button, Form, FormInstance, Input, Modal, Radio } from "antd";
  import { useTranslation } from "next-i18next";
  import { parsePhoneNumber } from "libphonenumber-js";
  import { Phone, AutoReply } from "@prisma/client";
  import {MenuInfo} from 'rc-menu/lib/interface';
  
  export interface AutoReplyFormModalRef {
    resetForm: () => void;
  }
  
  export type AutoReplyFormData = {
    phoneId?: string;
    whatsapp_account: string;
    type_keyword: string;
    keyword: string,
    reply: string
  };
  
  interface CollectionCreateFormProps {
    open: boolean;
    onSubmitReply: (values: AutoReplyFormData) => void;
    onCancel: () => void;
    title?: string;
    loading?: boolean;
    phoneId?: Phone | undefined;
    editReply?: AutoReply | undefined;
  }
  
  const AutoReplyFormModal = forwardRef<AutoReplyFormModalRef, CollectionCreateFormProps>(
    ({ open, onSubmitReply, onCancel, phoneId, editReply, ...props }, ref) => {
      const { t } = useTranslation("common");
      const {TextArea} = Input;
      const [form] = Form.useForm();
      const [keywordType, setKeywordType] = useState("Equal");
      useEffect(() => {
        if (phoneId) {
          form.setFieldValue("phoneId", phoneId.id);
        //   form.setFieldValue("name", editPhone.name);
          form.setFieldValue("whatsapp_account", phoneId.number);
        }

        if(editReply) {
          let reply = JSON.parse(JSON.stringify(editReply.reply));
          // console.log(editReply.reply);
          form.setFieldValue("whatsapp_account", phoneId!.number);
          form.setFieldValue('keyword',editReply.keyword);
          form.setFieldValue("reply", reply.text);
        }

        return () => {
          form.resetFields();
        };
      }, [phoneId]);
  
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
                onSubmitReply(values);
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
            {/* <Form.Item name="id" hidden>
              <Input />
            </Form.Item> */}
            <Form.Item name="phoneId" hidden>
              <Input />
            </Form.Item>
            <Form.Item
              name="whatsapp_account"
              label={t("whatsapp_account")}
              rules={[
                {
                  required: true,
                  message: t("validation.required", {
                    field: t("whatsapp_account"),
                  }).toString(),
                },
              ]}
            >
              <Input />
            </Form.Item>
            <Form.Item
            name={"type_keyword"}
            label={t("type_keyword")}
            >
                <Radio.Group
                onChange={(e) => {
                    setKeywordType(e.target.value)
                }}
                value={keywordType}
                >
                    <Radio value={"Equal"}>Equal</Radio>
                    <Radio value={"Contain"}>Contain</Radio>
                </Radio.Group>
            </Form.Item>
            <Form.Item
            name="keyword"
            label={t("keyword")}
            >
                <Input/>
            </Form.Item>
            <Form.Item 
            name={"reply"}
            label={t("text_message")}>
              <TextArea rows={10}/>
            </Form.Item>
          </Form>
        </Modal>
      );
    }
  );
  AutoReplyFormModal.displayName = "AutoReplyFormModal";
  export default AutoReplyFormModal;
  