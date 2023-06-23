"use strict";
(() => {
var exports = {};
exports.id = 510;
exports.ids = [510];
exports.modules = {

/***/ 3524:
/***/ ((module) => {

module.exports = require("@prisma/client");

/***/ }),

/***/ 2630:
/***/ ((module) => {

module.exports = import("libphonenumber-js");;

/***/ }),

/***/ 9926:
/***/ ((module) => {

module.exports = import("zod");;

/***/ }),

/***/ 8753:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {


// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  "Z": () => (/* binding */ lib_makeWASocket)
});

// UNUSED EXPORTS: waSocketLogOption

;// CONCATENATED MODULE: external "@whiskeysockets/baileys"
const baileys_namespaceObject = require("@whiskeysockets/baileys");
var baileys_default = /*#__PURE__*/__webpack_require__.n(baileys_namespaceObject);
;// CONCATENATED MODULE: external "pino"
const external_pino_namespaceObject = require("pino");
// EXTERNAL MODULE: ./src/lib/prisma.ts
var prisma = __webpack_require__(4445);
;// CONCATENATED MODULE: ./src/lib/makeWASocket.ts



const waSocketLogOption = (0,external_pino_namespaceObject.pino)({
    transport: {
        targets: [
            // {
            //   level: "debug",
            //   target: "pino-pretty",
            //   options: {
            //     colorize: true,
            //   },
            // },
            {
                level: "error",
                target: "pino-roll",
                options: {
                    file: "./whatsapp-logs/whatsapp.log",
                    frequency: "daily",
                    colorize: true,
                    mkdir: true
                }
            }
        ]
    }
});
const makeWASocket = async (userId, phoneId)=>{
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { state , saveCreds  } = await (0,baileys_namespaceObject.useMultiFileAuthState)(`./whatsapp-auth/${userId}-${phoneId}`);
    const _waSocket = await baileys_default()({
        printQRInTerminal: false,
        auth: state,
        syncFullHistory: false,
        logger: waSocketLogOption
    });
    if (_waSocket.user) {
        await prisma/* prisma.phone.update */._.phone.update({
            where: {
                id: phoneId
            },
            data: {
                number: _waSocket.user.id.split(":")[0],
                account_name: _waSocket.user.name
            }
        });
    }
    _waSocket.ev.on("creds.update", (authState)=>{
        saveCreds();
    });
    return _waSocket;
};
/* harmony default export */ const lib_makeWASocket = (makeWASocket);


/***/ }),

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

/***/ 421:
/***/ ((module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.a(module, async (__webpack_handle_async_dependencies__, __webpack_async_result__) => { try {
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _lib_makeWASocket__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(8753);
/* harmony import */ var _lib_prisma__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(4445);
/* harmony import */ var _validations_sendMessage__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(1503);
/* harmony import */ var libphonenumber_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(2630);
var __webpack_async_dependencies__ = __webpack_handle_async_dependencies__([_validations_sendMessage__WEBPACK_IMPORTED_MODULE_2__, libphonenumber_js__WEBPACK_IMPORTED_MODULE_3__]);
([_validations_sendMessage__WEBPACK_IMPORTED_MODULE_2__, libphonenumber_js__WEBPACK_IMPORTED_MODULE_3__] = __webpack_async_dependencies__.then ? (await __webpack_async_dependencies__)() : __webpack_async_dependencies__);




const handler = async (req, res)=>{
    if (req.method !== "POST") {
        res.status(405).send("");
        return;
    }
    const validation = await (0,_validations_sendMessage__WEBPACK_IMPORTED_MODULE_2__/* .SendMessageValidation */ .z)(req.body);
    if (!validation?.result) {
        res.status(200).json(validation?.error);
        return;
    }
    const { number , message , api_key , phoneCountry  } = req.body;
    const tos = number.split(",");
    console.log("tos", tos);
    const phone = await _lib_prisma__WEBPACK_IMPORTED_MODULE_1__/* .prisma.phone.findUnique */ ._.phone.findUnique({
        where: {
            token: api_key
        }
    });
    if (!phone) {
        res.status(200).json({
            result: false,
            message: "Token tidak valid"
        });
        return;
    }
    const socket = await (0,_lib_makeWASocket__WEBPACK_IMPORTED_MODULE_0__/* ["default"] */ .Z)(phone.userId, phone.id);
    socket.ev.on("connection.update", async (update)=>{
        if (update.qr) {
            socket.ev.flush(true);
            res.status(200).json({
                result: false,
                error: "Please scan qr code from phone dashboard page"
            });
            return;
        }
        if (update.connection === "close") {
            socket.ev.flush(true);
            res.status(200).json({
                result: false,
                error: (update?.lastDisconnect?.error)?.output
            });
            return;
        }
        if (update.connection === "open") {
            try {
                let send = [];
                for (const _to of tos){
                    const parsedTo = (0,libphonenumber_js__WEBPACK_IMPORTED_MODULE_3__.parsePhoneNumber)(_to, phoneCountry || "ID");
                    const sendResult = await socket.sendMessage(`${parsedTo.countryCallingCode}${parsedTo.nationalNumber}@s.whatsapp.net`, {
                        text: message
                    });
                    send.push(sendResult);
                }
                socket.ev.flush(true);
                res.status(200).json({
                    result: true,
                    data: send
                });
                return;
            } catch (e) {
                socket.ev.flush(true);
                res.status(200).json({
                    result: false,
                    error: "Something wrong with server"
                });
                return;
            }
        }
    });
};
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (handler);

__webpack_async_result__();
} catch(e) { __webpack_async_result__(e); } });

/***/ }),

