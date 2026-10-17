const express = require("express");
const prisma = require("./prisma");
const { createAuth, ROLES } = require("./auth");
function createApp({ database = prisma, authOptions } = {}) {
    const app = express();
    const auth = createAuth(database, authOptions);
    app.use(express.json({ limit: "16kb" }));
    app.get("/api/health", (req, res) =>
        res.json({
            success: true,
            message: "Campus Facility Management API is running!",
        }),
    );
    app.post("/api/auth/login", auth.login);
    app.post("/api/auth/logout", auth.authenticate, auth.logout);
    app.get("/api/auth/me", auth.authenticate, (req, res) =>
        res.json({ success: true, user: req.user }),
    );
    for (const resource of ["facilities", "equipment"]) {
        app.use(
            "/api/" + resource,
            auth.authenticate,
            (req, res, next) => {
                if (["GET", "HEAD"].includes(req.method)) return next();
                return auth.allowRoles(ROLES.ADMIN, ROLES.STAFF)(
                    req,
                    res,
                    next,
                );
            },
            require(
                "./routes/" +
                    (resource === "facilities" ? "facility" : "equipment") +
                    ".routes",
            ),
        );
    }
    app.use(
        "/api/reservations",
        auth.authenticate,
        require("./routes/reservation.routes"),
    );
    app.use("/api/loans", auth.authenticate, require("./routes/loan.routes"));
    app.use(
        "/api/test",
        auth.authenticate,
        auth.allowRoles(ROLES.ADMIN),
        require("./routes/test.routes"),
    );
    app.use((error, req, res, next) => {
        const status =
            error.type === "entity.too.large"
                ? 413
                : error instanceof SyntaxError
                  ? 400
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
