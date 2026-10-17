const { randomBytes, createHash } = require("node:crypto");
const bcrypt = require("bcrypt");
const { DatabaseAuthStore } = require("./auth-store");
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
function createAuth(
    prisma,
    {
        now = Date.now,
        ttl = 3600000,
        store = new DatabaseAuthStore(prisma),
    } = {},
) {
    const dummyHash = bcrypt.hashSync(randomBytes(32).toString("hex"), 10);
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
        const b = req.body;
        if (
            !b ||
            Array.isArray(b) ||
            Object.keys(b).some((k) => !["email", "password"].includes(k)) ||
            typeof b.email !== "string" ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email.trim()) ||
            b.email.length > 254 ||
            typeof b.password !== "string" ||
            !b.password.length ||
            Buffer.byteLength(b.password) > 72
        )
            return fail(res, 400, "Provide a valid email and password only.");
        try {
            await store.cleanup(now());
            if (!(await store.attempt(digest(req.ip || "unknown"), now()))) {
                res.set("Retry-After", "900");
                return fail(
                    res,
                    429,
                    "Too many login attempts. Try again later.",
                );
            }
            const user = await prisma.user.findUnique({
                where: { email: b.email.trim() },
                select: { ...userSelect, passwordHash: true },
            });
            const valid = await bcrypt.compare(
                b.password,
                user?.passwordHash || dummyHash,
            );
            if (!valid || !user?.isActive)
                return fail(res, 401, "Invalid email or password.");
            if (!Object.values(ROLES).includes(user.role.roleName))
                return fail(res, 403, "Forbidden.");
            const token = randomBytes(32).toString("base64url");
            await store.set(digest(token), {
                userId: user.userId,
                expiresAt: now() + ttl,
            });
            res.json({
                success: true,
                token,
                tokenType: "Bearer",
                expiresIn: ttl / 1000,
                user: Object.fromEntries(
                    Object.keys(userSelect).map((k) => [k, user[k]]),
                ),
            });
        } catch {
            return fail(res, 503, "Authentication temporarily unavailable.");
        }
    }
    async function authenticate(req, res, next) {
        res.set("Cache-Control", "no-store");
        const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(
            req.get("Authorization") || "",
        );
        if (!match) return fail(res, 401, "Authentication required.");
        const key = digest(match[1]);
        try {
            const session = await store.get(key);
            if (!session || Number(new Date(session.expiresAt)) <= now()) {
                await store.delete(key);
                return fail(res, 401, "Authentication required.");
            }
            const user = await prisma.user.findUnique({
                where: { userId: session.userId },
                select: userSelect,
            });
            if (!user?.isActive) {
                await store.delete(key);
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
    async function logout(req, res) {
        try {
            await store.delete(req.sessionKey);
            res.json({ success: true, message: "Logged out." });
        } catch {
            fail(res, 503, "Authentication temporarily unavailable.");
        }
    }
    return { login, authenticate, allowRoles, logout };
}
module.exports = { createAuth, ROLES };
