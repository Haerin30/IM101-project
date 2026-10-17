// Persistent sessions and rate limits work across API processes and restarts.
class DatabaseAuthStore {
    constructor(db) {
        this.db = db;
    }
    async cleanup(now) {
        await this.db.authSession.deleteMany({
            where: { expiresAt: { lte: new Date(now) } },
        });
        await this.db.loginAttempt.deleteMany({
            where: { until: { lte: new Date(now) } },
        });
    }
    async attempt(key, now) {
        const rows = await this.db
            .$queryRaw`INSERT INTO "LoginAttempt" ("key","count","until") VALUES (${key},1,${new Date(now + 900000)})
        ON CONFLICT ("key") DO UPDATE SET "count"=CASE WHEN "LoginAttempt"."until" <= ${new Date(now)} THEN 1 ELSE LEAST("LoginAttempt"."count"+1,11) END,
        "until"=CASE WHEN "LoginAttempt"."until" <= ${new Date(now)} THEN ${new Date(now + 900000)} ELSE "LoginAttempt"."until" END RETURNING "count"`;
        return rows[0].count <= 10;
    }
    async set(key, session) {
        await this.db.authSession.create({
            data: {
                key,
                userId: session.userId,
                expiresAt: new Date(session.expiresAt),
            },
        });
    }
    async get(key) {
        return this.db.authSession.findUnique({ where: { key } });
    }
    async delete(key) {
        await this.db.authSession.deleteMany({ where: { key } });
    }
}
module.exports = { DatabaseAuthStore };
