const express = require("express");

const {
    getFacilities,
    getFacilityById,
    createFacility,
    updateFacility,
    deleteFacility,
} = require("../controllers/facility.controller");

const router = express.Router();

router.get("/", getFacilities);
router.get("/:id", getFacilityById);
router.post("/", createFacility);
router.put("/:id", updateFacility);
router.delete("/:id", deleteFacility);

module.exports = router;