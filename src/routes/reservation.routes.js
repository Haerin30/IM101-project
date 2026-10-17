const express = require("express");

const {
    createReservation,
    getReservations,
    getReservationById,
    updateReservation,
    transitionReservation,
    getReservationHistory,
} = require("../controllers/reservation.controller");

const router = express.Router();

router.post("/", createReservation);
router.get("/", getReservations);
router.get("/:id", getReservationById);
router.put("/:id", updateReservation);
router.patch("/:id/status", transitionReservation);
router.get("/:id/history", getReservationHistory);

module.exports = router;
