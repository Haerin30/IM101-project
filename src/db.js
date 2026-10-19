require("dotenv").config({ quiet: true });

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

let prisma;

function getPrisma() {
    if (!prisma) {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString || !connectionString.trim()) {
            throw new Error("DATABASE_URL is required.");
        }

        // The adapter owns one pool; Prisma disconnects it during cleanup.
        const adapter = new PrismaPg({
            connectionString,
            max: 5,
            connectionTimeoutMillis: 10000,
            query_timeout: 10000,
        });
        prisma = new PrismaClient({ adapter, log: [] });
    }

    return prisma;
}

module.exports = { getPrisma };
