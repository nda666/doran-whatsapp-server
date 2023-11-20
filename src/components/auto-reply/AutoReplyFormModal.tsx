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
  Checkbox,
  Space} from "antd";
import { 
  UploadOutlined, 
  PaperClipOutlined, 
  DeleteOutlined } from "@ant-design/icons";
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
  image_reply?: any;
}

export type ButtonMessage = {
  label?: string;
  name: string;
  value?: string;
}

export type AutoReplyFormData = {
  phoneId?: string;
  whatsapp_account: string;
  type_keyword: string;
  type_message: string;
  keyword: string,
  reply: string,
  image?: any;
  is_save_inbox?: boolean;
  buttons: ButtonMessage[];
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
    const typeReply = [
      'text-message',
      'image-message'
    ];

    const { t } = useTranslation("common");
    const {TextArea} = Input;
    const [form] = Form.useForm();
    const [keywordType, setKeywordType] = useState("Equal");
    const [fileList, setFileList] = useState<any[]>([]);
    const [typeMessage, setTypeMessage] = useState<String | undefined>(undefined);
    const [isSaveInbox, setIsSaveInbox] = useState(false);
    const [numIndex, setNumIndex] = useState(0);
    // const [buttonList, setButtonList] = useState([{name: '', value: ''}]);
    const [buttonList, setButtonList] = useState<{
      name: string;
      label: string;
      value: string;
    }[] | undefined>([]);
    const buttonItemLayout =  {
      wrapperCol: {
        span: 14,
        offset: 4,
      },
    }

    const tailLayout = {
      wrapperCol: {
        offset: 90,
        span: 16,
      },
    };
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
        setTypeMessage(undefined);
      };
    }, [phoneId]);

    useEffect(() => {
      // const inputValues = {...form.getFieldsValue()};
      // // console.log(inputValues);
      // const filPropFormat = /^button[1-9]$/
      // for (const propVal in inputValues) {
      //   if(filPropFormat.test(propVal)) {
      //     console.log(propVal);
      //     console.log(inputValues[propVal]);
      //     delete inputValues[propVal];
      //   }
      // }

      // inputValues.buttons = buttonList;
      // console.log(inputValues);
      form.setFieldValue('buttons',[
        ...buttonList!
      ]);

      // form.setFieldsValue(inputValues);

    },[buttonList])

    const resetForm = () => {
      form.resetFields();
      setTypeMessage(undefined);
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
          const files = e.target.files[0];
          console.log(files.name);
          // setFileList([...fileList,files.name]);
          setFileList([files.name]);
          const resized = await resizeFile(e.target.files[0]);
          onChangeImageReply!({
              preview: URL.createObjectURL(resized),
              raw: resized,
          } as ImageReply);
        }
      }
    }

    const removeFile = (e: React.ChangeEvent<any>) => {
      // console.log(fileList);
      const valueTarget = e.target.value;
      const index = fileList.indexOf(valueTarget);
      const newFileList = fileList.slice();
      newFileList.splice(index,1);
      setFileList(newFileList);
      // console.log(e);
      // console.log(String(e.target.value));
    }

    const handleChange = (e: React.ChangeEvent,i: number) => {
      let newButtonList = [...buttonList!];
      newButtonList[i].value = e.target.getAttribute('value') || '';
      setButtonList(newButtonList);
    }

    const addButton = () => {
      setNumIndex(numIndex + 1);
      // let nameInput = `button[${numIndex+1}]`;
      let nameInput = `button${numIndex+1}`;
      const label = `button ${numIndex+1}`;
      let collectVal = [];
      collectVal.push(form.getFieldValue('buttons'));

      setButtonList([
        ...buttonList!,
      {name: nameInput, label: label, value: ''}
      ]);
    }

    const removeButton = () => {
      if(buttonList!.length > 1) {
        buttonList!.pop();
        setButtonList([...buttonList!])
      } else {
        setButtonList([]);
      }
    }

    const allow_mime = ['image/jpeg','image/gif','image/png','image/jpg'];

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
              // console.log(values);
              const inputValues = {...values};
              const filPropFormat = /^button[1-9]$/
              for (const propVal in inputValues) {
                if(filPropFormat.test(propVal)) {
                  delete inputValues[propVal];
                }
              }
              // onSubmitReply(values);
              onSubmitReply(inputValues);
            })
            .catch((info) => {});
        }}
        footer={(_,{OkBtn, CancelBtn}) => (
          <>
            <Flex gap="middle" justify="space-between" align="center">
              <Form.Item 
              // name={"is_save_inbox"} 
              // valuePropName="checked"
              initialValue={isSaveInbox}
              getValueFromEvent={(event) => {
                return event.target.checked
              }}
              >
                <Checkbox
                onChange={(e) => {
                  console.log(e.target.checked)
                  // let ischeck = e.target.checked;
                  form.setFieldValue("is_save_inbox",e.target.checked);
                  setIsSaveInbox(e.target.checked)
                }}
                // value={isSaveInbox}
                checked={isSaveInbox}
                >Simpan Pesan Masuk</Checkbox>
              </Form.Item>
              <Space>
                <CancelBtn/>
                <OkBtn/>
              </Space>
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
          <Form.Item 
          name="is_save_inbox" 
          initialValue={isSaveInbox}
          hidden>
              <Checkbox
              checked={isSaveInbox}
              />
          </Form.Item>
          <Form.Item
          name="buttons"
          hidden
          >
            <Input/>
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
          <Form.Item
          name={"type_keyword"}
          label={t("type_keyword")}
          valuePropName={"keywordType"}
          getValueFromEvent={(event) => {
            return event.target.value
          }}
          >
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
          </Form.Item>
         
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

          <Form.Item
          label={t("type_message")}
          name={"type_message"}
          >
            <Select
              placeholder="Select One"
              style={{
                width: '100%',
              }}
              onChange={(value:string) => {
                setTypeMessage(value);
              }}
              options={[
                {
                  value: 'text',
                  label: 'Text Message',
                },
                {
                  value: 'image',
                  label: 'Image Message',
                },
                {
                  value: 'button',
                  label: 'Button Message'
                }
              ]}
            />
          </Form.Item>

          {(typeMessage == 'text') && 
            (
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
            )
          }
          {(typeMessage == 'image') &&
            (
              <>
                <Button
                style={{display:'block', margin: '1.2em 0'}}
                onClick={() => document.getElementById("upload-button")?.click()}
                >
                  <UploadOutlined />
                  Select File
                </Button>

                {fileList && fileList.map((item,i) => (
                  <Row key={i}>
                    <Col span={24}>
                        <Flex justify="space-between" align="center" style={{marginTop: '8px'}}>
                            <PaperClipOutlined/>
                            <span style={{
                              whiteSpace: 'nowrap', 
                              overflow: 'hidden', 
                              padding: '0 8px', 
                              // lineHeight: '1.5',
                              flex: 'auto'
                              }}>{item}</span>
                            <span>
                              <Button
                              type="text"
                              value={String(item)}
                              onClick={(e) => removeFile(e)}
                              >
                                <DeleteOutlined/>
                              </Button>
                            </span>
                        </Flex>
                    </Col>
                  </Row>
                ))}
                <input
                type="file"
                id="upload-button"
                style={{display:"none"}}
                onChange={handleUpload}
                />

              {/* <Form.Item
              label="Image"
              name={"image_reply"}
              valuePropName="fileList"
              getValueFromEvent={(event) => {
                return event.fileList
              }}
              rules={[
                {
                  required: true,
                  message: "please upload image"
                },
                {
                  validator(_, fileList) {
                    return new Promise((resolve,reject) => {
                      console.log(fileList);

                      if(!allow_mime.includes(fileList[0].type)) {
                        reject('type file not allowed, upload the appropriate image file');
                      }
                      else if(fileList && fileList[0].size > 2000000) {
                        reject("file size exceeded");
                      } else {
                        resolve('success');
                      }
                    })
                  }
                }
              ]}
              style={{marginTop:'20px',marginBottom:'0'}}
              >
                <Upload
                maxCount={1}
                beforeUpload={(file) => {
                  return new Promise((resolve,reject) => {
                    if(!allow_mime.includes(file.type)) {
                      reject('type file not allowed, upload the appropriate image file');
                    } else if(file.size > 2000000) {
                      reject("file size exceeded");
                    } else {
                      setFileList([file])
                      resolve('success');
                    }
                  })
                }}
                // customRequest={(info) => {
                //   console.log(info.file);
                //   setFileList([...fileList, info])
                // }}
                showUploadList={false}
                >
                  <Button
                  style={{display:"block"}}
                  >Select file
                  <UploadOutlined />
                  </Button>
                </Upload>
              </Form.Item>
              {fileList?.map((item_file,index) => {
                return (
                    <Row key={index}>
                    <Col span={24}>
                        <Flex justify="space-between" align="center" style={{marginTop: '8px'}}>
                            <PaperClipOutlined/>
                            <span style={{
                              whiteSpace: 'nowrap', 
                              overflow: 'hidden', 
                              padding: '0 8px', 
                              // lineHeight: '1.5',
                              flex: 'auto'
                              }}>{item_file.name}</span>
                            <span>
                              <Button
                              type="text"
                              value={item_file}
                              onClick={(e) => removeFile(e)}
                              >
                                <DeleteOutlined/>
                              </Button>
                            </span>
                        </Flex>
                    </Col>
                  </Row>
                )
              })} */}

                <Form.Item
                name="caption"
                label={"Caption"}
                style={{marginTop:'20px',marginBottom:'0'}}
                >
                  <Input
                  placeholder="Caption"
                  />
                </Form.Item>
              </>
            )
          }
          {(typeMessage == 'button') && 
            (
              <>
              <Form.Item
              name={"reply"}
              label={t("text_message")}
              rules={ [
                {
                  required: true,
                  message: t("validation.required", {
                    field: t("text_messagge"),
                  }).toString()
                }
              ]}
              >
                <TextArea rows={3}/>
              </Form.Item>

              <Form.Item
              name={"footer_message"}
              label={t("footer_message")}
              >
                <Input/>
              </Form.Item>

              <Flex gap="small" wrap="wrap" style={{marginBottom: '1.5em'}}>
                <Button type="primary" onClick={addButton}>Add Button</Button>
                <Button type="primary" danger onClick={removeButton}>Reduce Button</Button>
              </Flex>
              
              {buttonList!.length && buttonList!.map((buttonEl,index) => {
                return (
                  <Form.Item
                  key={index}
                  label={"Button " + (index+1)}
                  name={buttonEl.name}
                  // name="buttons"
                  >
                    <Input value={buttonList![index].value} onChange={e => handleChange(e,index)}/>
                  </Form.Item>
                )
              })}
              </>
            )
          }
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
