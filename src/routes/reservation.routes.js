const express = require("express");

const {
    createReservation,
    getReservations,
    getReservationById,
    updateReservation
} = require("../controllers/reservation.controller");

const router = express.Router();

router.post("/", createReservation);
router.get("/", getReservations);
router.get("/:id", getReservationById);
router.put("/:id", updateReservation);

module.exports = router;