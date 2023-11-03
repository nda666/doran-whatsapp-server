import React, {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useState,
    MouseEvent,
  } from "react";
  import { Button, Form, FormInstance, Input, Modal, Radio, Upload } from "antd";
  import { UploadOutlined } from "@ant-design/icons";
  import { useTranslation } from "next-i18next";
  import { parsePhoneNumber } from "libphonenumber-js";
  import { Phone, AutoReply } from "@prisma/client";
  import {MenuInfo} from 'rc-menu/lib/interface';
  import Resizer from "react-image-file-resizer";
  
  export interface AutoReplyFormModalRef {
    resetForm: () => void;
  }

  export interface ImageReply {
    preview?: string;
    file_name?: string;
    raw?: any;
  }
  
  export type AutoReplyFormData = {
    phoneId?: string;
    whatsapp_account: string;
    type_keyword: string;
    keyword: string,
    reply: string,
    preview?: string;
  };
  
  interface CollectionCreateFormProps {
    open: boolean;
    onSubmitReply: (values: AutoReplyFormData) => void;
    onChangeImageReply: (values: ImageReply) => void;
    onCancel: () => void;
    title?: string;
    loading?: boolean;
    phoneId?: Phone | undefined;
    editReply?: AutoReply | undefined;
  }
  
  const AutoReplyFormModal = forwardRef<AutoReplyFormModalRef, CollectionCreateFormProps>(
    ({ open, onSubmitReply, onChangeImageReply, onCancel, phoneId, editReply, ...props }, ref) => {
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
          console.log(phoneId);
          let reply = JSON.parse(JSON.stringify(editReply.reply));
          // console.log(editReply.reply);
          form.setFieldValue("id",editReply.id);
          form.setFieldValue("phoneId", phoneId!.id);
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

      const resizeFile = async (file: any) =>
      new Promise<File>(async (resolve) => {
        // Show resized image in preview element
  
      Resizer.imageFileResizer(
          file,
          250,
          250,
          "jpg",
          80,
          0,
          (uri) => {
            resolve(uri as any);
          },
          "file"
        );
      });

      const handleUpload = async (e: React.ChangeEvent<any>) => {
        // console.log(e);
        if(e.target.getAttribute('id') == 'upload-button') {
          if(e.target.files.length) {
            console.log('ok');
            console.log(e);
            const resized = await resizeFile(e.target.files[0]);
            onChangeImageReply!({
                preview: URL.createObjectURL(resized),
                raw: resized,
            } as ImageReply);
          }
        }
      }
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
            <Form.Item name="id" hidden>
              <Input />
            </Form.Item>
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
              <Input disabled/>
            </Form.Item>
            {/* <Form.Item
            name={"type_keyword"}
            label={t("type_keyword")}
            > */}
                <Radio.Group
                onChange={(e) => {
                    setKeywordType(e.target.value)
                }}
                name={"type_keyword"}
                value={keywordType}
                >
                    <Radio value={"Equal"}>Equal</Radio>
                    <Radio value={"Contain"}>Contain</Radio>
                </Radio.Group>
            {/* </Form.Item> */}
            <Form.Item
            name="keyword"
            label={t("keyword")}
            rules={[
              {
                required: true,
                message: t("validation.required", {
                  field: t("keyword"),
                }).toString(),
              },
            ]}
            >
                <Input/>
            </Form.Item>
            {/* <Upload 
            onChange={() => document.getElementById('upload-button')?.click()}
            >
              <Button icon={<UploadOutlined />}>Click to Upload</Button>
            </Upload> */}
            {/* <Button
            onClick={() => document.getElementById("upload-button")?.click()}
            >
              <UploadOutlined />
              Select File
            </Button>
            <input
            type="file"
            id="upload-button"
            style={{display:"none"}}
            onChange={handleUpload}
            /> */}
            <Form.Item 
            name={"reply"}
            label={t("text_message")}
            rules={[
              {
                required: true,
                message: t("validation.required", {
                  field: t("text_message"),
                }).toString(),
              },
            ]}>
              <TextArea rows={10}/>
            </Form.Item>
          </Form>
        </Modal>
      );
    }
  );
  AutoReplyFormModal.displayName = "AutoReplyFormModal";
  export default AutoReplyFormModal;
  