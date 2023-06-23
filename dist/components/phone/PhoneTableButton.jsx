"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const icons_1 = require("@ant-design/icons");
const antd_1 = require("antd");
const next_i18next_1 = require("next-i18next");
function PhoneTableButton({ phone, onEditClick, onGetQrCodeClick, onDeleteClick, }) {
    const { t } = (0, next_i18next_1.useTranslation)("common");
    const items = [
        {
            label: t("edit"),
            key: "1",
            icon: <icons_1.EditOutlined />,
            onClick: (e) => onEditClick && onEditClick(phone, e),
        },
        {
            label: t("scan_qrcode"),
            key: "2",
            icon: <icons_1.QrcodeOutlined />,
            onClick: (e) => onGetQrCodeClick && onGetQrCodeClick(phone, e),
        },
        {
            label: t("delete"),
            key: "3",
            icon: <icons_1.DeleteOutlined />,
            onClick: (e) => onDeleteClick && onDeleteClick(phone, e),
        },
    ];
    const menuProps = {
        items,
    };
    return (<antd_1.Dropdown menu={menuProps} trigger={["click"]}>
      <antd_1.Button>
        <antd_1.Space>
          <icons_1.SettingOutlined />
          Action
          <icons_1.DownOutlined />
        </antd_1.Space>
      </antd_1.Button>
    </antd_1.Dropdown>);
}
exports.default = PhoneTableButton;
