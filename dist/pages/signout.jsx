"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("react");
const react_2 = require("next-auth/react");
const navigation_1 = require("next/navigation");
const Signout = () => {
    const router = (0, navigation_1.useRouter)();
    (0, react_1.useEffect)(() => {
        (0, react_2.signOut)({
            callbackUrl: "/",
            redirect: true,
        });
    }, []);
    return <p>Signout...</p>;
};
exports.default = Signout;
