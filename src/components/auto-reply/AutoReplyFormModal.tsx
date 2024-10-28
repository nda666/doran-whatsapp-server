import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";

import {
  Button,
  Checkbox,
  Flex,
  Form,
  Image,
  Input,
  Modal,
  Radio,
  Select,
  Upload,
  UploadProps,
} from "antd";
import { useTranslation } from "next-i18next";
import Resizer from "react-image-file-resizer";

import {
  AutoReplyFormModalRef,
  ButtonMessage,
  CollectionCreateFormProps,
  ImageReply,
} from "@/types/components/IAutoReplyFormModal";
import { UploadOutlined } from "@ant-design/icons";

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
    const { t } = useTranslation("common");
    const { TextArea } = Input;
    const [form] = Form.useForm();
    const [keywordType, setKeywordType] = useState("Equal");
    const [fileList, setFileList] = useState<any[]>([]);
    const [typeMessage, setTypeMessage] = useState<String | undefined>(
      undefined
    );
    const [imagePreview, setImagePreview] = useState<string | undefined>(
      undefined
    );
    const [typeParam1, setTypeParam1] = useState<String | undefined>(undefined);
    const [typeParam2, setTypeParam2] = useState<String | undefined>(undefined);
    const [typeParam3, setTypeParam3] = useState<String | undefined>(undefined);
    const [isSaveInbox, setIsSaveInbox] = useState(false);
    const [numIndex, setNumIndex] = useState(0);
    // const [buttonList, setButtonList] = useState([{name: '', value: ''}]);
    const [buttonList, setButtonList] = useState<ButtonMessage[] | undefined>(
      []
    );

    const uploadImageProps: UploadProps = {
      multiple: false,
      fileList: fileList,
      listType: "picture",

      onRemove: () => {
        setFileList([]);
        setImagePreview(undefined);
      },
      beforeUpload: async (file) => {
        const resized = await resizeFile(file);

        const reader = new FileReader();

        // Once the file is read, update the preview state
        reader.onloadend = () => {
          setImagePreview(reader.result as string);
        };

        // Read the file as a data URL
        reader.readAsDataURL(resized);

        onChangeImageReply!({
          preview: URL.createObjectURL(resized),
          raw: resized,
        } as ImageReply);
        setFileList([resized]);

        return false;
      },
    };

    useEffect(() => {
      if (phoneId) {
        form.setFieldValue("phoneId", phoneId.id);
        //   form.setFieldValue("name", editPhone.name);
        form.setFieldValue("whatsapp_account", phoneId.number);
      }

      if (editReply) {
        //
        let reply = JSON.parse(JSON.stringify(editReply.reply));
        //
        form.setFieldValue("id", editReply.id);
        form.setFieldValue("phoneId", phoneId!.id);
        form.setFieldValue("whatsapp_account", phoneId!.number);
        form.setFieldValue("keyword", editReply.keyword);
        if (reply) {
          form.setFieldValue("reply", reply.text);
        }
        setKeywordType(editReply.type_keyword);
        form.setFieldValue("type_keyword", editReply.type_keyword);
        setTypeMessage(editReply.type);
        form.setFieldValue("type_message", editReply.type);
        form.setFieldValue("is_save_inbox", editReply.is_save_inbox);
        // setIsSaveInbox(editReply.is_save_inbox);
        form.setFieldValue("url", editReply.url);
        form.setFieldValue("type_request", editReply.type_request);
        form.setFieldValue("param_1", editReply.param_1);
        form.setFieldValue("isi_param_1", editReply.isi_param_1);
        form.setFieldValue("param_2", editReply.param_2);
        form.setFieldValue("isi_param_2", editReply.isi_param_2);
        form.setFieldValue("param_3", editReply.param_3);
        form.setFieldValue("isi_param_3", editReply.isi_param_3);
        form.setFieldValue("custom_input_1", editReply.custom_value_1);
        form.setFieldValue("custom_input_2", editReply.custom_value_2);
        form.setFieldValue("custom_input_3", editReply.custom_value_3);
      }

      return () => {
        form.resetFields();
        setTypeMessage(undefined);
      };
    }, [phoneId]);

    useEffect(() => {
      form.setFieldValue("buttons", [...buttonList!]);
    }, [buttonList]);

    const resetForm = () => {
      form.resetFields();
      setTypeMessage(undefined);
    };
    useImperativeHandle(ref, () => ({
      resetForm,
    }));

    const removeExtension = (filename: string) => {
      const lastDotIndex = filename.lastIndexOf(".");
      // If there's no dot in the filename, return the original filename
      if (lastDotIndex === -1) return filename;

      return filename.substring(0, lastDotIndex);
    };
    const resizeFile = async (file: any) =>
      new Promise<File>(async (resolve) => {
        // Show resized image in preview element

        Resizer.imageFileResizer(
          file,
          250,
          250,
          "JPEG",
          80,
          0,
          (uri) => {
            const resizedFile = new File(
              [uri as Blob],
              `resized-${removeExtension(file.name)}.jpg`,
              {
                type: "image/jpeg",
              }
            );

            resolve(resizedFile);
          },
          "file"
        );
      });

    const handleChange = (e: React.ChangeEvent, i: number) => {
      let newButtonList = [...buttonList!];
      newButtonList[i].value = e.target.getAttribute("value") || "";
      setButtonList(newButtonList);
    };

    const addButton = () => {
      setNumIndex(numIndex + 1);
      // let nameInput = `button[${numIndex+1}]`;
      let nameInput = `button${numIndex + 1}`;
      const label = `button ${numIndex + 1}`;
      let collectVal = [];
      collectVal.push(form.getFieldValue("buttons"));

      setButtonList([
        ...buttonList!,
        { name: nameInput, label: label, value: "" },
      ]);
    };

    const removeButton = () => {
      if (buttonList!.length > 1) {
        buttonList!.pop();
        setButtonList([...buttonList!]);
      } else {
        setButtonList([]);
      }
    };
    return (
      <Modal
        open={open}
        maskClosable={false}
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
              //
              const inputValues = { ...values };
              const filPropFormat = /^button[1-9]$/;
              for (const propVal in inputValues) {
                if (filPropFormat.test(propVal)) {
                  delete inputValues[propVal];
                }
              }
              console.log(inputValues);
              // onSubmitReply(values);
              onSubmitReply(inputValues);
            })
            .catch((info) => {});
        }}
        footer={(_, { OkBtn, CancelBtn }) => (
          <>
            <Flex gap="middle" justify="space-between" align="center">
              <CancelBtn />
              <OkBtn />
            </Flex>
          </>
        )}
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
          <Form.Item name="buttons" hidden>
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
          <Form.Item name="is_save_inbox" valuePropName="checked">
            <Checkbox>Simpan Pesan Masuk</Checkbox>
          </Form.Item>
          <Form.Item
            name={"type_keyword"}
            label={t("type_keyword")}
            valuePropName={"keywordType"}
            getValueFromEvent={(event) => {
              return event.target.value;
            }}
          >
            <Radio.Group
              onChange={(e) => {
                setKeywordType(e.target.value);
              }}
              name={"type_keyword"}
              value={keywordType}
            >
              <Radio value={"Equal"}>{t("equal")}</Radio>
              <Radio value={"Contain"}>{t("contain")}</Radio>
              <Radio value={"Any"}>{t("matches_everything")}</Radio>
            </Radio.Group>
          </Form.Item>
          {keywordType != "Any" && (
            <Form.Item
              name="keyword"
              label={t("keyword")}
              rules={[
                {
                  required: keywordType != "Any",
                  message: t("validation.required", {
                    field: t("keyword"),
                  }).toString(),
                },
              ]}
            >
              <Input />
            </Form.Item>
          )}
          <Form.Item
            initialValue={typeMessage !== undefined ? String(typeMessage) : ""}
            label={t("reply_message_type")}
            name={"type_message"}
          >
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
                  value: "text",
                  label: "Text Message",
                },
                {
                  value: "image",
                  label: "Image Message",
                },
                {
                  value: "button",
                  label: "Button Message",
                },
                {
                  value: "webhook",
                  label: "Webhook",
                },
              ]}
            />
          </Form.Item>

          {typeMessage == "text" && (
            <>
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
            </>
          )}
          {typeMessage == "image" && (
            <>
              <Flex vertical justify="center" align="center" gap={5}>
                {imagePreview && (
                  <Image
                    src={imagePreview}
                    alt="Preview"
                    style={{ maxWidth: "200px", maxHeight: "200px" }}
                  />
                )}
                <Upload
                  {...uploadImageProps}
                  className="antd-upload-image-custom"
                >
                  <Button icon={<UploadOutlined />}>Click to Upload</Button>
                </Upload>
              </Flex>
              <Form.Item
                name="caption"
                label={"Caption"}
                style={{ marginTop: "20px", marginBottom: "0" }}
              >
                <Input placeholder="Caption" />
              </Form.Item>
            </>
          )}
          {typeMessage == "button" && (
            <>
              <Form.Item
                name={"reply"}
                label={t("text_message")}
                rules={[
                  {
                    required: true,
                    message: t("validation.required", {
                      field: t("text_messagge"),
                    }).toString(),
                  },
                ]}
              >
                <TextArea rows={3} />
              </Form.Item>

              <Form.Item name={"footer_message"} label={t("footer_message")}>
                <Input />
              </Form.Item>

              <Flex gap="small" wrap="wrap" style={{ marginBottom: "1.5em" }}>
                <Button type="primary" onClick={addButton}>
                  Add Button
                </Button>
                <Button type="primary" danger onClick={removeButton}>
                  Reduce Button
                </Button>
              </Flex>

              {buttonList!.length &&
                buttonList!.map((buttonEl, index) => {
                  return (
                    <Form.Item
                      key={index}
                      label={"Button " + (index + 1)}
                      name={buttonEl.name}
                      // name="buttons"
                    >
                      <Input
                        value={buttonList![index].value}
                        onChange={(e) => handleChange(e, index)}
                      />
                    </Form.Item>
                  );
                })}
            </>
          )}
          {typeMessage == "webhook" && (
            <>
              <Form.Item
                name="url"
                label="URL"
                rules={[
                  {
                    required: true,
                    message: t("validation.required", {
                      field: t("url"),
                    }).toString(),
                  },
                ]}
              >
                <Input />
              </Form.Item>
              <Form.Item
                label="Tipe Request"
                name={"type_request"}
                rules={[
                  {
                    required: true,
                    message: t("validation.required", {
                      field: t("type_request"),
                    }).toString(),
                  },
                ]}
              >
                <Select
                  placeholder="Choose Request Type"
                  options={[
                    { value: "GET", label: "GET" },
                    { value: "POST", label: "POST" },
                  ]}
                />
              </Form.Item>
              <Form.Item label={"Param #1"} name={"param_1"}>
                <Input style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item
                initialValue={
                  typeParam1 !== undefined ? String(typeParam1) : ""
                }
                label={"Isi Param #1"}
                name={"isi_param_1"}
              >
                <Select
                  placeholder="Choose Type Param"
                  onChange={(value: string) => {
                    setTypeParam1(value);
                  }}
                  options={[
                    {
                      value: "Sender",
                      label: "Sender",
                    },
                    {
                      value: "Recipient",
                      label: "Recipient",
                    },
                    {
                      value: "Message",
                      label: "Message",
                    },
                    {
                      value: "Quote",
                      label: "Quote",
                    },
                    {
                      value: "Custom",
                      label: "Manual Input",
                    },
                  ]}
                />
              </Form.Item>
              {typeParam1 == "Custom" && (
                <Form.Item name={"custom_input_1"}>
                  <Input style={{ width: "100%" }} placeholder="Input value" />
                </Form.Item>
              )}
              <Form.Item label={"Param #2"} name={"param_2"}>
                <Input style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item
                initialValue={
                  typeParam2 !== undefined ? String(typeParam2) : ""
                }
                label={"Isi Param #2"}
                name={"isi_param_2"}
              >
                <Select
                  placeholder="Choose Type Param"
                  onChange={(value: string) => {
                    setTypeParam2(value);
                  }}
                  options={[
                    {
                      value: "Sender",
                      label: "Sender",
                    },
                    {
                      value: "Recipient",
                      label: "Recipient",
                    },
                    {
                      value: "Message",
                      label: "Message",
                    },
                    {
                      value: "Quote",
                      label: "Quote",
                    },
                    {
                      value: "Custom",
                      label: "Manual Input",
                    },
                  ]}
                />
              </Form.Item>
              {typeParam2 == "Custom" && (
                <Form.Item name="custom_input_2">
                  <Input style={{ width: "100%" }} placeholder="Input value" />
                </Form.Item>
              )}
              <Form.Item label={"Param #3"} name={"param_3"}>
                <Input style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item
                initialValue={
                  typeParam3 !== undefined ? String(typeParam3) : ""
                }
                label={"Isi Param #3"}
                name={"isi_param_3"}
              >
                <Select
                  placeholder="Choose Type Param"
                  onChange={(value: string) => {
                    setTypeParam3(value);
                  }}
                  options={[
                    {
                      value: "Sender",
                      label: "Sender",
                    },
                    {
                      value: "Recipient",
                      label: "Recipient",
                    },
                    {
                      value: "Message",
                      label: "Message",
                    },
                    {
                      value: "Quote",
                      label: "Quote",
                    },
                    {
                      value: "Custom",
                      label: "Manual Input",
                    },
                  ]}
                />
              </Form.Item>
              {typeParam3 == "Custom" && (
                <Form.Item name="custom_input_3">
                  <Input style={{ width: "100%" }} placeholder="Input value" />
                </Form.Item>
              )}
            </>
          )}
        </Form>
      </Modal>
    );
  }
);
AutoReplyFormModal.displayName = "AutoReplyFormModal";
export default AutoReplyFormModal;
