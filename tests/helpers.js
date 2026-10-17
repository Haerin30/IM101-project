function memoryStore() {
    const sessions = new Map(),
        attempts = new Map();
    return {
        async cleanup(now) {
            for (const [key, value] of sessions)
                if (value.expiresAt <= now) sessions.delete(key);
            for (const [key, value] of attempts)
                if (value.until <= now) attempts.delete(key);
        },
        async attempt(key, now) {
            const row = attempts.get(key) || { count: 0, until: now + 900000 };
            row.count++;
            attempts.set(key, row);
            return row.count <= 10;
        },
        async set(key, row) {
            sessions.set(key, row);
        },
        async get(key) {
            return sessions.get(key);
        },
        async delete(key) {
            sessions.delete(key);
        },
    };
}
async function invoke(handler, body = {}, id = "1") {
    const res = {
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(value) {
            this.body = value;
            return this;
        },
    };
    await handler(
        {
            body,
            params: { id },
            user: { userId: 1, role: { roleName: "System Administrator" } },
        },
        res,
    );
    return res;
}
module.exports = { memoryStore, invoke };
