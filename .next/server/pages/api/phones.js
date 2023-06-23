"use strict";
(() => {
var exports = {};
exports.id = 32;
exports.ids = [32];
exports.modules = {

/***/ 3524:
/***/ ((module) => {

module.exports = require("@prisma/client");

/***/ }),

/***/ 614:
/***/ ((module) => {

module.exports = require("next-auth/jwt");

/***/ }),

/***/ 6578:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _lib_prisma__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(4445);
/* harmony import */ var _middleware_apiAuthMiddleware__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(7195);
/* harmony import */ var next_auth_jwt__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(614);
/* harmony import */ var next_auth_jwt__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(next_auth_jwt__WEBPACK_IMPORTED_MODULE_2__);



async function handler(req, res) {
    switch(req.method){
        case "GET":
            return GET(req, res);
        case "POST":
            return POST(req, res);
        default:
            res.status(405).end();
    }
}
const GET = async (req, res)=>{
    const token = await (0,next_auth_jwt__WEBPACK_IMPORTED_MODULE_2__.getToken)({
        req
    });
    try {
        const phones = await _lib_prisma__WEBPACK_IMPORTED_MODULE_0__/* .prisma.phone.findMany */ ._.phone.findMany({
            where: {
                userId: req?.user?.id
            },
            orderBy: {
                createdAt: "desc"
            }
        });
        res.status(200).json(phones);
    } catch (err) {
        res.status(500).end();
    }
};
const POST = async (req, res)=>{
    let phones = undefined;
    if (req.body.id) {
        phones = await _lib_prisma__WEBPACK_IMPORTED_MODULE_0__/* .prisma.phone.update */ ._.phone.update({
            where: {
                id: req.body.id
            },
            data: {
                name: req.body.name
            }
        });
    } else {
        phones = await _lib_prisma__WEBPACK_IMPORTED_MODULE_0__/* .prisma.phone.create */ ._.phone.create({
            data: {
                userId: req.user?.id,
                name: req.body.name
            }
        });
    }
    return res.status(200).json(phones);
};
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = ((0,_middleware_apiAuthMiddleware__WEBPACK_IMPORTED_MODULE_1__/* ["default"] */ .Z)(handler));


/***/ })

};
;

// load runtime
var __webpack_require__ = require("../../webpack-api-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = __webpack_require__.X(0, [195], () => (__webpack_exec__(6578)));
module.exports = __webpack_exports__;

})();