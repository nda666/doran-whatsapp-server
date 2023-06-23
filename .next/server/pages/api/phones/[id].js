"use strict";
(() => {
var exports = {};
exports.id = 257;
exports.ids = [257];
exports.modules = {

/***/ 3524:
/***/ ((module) => {

module.exports = require("@prisma/client");

/***/ }),

/***/ 614:
/***/ ((module) => {

module.exports = require("next-auth/jwt");

/***/ }),

/***/ 965:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _lib_prisma__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(4445);
/* harmony import */ var _middleware_apiAuthMiddleware__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(7195);
/* harmony import */ var next_auth_jwt__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(614);
/* harmony import */ var next_auth_jwt__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(next_auth_jwt__WEBPACK_IMPORTED_MODULE_2__);



const handler = async (req, res)=>{
    const token = await (0,next_auth_jwt__WEBPACK_IMPORTED_MODULE_2__.getToken)({
        req
    });
    const phoneId = req.query.id;
    switch(req.method){
        case "DELETE":
            deletePhone(token?.id, phoneId?.toString(), res);
            break;
        default:
            res.status(405).end();
    }
};
async function deletePhone(userId, phoneId, res) {
    const result = (await _lib_prisma__WEBPACK_IMPORTED_MODULE_0__/* .prisma.phone.deleteMany */ ._.phone.deleteMany({
        where: {
            id: phoneId,
            userId
        }
    })).count >= 0;
    res.status(200).json({
        result
    });
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = ((0,_middleware_apiAuthMiddleware__WEBPACK_IMPORTED_MODULE_1__/* ["default"] */ .Z)(handler));


/***/ })

};
;

// load runtime
var __webpack_require__ = require("../../../webpack-api-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = __webpack_require__.X(0, [195], () => (__webpack_exec__(965)));
module.exports = __webpack_exports__;

})();