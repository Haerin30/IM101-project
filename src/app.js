const express = require("express");

function createApp() {
    const app = express();
    app.get("/api/health", (req, res) => {
        res.json({
            success: true,
            message: "Campus Facility Management API is running.",
        });
    });
    return app;
}

module.exports = { createApp };