/***/ 1503:
/***/ ((module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.a(module, async (__webpack_handle_async_dependencies__, __webpack_async_result__) => { try {
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "z": () => (/* binding */ SendMessageValidation)
/* harmony export */ });
/* harmony import */ var libphonenumber_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(2630);
/* harmony import */ var zod__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(9926);
var __webpack_async_dependencies__ = __webpack_handle_async_dependencies__([libphonenumber_js__WEBPACK_IMPORTED_MODULE_0__, zod__WEBPACK_IMPORTED_MODULE_1__]);
([libphonenumber_js__WEBPACK_IMPORTED_MODULE_0__, zod__WEBPACK_IMPORTED_MODULE_1__] = __webpack_async_dependencies__.then ? (await __webpack_async_dependencies__)() : __webpack_async_dependencies__);


const SendMessageValidation = async (data)=>{
    const validation = zod__WEBPACK_IMPORTED_MODULE_1__.z.object({
        number: zod__WEBPACK_IMPORTED_MODULE_1__.z.string({
            required_error: "Field to is required"
        }),
        phoneCode: zod__WEBPACK_IMPORTED_MODULE_1__.z.string().optional(),
        message: zod__WEBPACK_IMPORTED_MODULE_1__.z.string({
            required_error: "Field text is required"
        })
    }).required({
        message: true,
        number: true
    }).refine((data)=>{
        const tos = data.number.split(",");
        let result = true;
        tos.forEach((x)=>{
            try {
                let _res = (0,libphonenumber_js__WEBPACK_IMPORTED_MODULE_0__.parsePhoneNumber)(x, data.phoneCode ? data.phoneCode : "ID").isValid();
                if (!_res) {
                    result = false;
                    return false;
                }
            } catch (e) {
                result = false;
                return false;
            }
        });
        return result;
    }, {
        message: "Number wrong formated",
        path: [
            "number"
        ]
    });
    try {
        const res = validation.parse(data);
        return {
            result: true,
            error: null
        };
    } catch (e) {
        if (e instanceof zod__WEBPACK_IMPORTED_MODULE_1__.ZodError) {
            return {
                result: false,
                error: e
            };
        } else {
            return {
                result: false,
                error: "Something happen to server"
            };
        }
    }
};

__webpack_async_result__();
} catch(e) { __webpack_async_result__(e); } });

/***/ })

};
;

// load runtime
var __webpack_require__ = require("../../webpack-api-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = (__webpack_exec__(421));
module.exports = __webpack_exports__;

})();