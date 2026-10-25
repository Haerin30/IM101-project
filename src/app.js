const express = require("express");

function createApp(options = {}) {
    const app = express();
    const { getPrisma } = require("./db");
    const { createAuth } = require("./auth");
    const { router, requireRoles } = createAuth({
        getPrisma: options.getPrisma || getPrisma,
        jwtSecret: options.jwtSecret ?? process.env.JWT_SECRET,
    });
    app.use(express.json({ limit: "8kb" }));
    app.use("/api/auth", router);
    app.use(
        "/api/buildings",
        require("./buildings").createBuildings({
            getPrisma: options.getPrisma || getPrisma,
            requireRoles,
        }),
    );
    app.use(
        "/api/facilities",
        require("./facilities").createFacilities({
            getPrisma: options.getPrisma || getPrisma,
            requireRoles,
        }),
    );
    app.use(
        "/api/equipment",
        require("./equipment").createEquipment({
            getPrisma: options.getPrisma || getPrisma,
            requireRoles,
        }),
    );
    app.use(
        "/api/reservation-statuses",
        require("./reservation-statuses").createReservationStatuses({
            getPrisma: options.getPrisma || getPrisma,
            requireRoles,
        }),
    );
    app.get("/api/health", (req, res) => {
        res.json({
            success: true,
            message: "Campus Facility Management API is running.",
        });
    });
    app.use((error, req, res, next) => {
        const status =
            error.type === "entity.parse.failed"
                ? 400
                : error.type === "entity.too.large"
                  ? 413
                  : error.type === "charset.unsupported" ||
                      error.type === "encoding.unsupported"
                    ? 415
                    : 500;
        res.status(status).json({
            success: false,
            message:
                status === 500
                    ? "Internal server error."
                    : "Invalid request body.",
        });
    });
    return app;
}

module.exports = { createApp };
