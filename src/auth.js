const { randomBytes, createHash } = require("node:crypto");
const bcrypt = require("bcrypt");

const ROLES = Object.freeze({
    ADMIN: "System Administrator",
    STAFF: "Facility/Maintenance Staff",
    MEMBER: "Faculty Member / Student Organization Representative",
});
const userSelect = {
    userId: true,
    email: true,
    fname: true,
    lname: true,
    isActive: true,
    role: { select: { roleName: true } },
};
const fail = (res, status, message) =>
    res.status(status).json({ success: false, message });
const digest = (token) => createHash("sha256").update(token).digest("hex");

function createAuth(prisma, { now = Date.now, ttl = 3600000 } = {}) {
    const sessions = new Map();
    const attempts = new Map();
    // A real bcrypt operation also runs for unknown accounts.
    const dummyHash = bcrypt.hashSync(randomBytes(32).toString("hex"), 10);
    function cleanup() {
        for (const [key, value] of sessions)
            if (value.expiresAt <= now()) sessions.delete(key);
        for (const [key, value] of attempts)
            if (value.until <= now()) attempts.delete(key);
    }
    function allowRoles(...roles) {
        return (req, res, next) => {
            if (!req.user) return fail(res, 401, "Authentication required.");
            if (!roles.includes(req.user.role.roleName))
                return fail(res, 403, "Forbidden.");
            next();
        };
    }
    async function login(req, res) {
        res.set("Cache-Control", "no-store");
        cleanup();
        const body = req.body;
        if (
            !body ||
            Array.isArray(body) ||
            Object.keys(body).some(
                (key) => !["email", "password"].includes(key),
            ) ||
            typeof body.email !== "string" ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ||
            body.email.length > 254 ||
            typeof body.password !== "string" ||
            !body.password.length ||
            Buffer.byteLength(body.password) > 72
        )
            return fail(res, 400, "Provide a valid email and password only.");
        const key = req.ip;
        const attempt = attempts.get(key) || {
            count: 0,
            until: now() + 900000,
        };
        if (
            attempt.count >= 10 ||
            (!attempts.has(key) && attempts.size >= 10000)
        ) {
            res.set("Retry-After", "900");
            return fail(res, 429, "Too many login attempts. Try again later.");
        }
        attempt.count++;
        attempts.set(key, attempt);
        try {
            const user = await prisma.user.findUnique({
                where: { email: body.email.trim() },
                select: { ...userSelect, passwordHash: true },
            });
            const valid = await bcrypt.compare(
                body.password,
                user?.passwordHash || dummyHash,
            );
            if (!valid || !user?.isActive)
                return fail(res, 401, "Invalid email or password.");
            if (!Object.values(ROLES).includes(user.role.roleName))
                return fail(res, 403, "Forbidden.");
            if (sessions.size >= 10000)
                return fail(
                    res,
                    503,
                    "Authentication temporarily unavailable.",
                );
            const token = randomBytes(32).toString("base64url");
            sessions.set(digest(token), {
                userId: user.userId,
                expiresAt: now() + ttl,
            });
            const safeUser = Object.fromEntries(
                Object.keys(userSelect).map((key) => [key, user[key]]),
            );
            res.json({
                success: true,
                token,
                tokenType: "Bearer",
                expiresIn: ttl / 1000,
                user: safeUser,
            });
        } catch {
            return fail(res, 503, "Authentication temporarily unavailable.");
        }
    }
    async function authenticate(req, res, next) {
        res.set("Cache-Control", "no-store");
        cleanup();
        const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(
            req.get("Authorization") || "",
        );
        const key = match && digest(match[1]);
        const session = key && sessions.get(key);
        if (!session) return fail(res, 401, "Authentication required.");
        try {
            const user = await prisma.user.findUnique({
                where: { userId: session.userId },
                select: userSelect,
            });
            if (!user?.isActive) {
                sessions.delete(key);
                return fail(res, 401, "Authentication required.");
            }
            if (!Object.values(ROLES).includes(user.role.roleName))
                return fail(res, 403, "Forbidden.");
            req.user = user;
            req.sessionKey = key;
            next();
        } catch {
            return fail(res, 503, "Authentication temporarily unavailable.");
        }
    }
    function logout(req, res) {
        sessions.delete(req.sessionKey);
        res.json({ success: true, message: "Logged out." });
    }
    return { login, authenticate, allowRoles, logout };
}

module.exports = { createAuth, ROLES };
