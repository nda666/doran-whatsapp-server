"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getServerSideProps = void 0;
const Layout_1 = __importDefault(require("@/components/Layout"));
const next_i18next_1 = require("next-i18next");
const serverSideTranslations_1 = require("next-i18next/serverSideTranslations");
const react_1 = require("next-auth/react");
const jwt_1 = require("next-auth/jwt");
const prisma_1 = require("@/lib/prisma");
const antd_1 = require("antd");
const DashpboardPage = ({ user }) => {
    const { data } = (0, react_1.useSession)();
    return (<antd_1.Row gutter={16}>
      <antd_1.Col span={12}>
        <antd_1.Statistic title={user === null || user === void 0 ? void 0 : user.email} value={(user === null || user === void 0 ? void 0 : user.name) || ""}/>
      </antd_1.Col>

      <antd_1.Col span={12}>
        <antd_1.Statistic title="Total Device" value={(user === null || user === void 0 ? void 0 : user._count.phones) || 0}/>
      </antd_1.Col>
    </antd_1.Row>);
};
const getServerSideProps = async (context) => {
    const token = await (0, jwt_1.getToken)({ req: context.req });
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: token === null || token === void 0 ? void 0 : token.id },
        select: {
            id: true,
            name: true,
            email: true,
            _count: {
                select: {
                    phones: true,
                },
            },
        },
    });
    return {
        props: {
            user: JSON.parse(JSON.stringify(user)),
            ...(await (0, serverSideTranslations_1.serverSideTranslations)(context.locale || "id", ["common"])),
        },
    };
};
exports.getServerSideProps = getServerSideProps;
DashpboardPage.getLayout = function getLayout(page) {
    const title = () => (next_i18next_1.i18n === null || next_i18next_1.i18n === void 0 ? void 0 : next_i18next_1.i18n.t("dashboard")) || "";
    return <Layout_1.default title={title().toUpperCase()}>{page}</Layout_1.default>;
};
exports.default = DashpboardPage;
