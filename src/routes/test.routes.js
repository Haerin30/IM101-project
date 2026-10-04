const express = require("express");
const prisma = require("../prisma");

const router = express.Router();

router.get("/database", async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;

        res.json({
            success: true,
            message: "Database connection is working!",
        });
    } catch (error) {
        console.error("Database connection error:", error);

        res.status(500).json({
            success: false,
            message: "Database connection failed.",
        });
    }
});

module.exports = router;