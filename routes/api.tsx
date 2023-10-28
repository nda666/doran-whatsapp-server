const express = require('express');
const {
    insertUser
} = require("../controllers/user");

const router = express.Router();

router.post("regis",insertUser);

module.exports = router;