"use strict";
exports.id = 195;
exports.ids = [195];
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

/***/ 7195:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Z": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* unused harmony export apiAuthMiddleware */
/* harmony import */ var _lib_prisma__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(4445);

// 7f76a027-bfa2-4921-82d0-1229a8532c65
const apiAuthMiddleware = (handler)=>async (req, res)=>{
        const { authorization  } = req.headers;
        if (!authorization || !authorization.startsWith("Bearer ")) {
            return res.status(401).json({
                message: "Unauthorized"
            });
        }
        const token = authorization.split(" ")[1];
        try {
            const user = await _lib_prisma__WEBPACK_IMPORTED_MODULE_0__/* .prisma.user.findFirst */ ._.user.findFirst({
                where: {
                    token
                }
            });
            if (!user) {
                return res.status(401).json({
                    message: "Unauthorized"
                });
            }
            req.user = user;
            return handler(req, res);
        } catch (error) {
            console.log(error);
            return res.status(401).json({
                message: "Unauthorized"
            });
        }
    };
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (apiAuthMiddleware);


/***/ })

};
;