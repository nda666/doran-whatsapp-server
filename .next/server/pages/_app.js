(() => {
var exports = {};
exports.id = 888;
exports.ids = [888];
exports.modules = {

/***/ 9997:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  "default": () => (/* binding */ _app)
});

// EXTERNAL MODULE: external "react/jsx-runtime"
var jsx_runtime_ = __webpack_require__(997);
// EXTERNAL MODULE: ./src/styles/globals.css
var globals = __webpack_require__(108);
// EXTERNAL MODULE: external "antd"
var external_antd_ = __webpack_require__(5725);
// EXTERNAL MODULE: external "next-auth/react"
var react_ = __webpack_require__(1649);
// EXTERNAL MODULE: external "next-i18next"
var external_next_i18next_ = __webpack_require__(1377);
;// CONCATENATED MODULE: external "nextjs-progressbar"
const external_nextjs_progressbar_namespaceObject = require("nextjs-progressbar");
var external_nextjs_progressbar_default = /*#__PURE__*/__webpack_require__.n(external_nextjs_progressbar_namespaceObject);
// EXTERNAL MODULE: external "react"
var external_react_ = __webpack_require__(6689);
;// CONCATENATED MODULE: ./src/pages/_app.tsx







const App = ({ Component , pageProps: { session , ...pageProps }  })=>{
    const getLayout = Component.getLayout || ((page)=>page);
    const [lang, setLang] = (0,external_react_.useState)(undefined);
    (0,external_react_.useEffect)(()=>{
        external_next_i18next_.i18n?.language?.toString() == "id" ? Promise.resolve(/* import() */).then(__webpack_require__.t.bind(__webpack_require__, 5333, 23)).then((m)=>setLang(m.default)) : Promise.resolve(/* import() */).then(__webpack_require__.t.bind(__webpack_require__, 9656, 23)).then((m)=>setLang(m.default));
    }, [
        external_next_i18next_.i18n?.language
    ]);
    return /*#__PURE__*/ (0,jsx_runtime_.jsxs)(react_.SessionProvider, {
        session: session,
        children: [
            /*#__PURE__*/ jsx_runtime_.jsx((external_nextjs_progressbar_default()), {}),
            /*#__PURE__*/ jsx_runtime_.jsx(external_antd_.ConfigProvider, {
                locale: lang,
                children: getLayout(/*#__PURE__*/ jsx_runtime_.jsx(Component, {
                    ...pageProps
                }))
            })
        ]
    });
};
/* harmony default export */ const _app = ((0,external_next_i18next_.appWithTranslation)(App));


/***/ }),

/***/ 108:
/***/ (() => {



/***/ }),

/***/ 5725:
/***/ ((module) => {

"use strict";
module.exports = require("antd");

/***/ }),

/***/ 9656:
/***/ ((module) => {

"use strict";
module.exports = require("antd/locale/en_US");

/***/ }),

/***/ 5333:
/***/ ((module) => {

"use strict";
module.exports = require("antd/locale/id_ID");

/***/ }),

/***/ 1649:
/***/ ((module) => {

"use strict";
module.exports = require("next-auth/react");

/***/ }),

/***/ 1377:
/***/ ((module) => {

"use strict";
module.exports = require("next-i18next");

/***/ }),

/***/ 6689:
/***/ ((module) => {

"use strict";
module.exports = require("react");

/***/ }),

/***/ 997:
/***/ ((module) => {

"use strict";
module.exports = require("react/jsx-runtime");

/***/ })

};
;

// load runtime
var __webpack_require__ = require("../webpack-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = (__webpack_exec__(9997));
module.exports = __webpack_exports__;

})();