"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("react");
const axios_1 = __importStar(require("axios"));
function usePhoneData(token) {
    const [runRefetchPhone, setRunRefetchPhone] = (0, react_1.useState)(false);
    const [phones, setPhones] = (0, react_1.useState)([]);
    // const socketRef = useRef<any>();
    const refetchPhone = () => {
        setRunRefetchPhone(true);
    };
    (0, react_1.useEffect)(() => {
        setRunRefetchPhone(true);
    }, []);
    (0, react_1.useEffect)(() => {
        const fetchPhones = async () => {
            setRunRefetchPhone(false);
            const response = await axios_1.default.get(`/api/phones`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            const result = response.data;
            setPhones(result);
        };
        runRefetchPhone && token && fetchPhones();
    }, [runRefetchPhone, token]);
    const deleteById = async (phoneId) => {
        const result = {
            success: false,
            error: undefined,
            data: undefined,
        };
        try {
            const resp = await axios_1.default.delete(`/api/phones/${phoneId}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            result.success = true;
            result.data = resp.data;
            setRunRefetchPhone(true);
        }
        catch (e) {
            if (e instanceof axios_1.AxiosError) {
                result.error = e;
            }
            else {
                result.error = e;
            }
        }
        return result;
    };
    const save = async (data) => {
        const result = {
            success: false,
            error: undefined,
            data: undefined,
        };
        try {
            const resp = await axios_1.default.post(`/api/phones`, data, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            result.success = true;
            result.data = resp.data;
            setRunRefetchPhone(true);
        }
        catch (e) {
            if (e instanceof axios_1.AxiosError) {
                result.error = e;
            }
            else {
                result.error = e;
            }
        }
        return result;
    };
    return {
        phones,
        setPhones,
        save,
        deleteById,
        refetchPhone,
    };
}
exports.default = usePhoneData;
