"use strict";
(() => {
var exports = {};
exports.id = 176;
exports.ids = [176];
exports.modules = {

/***/ 3416:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  "default": () => (/* binding */ signin),
  "getServerSideProps": () => (/* binding */ getServerSideProps)
});

// EXTERNAL MODULE: external "react/jsx-runtime"
var jsx_runtime_ = __webpack_require__(997);
// EXTERNAL MODULE: external "react"
var external_react_ = __webpack_require__(6689);
// EXTERNAL MODULE: external "antd"
var external_antd_ = __webpack_require__(5725);
// EXTERNAL MODULE: external "next-i18next"
var external_next_i18next_ = __webpack_require__(1377);
;// CONCATENATED MODULE: ./src/components/auth/SigninForm.tsx



const SigninForm = ({ onSubmit , loading , form  })=>{
    const { t  } = (0,external_next_i18next_.useTranslation)([
        "translation",
        "common"
    ]);
    const _onSubmit = (data)=>{
        onSubmit(data);
    };
    return /*#__PURE__*/ (0,jsx_runtime_.jsxs)(external_antd_.Form, {
        form: form,
        disabled: loading,
        labelCol: {
            span: 9
        },
        wrapperCol: {
            span: 17
        },
        onFinish: _onSubmit,
        children: [
            /*#__PURE__*/ jsx_runtime_.jsx(external_antd_.Form.Item, {
                label: "Email",
                name: "email",
                rules: [
                    {
                        required: true,
                        message: "Please enter your email!"
                    },
                    {
                        required: true,
                        type: "email",
                        message: "Please enter valid E-mail!"
                    }
                ],
                children: /*#__PURE__*/ jsx_runtime_.jsx(external_antd_.Input, {})
            }),
            /*#__PURE__*/ jsx_runtime_.jsx(external_antd_.Form.Item, {
                label: t("password", {
                    ns: "common"
                }),
                name: "password",
                rules: [
                    {
                        required: true,
                        message: t("required", {
                            field: t("password", {
                                ns: "common"
                            }),
                            ns: "form"
                        }).toString()
                    },
                    {
                        min: 6,
                        message: t("min", {
                            field: t("password", {
                                ns: "common"
                            }),
                            value: 6,
                            ns: "form"
                        }).toString()
                    }
                ],
                children: /*#__PURE__*/ jsx_runtime_.jsx(external_antd_.Input.Password, {})
            }),
            /*#__PURE__*/ jsx_runtime_.jsx(external_antd_.Form.Item, {
                wrapperCol: {
                    xs: {
                        span: 24
                    },
                    sm: {
                        offset: 9,
                        span: 17
                    }
                },
                children: /*#__PURE__*/ jsx_runtime_.jsx(external_antd_.Button, {
                    loading: loading,
                    block: true,
                    type: "primary",
                    htmlType: "submit",
                    children: t("signin", {
                        ns: "common"
                    })
                })
            })
        ]
    });
};
/* harmony default export */ const auth_SigninForm = (SigninForm);

// EXTERNAL MODULE: ./src/components/GuestLayout.tsx
var GuestLayout = __webpack_require__(1399);
// EXTERNAL MODULE: external "next-i18next/serverSideTranslations"
var serverSideTranslations_ = __webpack_require__(5460);
// EXTERNAL MODULE: ./node_modules/next/link.js
var next_link = __webpack_require__(1664);
var link_default = /*#__PURE__*/__webpack_require__.n(next_link);
// EXTERNAL MODULE: external "next-auth/react"
var react_ = __webpack_require__(1649);
// EXTERNAL MODULE: external "next/router"
var router_ = __webpack_require__(1853);
var router_default = /*#__PURE__*/__webpack_require__.n(router_);
;// CONCATENATED MODULE: ./src/pages/signin.tsx










const Signin = ({ csrfToken  })=>{
    const [state, setState] = (0,external_react_.useState)({
        alert: "",
        message: "",
        loading: false
    });
    const [form] = external_antd_.Form.useForm();
    const { t  } = (0,external_next_i18next_.useTranslation)("common");
    const router = (0,router_.useRouter)();
    const onSubmit = async (data)=>{
        setState({
            ...state,
            alert: undefined,
            message: "",
            loading: true
        });
        const res = await (0,react_.signIn)("credentials", {
            redirect: false,
            email: data.email,
            password: data.password
        });
        setState({
            ...state,
            loading: false,
            alert: res?.ok ? "success" : "error",
            message: !res?.ok ? res?.error?.toString() : t("login_success").toString()
        });
        if (res?.ok) {
            form.resetFields();
            router_default().replace("/dashboard");
        }
    };
    return /*#__PURE__*/ jsx_runtime_.jsx(jsx_runtime_.Fragment, {
        children: /*#__PURE__*/ (0,jsx_runtime_.jsxs)(external_antd_.Space, {
            direction: "vertical",
            children: [
                state.alert && /*#__PURE__*/ jsx_runtime_.jsx(external_antd_.Alert, {
                    message: state.message,
                    type: state.alert
                }),
                /*#__PURE__*/ jsx_runtime_.jsx(auth_SigninForm, {
                    loading: state.loading,
                    onSubmit: onSubmit,
                    form: form
                }),
                /*#__PURE__*/ (0,jsx_runtime_.jsxs)(external_antd_.Space, {
                    direction: "horizontal",
                    children: [
                        /*#__PURE__*/ jsx_runtime_.jsx(external_antd_.Typography.Text, {
                            children: t("dont_have_account").toString()
                        }),
                        /*#__PURE__*/ jsx_runtime_.jsx((link_default()), {
                            href: "/signup",
                            children: t("signup").toString()
                        })
                    ]
                })
            ]
        })
    });
};
Signin.getLayout = function getLayout(page) {
    const title = ()=>external_next_i18next_.i18n?.t("Signin") || "";
    return /*#__PURE__*/ jsx_runtime_.jsx(GuestLayout/* default */.Z, {
        title: title().toUpperCase(),
        children: page
    });
};
async function getServerSideProps(context) {
    const csrfToken = await (0,react_.getCsrfToken)(context);
    return {
        props: {
            ...await (0,serverSideTranslations_.serverSideTranslations)(context?.locale, [
                "common"
            ]),
            csrfToken: csrfToken || null
        }
    };
}
/* harmony default export */ const signin = (Signin);


/***/ }),

