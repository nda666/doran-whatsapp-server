import { useUiTranslation } from "@/lib/uiTranslation";
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
  InputNumber,
  Modal,
  Radio,
  Select,
  Upload,
  UploadProps,
} from "antd";
import { useLocalizedTranslation as useTranslation } from "@/lib/uiTranslation";
import Resizer from "react-image-file-resizer";

import {
  AutoReplyFormModalRef,
  ButtonMessage,
  CollectionCreateFormProps,
  ImageReply,
} from "@/types/components/IAutoReplyFormModal";
import { UploadOutlined } from "@ant-design/icons";
import WhatsAppCompatibilityNotice from "@/components/WhatsAppCompatibilityNotice";
import KeywordTagsInput from "./KeywordTagsInput";
import MessageTemplatePicker from "@/components/MessageTemplatePicker";
import { aiProviders, providerNames } from "@/lib/aiPlugins";
import { Alert } from "antd";

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
  const uiText = useUiTranslation();
    const { t } = useTranslation("common");
    const { TextArea } = Input;
    const [form] = Form.useForm();
    const [keywordType, setKeywordType] = useState("Equal");
    const [fileList, setFileList] = useState<any[]>([]);
    const typeMessage = Form.useWatch("type_message", form);
    const [imagePreview, setImagePreview] = useState<string | undefined>(
      undefined
    );
    const typeParam1 = Form.useWatch("isi_param_1", form);
    const typeParam2 = Form.useWatch("isi_param_2", form);
    const typeParam3 = Form.useWatch("isi_param_3", form);
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
        form.setFieldValue("reply_status", editReply.reply_status);
        form.setFieldValue("delaySeconds", editReply.delaySeconds);
        form.setFieldValue("is_quoted", editReply.is_quoted);
        if (editReply.type === "list") form.setFieldValue("listPayload", JSON.stringify(editReply.reply, null, 2));
        if (editReply.type === "ai") {
          form.setFieldValue("aiProvider", reply?.provider);
          form.setFieldValue("aiInstructions", reply?.instructions || "");
          form.setFieldValue("reply_when", editReply.reply_when);
        }
        if (reply) {
          form.setFieldValue("reply", reply.text);
        }
        setKeywordType(editReply.type_keyword);
        form.setFieldValue("type_keyword", editReply.type_keyword);
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
        setKeywordType("Equal");
      };
    }, [phoneId, editReply, form]);

    useEffect(() => {
      form.setFieldValue("buttons", [...buttonList!]);
    }, [buttonList]);

    const resetForm = () => {
      form.resetFields();
      setKeywordType("Equal");
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
      const label = uiText("button {{v0}}", { v0: numIndex + 1 });
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
        title={props.title || (editReply ? uiText("Edit Balasan Otomatis") : uiText("Tambah Balasan Otomatis"))}
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
          initialValues={{ modifier: "public", reply_status: "inactive", type_keyword: "Equal", type_message: "text" }}
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
            <Checkbox>{uiText("Simpan Pesan Masuk")}</Checkbox>
          </Form.Item>
          <Form.Item name="reply_status" label={uiText("Aktifkan Balasan Ini")}
            extra={uiText("Balasan ini hanya dijalankan jika Balasan Otomatis pada perangkat juga aktif.")}
            rules={[{ required: true }]}>
            <Select options={[{ value: "active", label: uiText("Aktif") }, { value: "inactive", label: uiText("Tidak aktif") }]} />
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
              extra={uiText("Tekan Enter untuk menambahkan kata kunci")}
              rules={[
                {
                  required: keywordType != "Any",
                  message: t("validation.required", {
                    field: t("keyword"),
                  }).toString(),
                },
              ]}
            >
              <KeywordTagsInput />
            </Form.Item>
          )}
          <Form.Item
            label={t("reply_message_type")}
            name={"type_message"}
          >
            <Select
              placeholder={uiText("Select One")}
              style={{
                width: "100%",
              }}
              options={[
                {
                  value: "text",
                  label: uiText("Text Message"),
                },
                {
                  value: "image",
                  label: uiText("Image Message"),
                },
                {
                  value: "button",
                  label: uiText("Button Message"),
                },
                {
                  value: "list",
                  label: uiText("List Menu"),
                },
                {
                  value: "webhook",
                  label: uiText("Webhook"),
                },
                { value: "ai", label: uiText("Balasan AI (OpenAI / Gemini / Claude)") },
              ]}
            />
          </Form.Item>
          {(typeMessage === "button" || typeMessage === "template") && <WhatsAppCompatibilityNotice />}
          <Form.Item name="delaySeconds" label={uiText("Delay balasan (detik)")} initialValue={0}><InputNumber min={0} max={60} /></Form.Item>
          <Form.Item name="is_quoted" valuePropName="checked"><Checkbox>{uiText("Kutip pesan masuk")}</Checkbox></Form.Item>
          {typeMessage === "list" && <Form.Item name="listPayload" label={uiText("JSON list menu (lihat API Docs)")} rules={[{ required: true }]}><Input.TextArea rows={5} placeholder={'{"text":"Menu","title":"Layanan","buttonText":"Pilih","rows":[{"id":"info","title":"Informasi"}]}'} /></Form.Item>}

          {typeMessage == "text" && (
            <>
              <Form.Item label={uiText("Gunakan template tersimpan")}><MessageTemplatePicker disabled={props.loading} onApply={text => form.setFieldValue("reply", text)} /></Form.Item>
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
          {typeMessage === "ai" && <>
            <Alert type="info" showIcon style={{ marginBottom: 16 }} message={uiText("Konfigurasi di menu Plugin AI pada akun pemilik perangkat")} description={uiText("AI membalas pesan baru yang cocok dengan kata kunci di atas. Jika beberapa aturan AI cocok, satu pesan hanya diproses sekali. Instruksi sistem provider berlaku bersama instruksi tambahan aturan ini. Riwayat chat dan lampiran tidak dikirim ke AI.")} />
            <Form.Item name="aiProvider" label={uiText("Provider AI")} rules={[{ required: true, message: uiText("Pilih provider AI.") }]}><Select options={aiProviders.map(value => ({ value, label: providerNames[value] }))} /></Form.Item>
            <Form.Item name="reply_when" label={uiText("Balas AI pada")} initialValue="Personal" rules={[{ required: true }]}><Select options={[{ value: "Personal", label: uiText("Pesan pribadi") }, { value: "Group", label: uiText("Pesan grup") }, { value: "All", label: uiText("Pesan pribadi dan grup") }]} /></Form.Item>
            <Form.Item name="aiInstructions" label={uiText("Instruksi tambahan untuk aturan ini (opsional)")}><Input.TextArea rows={4} maxLength={4000} showCount placeholder={uiText("Contoh: bantu pelanggan memilih produk dan arahkan pertanyaan harga ke admin.")} /></Form.Item>
          </>}
          {typeMessage == "image" && (
            <>
              <Flex vertical justify="center" align="center" gap={5}>
                {imagePreview && (
                  <Image
                    src={imagePreview}
                    alt={uiText("Preview")}
                    style={{ maxWidth: "200px", maxHeight: "200px" }}
                  />
                )}
                <Upload
                  {...uploadImageProps}
                  className="antd-upload-image-custom"
                >
                  <Button icon={<UploadOutlined />}>{uiText("Click to Upload")}</Button>
                </Upload>
              </Flex>
              <Form.Item
                name="caption"
                label={"Caption"}
                style={{ marginTop: "20px", marginBottom: "0" }}
              >
                <Input placeholder={uiText("Caption")} />
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
                  {uiText("Add Button")}</Button>
                <Button type="primary" danger onClick={removeButton}>
                  {uiText("Reduce Button")}</Button>
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
                label={"URL"}
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
                label={uiText("Tipe Request")}
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
                  placeholder={uiText("Choose Request Type")}
                  options={[
                    { value: "GET", label: "GET" },
                    { value: "POST", label: "POST" },
                  ]}
                />
              </Form.Item>
              <Form.Item label={uiText("Label Param #1")} name={"param_1"}>
                <Input style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item
                label={uiText("Isi Param #1")}
                name={"isi_param_1"}
              >
                <Select
                  placeholder={uiText("Choose Type Param")}
                  options={[
                    {
                      value: "Sender",
                      label: uiText("Sender"),
                    },
                    {
                      value: "Recipient",
                      label: uiText("Recipient"),
                    },
                    {
                      value: "Message",
                      label: uiText("Message"),
                    },
                    {
                      value: "Quote",
                      label: uiText("Quote"),
                    },
                    {
                      value: "Custom",
                      label: uiText("Manual Input"),
                    },
                  ]}
                />
              </Form.Item>
              {typeParam1 == "Custom" && (
                <Form.Item name={"custom_input_1"}>
                  <Input style={{ width: "100%" }} placeholder={uiText("Input value")} />
                </Form.Item>
              )}
              <Form.Item label={uiText("Label Param #2")} name={"param_2"}>
                <Input style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item
                label={uiText("Isi Param #2")}
                name={"isi_param_2"}
              >
                <Select
                  placeholder={uiText("Choose Type Param")}
                  options={[
                    {
                      value: "Sender",
                      label: uiText("Sender"),
                    },
                    {
                      value: "Recipient",
                      label: uiText("Recipient"),
                    },
                    {
                      value: "Message",
                      label: uiText("Message"),
                    },
                    {
                      value: "Quote",
                      label: uiText("Quote"),
                    },
                    {
                      value: "Custom",
                      label: uiText("Manual Input"),
                    },
                  ]}
                />
              </Form.Item>
              {typeParam2 == "Custom" && (
                <Form.Item name="custom_input_2">
                  <Input style={{ width: "100%" }} placeholder={uiText("Input value")} />
                </Form.Item>
              )}
              <Form.Item label={uiText("Label Param #3")} name={"param_3"}>
                <Input style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item
                label={uiText("Isi Param #3")}
                name={"isi_param_3"}
              >
                <Select
                  placeholder={uiText("Choose Type Param")}
                  options={[
                    {
                      value: "Sender",
                      label: uiText("Sender"),
                    },
                    {
                      value: "Recipient",
                      label: uiText("Recipient"),
                    },
                    {
                      value: "Message",
                      label: uiText("Message"),
                    },
                    {
                      value: "Quote",
                      label: uiText("Quote"),
                    },
                    {
                      value: "Custom",
                      label: uiText("Manual Input"),
                    },
                  ]}
                />
              </Form.Item>
              {typeParam3 == "Custom" && (
                <Form.Item name="custom_input_3">
                  <Input style={{ width: "100%" }} placeholder={uiText("Input value")} />
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
