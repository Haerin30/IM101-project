const router = require("express").Router();
const prisma = require("../prisma");
const { ROLES } = require("../auth");
const v = require("../validation");
const member = (req) => req.user.role.roleName === ROLES.MEMBER;
router.get(
    "/",
    v.endpoint(async (req, res) => {
        const data = await prisma.equipmentLoan.findMany({
            where: member(req) ? { userId: req.user.userId } : {},
            orderBy: { loanId: "asc" },
        });
        res.json({ success: true, data });
    }),
);
router.post(
    "/",
    v.endpoint(async (req, res) => {
        v.check(!member(req), "Forbidden.", 403);
        const b = v.body(req.body);
        const equipmentId = v.integer(b.equipmentId, "equipmentId"),
            userId = v.integer(b.userId, "userId"),
            quantity = v.integer(b.quantity, "quantity");
        const dueDate = v.date(b.dueDate, "dueDate");
        v.check(dueDate > new Date(), "dueDate must be in the future.");
        const conditionOut =
            b.conditionOut === undefined
                ? "Good"
                : v.text(b.conditionOut, "conditionOut", 200);
        const data = await v.transaction(prisma, req, async (tx) => {
            const user = await tx.user.findUnique({
                where: { userId },
                select: { isActive: true },
            });
            v.check(
                user?.isActive,
                "Borrower does not exist or is inactive.",
                400,
            );
            return tx.equipmentLoan.create({
                data: {
                    equipmentId,
                    userId,
                    quantity,
                    dueDate,
                    conditionOut,
                    approvedBy: req.user.userId,
                },
            });
        });
        res.status(201).json({ success: true, data });
    }),
);
router.post(
    "/:id/return",
    v.endpoint(async (req, res) => {
        v.check(!member(req), "Forbidden.", 403);
        const loanId = v.integer(req.params.id, "loanId"),
            b = v.body(req.body),
            conditionIn = v.text(b.conditionIn, "conditionIn", 200);
        v.check(
            ["Good", "Fair", "Damaged"].includes(conditionIn),
            "conditionIn must be Good, Fair, or Damaged.",
        );
        const data = await v.transaction(prisma, req, async (tx) => {
            const loan = await tx.equipmentLoan.findUnique({
                where: { loanId },
            });
            v.check(loan, "Loan not found.", 404);
            v.check(
                loan.loanStatus === "Borrowed",
                "Loan is already returned.",
                409,
            );
            return tx.equipmentLoan.update({
                where: { loanId },
                data: {
                    returnDate: new Date(),
                    conditionIn,
                    loanStatus: "Returned",
                },
            });
        });
        res.json({ success: true, data });
    }),
);
module.exports = router;
