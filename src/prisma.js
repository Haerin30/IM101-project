require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    options: "-c timezone=UTC",
});

const prisma = new PrismaClient({ adapter });

module.exports = prisma;
