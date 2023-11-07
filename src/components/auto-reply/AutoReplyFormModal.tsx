import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  MouseEvent,
} from "react";
import {
  Button,
  Form,
  FormInstance,
  Input,
  Modal,
  Radio,
  Upload,
  Flex,
  Row,
  Col,
  Select,
} from "antd";
import {
  UploadOutlined,
  PaperClipOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { useTranslation } from "next-i18next";
import { parsePhoneNumber } from "libphonenumber-js";
import { Phone, AutoReply } from "@prisma/client";
import { MenuInfo } from "rc-menu/lib/interface";
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
  keyword: string;
  reply: string;
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

const AutoReplyFormModal = forwardRef<
  AutoReplyFormModalRef,
  CollectionCreateFormProps
>(
  (
    {
      open,
      onSubmitReply,
      onChangeImageReply,
      onCancel,
      phoneId,
      editReply,
      ...props
    },
    ref
  ) => {
    const typeReply = ["text-message", "image-message"];

    const { t } = useTranslation("common");
    const { TextArea } = Input;
    const [form] = Form.useForm();
    const [keywordType, setKeywordType] = useState("Equal");
    const [fileList, setFileList] = useState<String[]>([]);
    const [typeMessage, setTypeMessage] = useState("");
    useEffect(() => {
      if (phoneId) {
        form.setFieldValue("phoneId", phoneId.id);
        //   form.setFieldValue("name", editPhone.name);
        form.setFieldValue("whatsapp_account", phoneId.number);
      }

      if (editReply) {
        let reply = JSON.parse(JSON.stringify(editReply.reply));
        // console.log(editReply.reply);
        form.setFieldValue("id", editReply.id);
        form.setFieldValue("phoneId", phoneId!.id);
        form.setFieldValue("whatsapp_account", phoneId!.number);
        form.setFieldValue("keyword", editReply.keyword);
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
      if (e.target.getAttribute("id") == "upload-button") {
        if (e.target.files.length) {
          // console.log('ok');
          // console.log(e);
          // console.log(e.target.files);
          const files = e.target.files[0];
          // console.log(files.name);
          setFileList([...fileList, files.name]);
          const resized = await resizeFile(e.target.files[0]);
          onChangeImageReply!({
            preview: URL.createObjectURL(resized),
            raw: resized,
          } as ImageReply);
        }
      }
    };

    const removeFile = (e: React.ChangeEvent<any>) => {
      // console.log(fileList);
      const valueTarget = e.target.value;
      const index = fileList.indexOf(valueTarget);
      const newFileList = fileList.slice();
      newFileList.splice(index, 1);
      setFileList(newFileList);
      // console.log(e);
      // console.log(String(e.target.value));
    };
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
            <Input disabled />
          </Form.Item>
          {/* <Form.Item
            name={"type_keyword"}
            label={t("type_keyword")}
            > */}
          <Radio.Group
            onChange={(e) => {
              setKeywordType(e.target.value);
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
            <Input />
          </Form.Item>

          <Select
            placeholder="Select One"
            style={{
              width: "100%",
            }}
            onChange={(value: string) => {
              setTypeMessage(value);
            }}
            options={[
              {
                value: "text-message",
                label: "Text Message",
              },
              {
                value: "image-message",
                label: "Image Message",
              },
            ]}
          />

          {typeMessage == "text-message" ? (
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
              ]}
            >
              <TextArea rows={10} />
            </Form.Item>
          ) : typeMessage == "image-message" ? (
            <>
              <Button
                style={{ display: "block", margin: "1.2em 0" }}
                onClick={() =>
                  document.getElementById("upload-button")?.click()
                }
              >
                <UploadOutlined />
                Select File
              </Button>
              {fileList &&
                fileList.map((item, i) => (
                  <Row key={i}>
                    <Col span={24}>
                      <Flex
                        justify="space-between"
                        align="center"
                        style={{ marginTop: "8px" }}
                      >
                        <PaperClipOutlined />
                        <span
                          style={{
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            padding: "0 8px",
                            // lineHeight: '1.5',
                            flex: "auto",
                          }}
                        >
                          {item}
                        </span>
                        <span>
                          <Button
                            type="text"
                            value={String(item)}
                            onClick={(e) => removeFile(e)}
                          >
                            <DeleteOutlined />
                          </Button>
                        </span>
                      </Flex>
                    </Col>
                  </Row>
                ))}
              <input
                type="file"
                id="upload-button"
                style={{ display: "none" }}
                onChange={handleUpload}
              />
            </>
          ) : (
            ""
          )}
          {/* <Upload 
            onChange={() => document.getElementById('upload-button')?.click()}
            >
              <Button icon={<UploadOutlined />}>Click to Upload</Button>
            </Upload> */}
        </Form>
      </Modal>
    );
  }
);
AutoReplyFormModal.displayName = "AutoReplyFormModal";
export default AutoReplyFormModal;
