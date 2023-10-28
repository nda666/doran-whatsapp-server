import { request } from "http";
import { NextApiRequest, NextApiResponse } from "next";

const {PrismaClient} = require("@prisma/client");

const insertUser = async(request: NextApiRequest,response: NextApiResponse) => {
    const {name, email} = request.body;
    response.status(200).json("wow");
    try {
        response.status(200).json({
            message: `create user ${name}`
        });

        throw new Error('there has fault')
    } catch(error:any) {
        response.status(400).json({
            msg: error.message
        })
    }
}

module.exports = {
    insertUser
};