/***/ 5725:
/***/ ((module) => {

module.exports = require("antd");

/***/ }),

/***/ 1649:
/***/ ((module) => {

module.exports = require("next-auth/react");

/***/ }),

/***/ 1377:
/***/ ((module) => {

module.exports = require("next-i18next");

/***/ }),

/***/ 5460:
/***/ ((module) => {

module.exports = require("next-i18next/serverSideTranslations");

/***/ }),

/***/ 3918:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/amp-context.js");

/***/ }),

/***/ 5732:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/amp-mode.js");

/***/ }),

/***/ 3280:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/app-router-context.js");

/***/ }),

/***/ 2796:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/head-manager-context.js");

/***/ }),

/***/ 3539:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/i18n/detect-domain-locale.js");

/***/ }),

/***/ 4014:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/i18n/normalize-locale-path.js");

/***/ }),

/***/ 4486:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/image-blur-svg.js");

/***/ }),

/***/ 744:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/image-config-context.js");

/***/ }),

/***/ 5843:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/image-config.js");

/***/ }),

/***/ 9552:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/image-loader");

/***/ }),

/***/ 4964:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/router-context.js");

/***/ }),

/***/ 3431:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/router/utils/add-locale.js");

/***/ }),

/***/ 1751:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/router/utils/add-path-prefix.js");

/***/ }),

/***/ 3938:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/router/utils/format-url.js");

/***/ }),

/***/ 1109:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/router/utils/is-local-url.js");

/***/ }),

/***/ 8854:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/router/utils/parse-path.js");

/***/ }),

/***/ 3297:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/router/utils/remove-trailing-slash.js");

/***/ }),

/***/ 7782:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/router/utils/resolve-href.js");

/***/ }),

/***/ 2470:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/side-effect.js");

/***/ }),

/***/ 9232:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/utils.js");

/***/ }),

/***/ 618:
/***/ ((module) => {

module.exports = require("next/dist/shared/lib/utils/warn-once.js");

/***/ }),

/***/ 1853:
/***/ ((module) => {

module.exports = require("next/router");

/***/ }),

/***/ 6689:
/***/ ((module) => {

module.exports = require("react");

/***/ }),

/***/ 997:
/***/ ((module) => {

module.exports = require("react/jsx-runtime");

/***/ })

};
;

// load runtime
var __webpack_require__ = require("../webpack-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = __webpack_require__.X(0, [636,675,664,399], () => (__webpack_exec__(3416)));
module.exports = __webpack_exports__;

})();