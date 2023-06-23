"use strict";
(() => {
var exports = {};
exports.id = 793;
exports.ids = [793];
exports.modules = {

/***/ 3524:
/***/ ((module) => {

module.exports = require("@prisma/client");

/***/ }),

/***/ 7096:
/***/ ((module) => {

module.exports = require("bcrypt");

/***/ }),

/***/ 1377:
/***/ ((module) => {

module.exports = require("next-i18next");

/***/ }),

/***/ 9926:
/***/ ((module) => {

module.exports = import("zod");;

/***/ }),

/***/ 6767:
/***/ ((module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.a(module, async (__webpack_handle_async_dependencies__, __webpack_async_result__) => { try {
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ handler)
/* harmony export */ });
/* harmony import */ var _lib_prisma__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(4445);
/* harmony import */ var bcrypt__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(7096);
/* harmony import */ var bcrypt__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(bcrypt__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _validations__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(4204);
/* harmony import */ var next_i18next__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(1377);
/* harmony import */ var next_i18next__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(next_i18next__WEBPACK_IMPORTED_MODULE_3__);
var __webpack_async_dependencies__ = __webpack_handle_async_dependencies__([_validations__WEBPACK_IMPORTED_MODULE_2__]);
_validations__WEBPACK_IMPORTED_MODULE_2__ = (__webpack_async_dependencies__.then ? (await __webpack_async_dependencies__)() : __webpack_async_dependencies__)[0];




async function handler(req, res) {
    if (req.method !== "POST") {
        res.status(405).json({
            error: "Method not allowed"
        });
    }
    const { email , password  } = req.body;
    (0,_validations__WEBPACK_IMPORTED_MODULE_2__/* .SigninValidation */ .o)({
        email,
        password
    }, res);
    const user = await _lib_prisma__WEBPACK_IMPORTED_MODULE_0__/* .prisma.user.findFirst */ ._.user.findFirst({
        where: {
            email: email.trim()
        }
    });
    if (!user) {
        return res.status(401).json({
            message: next_i18next__WEBPACK_IMPORTED_MODULE_3__.i18n?.t("invalid_login").toString()
        });
    }
    if (!bcrypt__WEBPACK_IMPORTED_MODULE_1___default().compareSync(password, user.password)) {
        return res.status(401).json({
            message: next_i18next__WEBPACK_IMPORTED_MODULE_3__.i18n?.t("invalid_login").toString()
        });
    }
    return res.status(200).json({
        token: user.token,
        email: user.email,
        id: user.id
    });
}

__webpack_async_result__();
} catch(e) { __webpack_async_result__(e); } });

/***/ })

};
;

// load runtime
var __webpack_require__ = require("../../webpack-api-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = __webpack_require__.X(0, [204], () => (__webpack_exec__(6767)));
module.exports = __webpack_exports__;

})();