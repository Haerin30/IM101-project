const express = require("express");

const {
    getEquipment,
    getEquipmentById,
    createEquipment,
    updateEquipment,
    deleteEquipment,
    repairEquipment,
} = require("../controllers/equipment.controller");

const router = express.Router();

router.get("/", getEquipment);
router.get("/:id", getEquipmentById);

router.post("/", createEquipment);

router.put("/:id", updateEquipment);

router.delete("/:id", deleteEquipment);
router.post("/:id/repair", repairEquipment);

module.exports = router;
