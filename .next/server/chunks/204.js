"use strict";
exports.id = 204;
exports.ids = [204];
exports.modules = {

/***/ 4445:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "_": () => (/* binding */ prisma)
/* harmony export */ });
/* harmony import */ var _prisma_client__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(3524);
/* harmony import */ var _prisma_client__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_prisma_client__WEBPACK_IMPORTED_MODULE_0__);

const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new _prisma_client__WEBPACK_IMPORTED_MODULE_0__.PrismaClient({
});
if (false) {}


/***/ }),

/***/ 4204:
/***/ ((module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.a(module, async (__webpack_handle_async_dependencies__, __webpack_async_result__) => { try {
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "m": () => (/* reexport safe */ _signup__WEBPACK_IMPORTED_MODULE_0__.m),
/* harmony export */   "o": () => (/* reexport safe */ _signin__WEBPACK_IMPORTED_MODULE_1__.o)
/* harmony export */ });
/* harmony import */ var _signup__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(1347);
/* harmony import */ var _signin__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(8766);
var __webpack_async_dependencies__ = __webpack_handle_async_dependencies__([_signup__WEBPACK_IMPORTED_MODULE_0__, _signin__WEBPACK_IMPORTED_MODULE_1__]);
([_signup__WEBPACK_IMPORTED_MODULE_0__, _signin__WEBPACK_IMPORTED_MODULE_1__] = __webpack_async_dependencies__.then ? (await __webpack_async_dependencies__)() : __webpack_async_dependencies__);



__webpack_async_result__();
} catch(e) { __webpack_async_result__(e); } });

/***/ }),

/***/ 8766:
/***/ ((module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.a(module, async (__webpack_handle_async_dependencies__, __webpack_async_result__) => { try {
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "o": () => (/* binding */ SigninValidation)
/* harmony export */ });
/* harmony import */ var next_i18next__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(1377);
/* harmony import */ var next_i18next__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(next_i18next__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var zod__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(9926);
var __webpack_async_dependencies__ = __webpack_handle_async_dependencies__([zod__WEBPACK_IMPORTED_MODULE_1__]);
zod__WEBPACK_IMPORTED_MODULE_1__ = (__webpack_async_dependencies__.then ? (await __webpack_async_dependencies__)() : __webpack_async_dependencies__)[0];


const SigninValidation = (data, res)=>{
    var passwordField = next_i18next__WEBPACK_IMPORTED_MODULE_0__.i18n?.t("password", {
        field: "password",
        ns: "common"
    }).toString();
    const validation = zod__WEBPACK_IMPORTED_MODULE_1__.z.object({
        email: zod__WEBPACK_IMPORTED_MODULE_1__.z.string().email(next_i18next__WEBPACK_IMPORTED_MODULE_0__.i18n?.t("email", {
            field: "Email",
            ns: "form"
        }).toString()),
        password: zod__WEBPACK_IMPORTED_MODULE_1__.z.string({
            required_error: next_i18next__WEBPACK_IMPORTED_MODULE_0__.i18n?.t("required", {
                field: passwordField,
                ns: "form"
            }).toString()
        })
    });
    try {
        validation.parse(data);
    } catch (e) {
        if (e instanceof zod__WEBPACK_IMPORTED_MODULE_1__.ZodError) {
            return res.status(422).json(e);
        }
    }
};

__webpack_async_result__();
} catch(e) { __webpack_async_result__(e); } });

/***/ }),

/***/ 1347:
/***/ ((module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.a(module, async (__webpack_handle_async_dependencies__, __webpack_async_result__) => { try {
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "m": () => (/* binding */ signupValidation)
/* harmony export */ });
/* harmony import */ var _lib_prisma__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(4445);
/* harmony import */ var next_i18next__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(1377);
/* harmony import */ var next_i18next__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(next_i18next__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var zod__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(9926);
var __webpack_async_dependencies__ = __webpack_handle_async_dependencies__([zod__WEBPACK_IMPORTED_MODULE_2__]);
zod__WEBPACK_IMPORTED_MODULE_2__ = (__webpack_async_dependencies__.then ? (await __webpack_async_dependencies__)() : __webpack_async_dependencies__)[0];



const signupValidation = async (data, res)=>{
    const validation = zod__WEBPACK_IMPORTED_MODULE_2__.z.object({
        name: zod__WEBPACK_IMPORTED_MODULE_2__.z.string(),
        email: zod__WEBPACK_IMPORTED_MODULE_2__.z.string().email(next_i18next__WEBPACK_IMPORTED_MODULE_1__.i18n?.t("email", {
            field: "Email",
            ns: "form"
        }).toString()),
        password: zod__WEBPACK_IMPORTED_MODULE_2__.z.string().min(6, next_i18next__WEBPACK_IMPORTED_MODULE_1__.i18n?.t("min", {
            field: "password",
            value: 6,
            ns: "form"
        }).toString()),
        passwordConfirm: zod__WEBPACK_IMPORTED_MODULE_2__.z.string()
    }).required({
        name: true,
        email: true,
        password: true,
        passwordConfirm: true
    }).refine(async (data)=>{
        return await _lib_prisma__WEBPACK_IMPORTED_MODULE_0__/* .prisma.user.findUnique */ ._.user.findUnique({
            where: {
                email: data.email
            }
        }) ? false : true;
    }, {
        message: next_i18next__WEBPACK_IMPORTED_MODULE_1__.i18n?.t("emailExist", {
            ns: "form"
        }).toString(),
        path: [
            "email"
        ]
    }).refine((data)=>data.password === data.passwordConfirm, {
        message: next_i18next__WEBPACK_IMPORTED_MODULE_1__.i18n?.t("passwordConfirm", {
            ns: "form"
        }).toString(),
        path: [
            "passwordConfirm"
        ]
    });
    try {
        await validation.parseAsync(data);
    } catch (e) {
        if (e instanceof zod__WEBPACK_IMPORTED_MODULE_2__.ZodError) {
            return res.status(422).json(e);
        }
    }
};

__webpack_async_result__();
} catch(e) { __webpack_async_result__(e); } });

/***/ })

};
;