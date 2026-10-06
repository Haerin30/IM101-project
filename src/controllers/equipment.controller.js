const prisma = require("../prisma");

const getEquipment = async (req, res) => {
    try {
        const equipment = await prisma.equipment.findMany({
            include: {
                category: true,
                homeFacility: {
                    include: {
                        building: true,
                    },
                },
            },
            orderBy: {
                equipmentId: "asc",
            },
        });

        res.status(200).json({
            success: true,
            data: equipment,
        });
    } catch (error) {
        console.error("Error fetching equipment:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch equipment.",
        });
    }
};

const getEquipmentById = async (req, res) => {
    const id = parseInt(req.params.id, 10);

    if (Number.isNaN(id)) {
        return res.status(400).json({
            success: false,
            message: "Invalid equipment ID. ID must be a number.",
        });
    }

    try {
        const equipment = await prisma.equipment.findUnique({
            where: {
                equipmentId: id,
            },
            include: {
                category: true,
                homeFacility: {
                    include: {
                        building: true,
                    },
                },
            },
        });

        if (!equipment) {
            return res.status(404).json({
                success: false,
                message: `Equipment with ID ${id} not found.`,
            });
        }

        res.status(200).json({
            success: true,
            data: equipment,
        });
    } catch (error) {
        console.error("Error fetching equipment:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch equipment.",
        });
    }
};

const createEquipment = async (req, res) => {
    try {
        const {
            categoryId,
            homeFacilityId,
            equipmentName,
            totalQuantity,
            availableQuantity,
            conditionStatus,
        } = req.body;

        if (
            categoryId === undefined ||
            equipmentName === undefined ||
            totalQuantity === undefined
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "categoryId, equipmentName, and totalQuantity are required.",
            });
        }

        const parsedCategoryId = parseInt(categoryId, 10);
        const parsedTotalQuantity = parseInt(totalQuantity, 10);

        if (
            Number.isNaN(parsedCategoryId) ||
            Number.isNaN(parsedTotalQuantity)
        ) {
            return res.status(400).json({
                success: false,
                message: "categoryId and totalQuantity must be numbers.",
            });
        }

        let parsedHomeFacilityId = null;

        if (homeFacilityId !== undefined && homeFacilityId !== null) {
            parsedHomeFacilityId = parseInt(homeFacilityId, 10);

            if (Number.isNaN(parsedHomeFacilityId)) {
                return res.status(400).json({
                    success: false,
                    message: "homeFacilityId must be a number.",
                });
            }
        }

        let parsedAvailableQuantity = parsedTotalQuantity;

        if (availableQuantity !== undefined) {
            parsedAvailableQuantity = parseInt(availableQuantity, 10);

            if (Number.isNaN(parsedAvailableQuantity)) {
                return res.status(400).json({
                    success: false,
                    message: "availableQuantity must be a number.",
                });
            }
        }

        if (parsedTotalQuantity <= 0) {
            return res.status(400).json({
                success: false,
                message: "totalQuantity must be greater than 0.",
            });
        }

        if (
            parsedAvailableQuantity < 0 ||
            parsedAvailableQuantity > parsedTotalQuantity
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "availableQuantity must be between 0 and totalQuantity.",
            });
        }

        const equipment = await prisma.equipment.create({
            data: {
                categoryId: parsedCategoryId,
                homeFacilityId: parsedHomeFacilityId,
                equipmentName: equipmentName.trim(),
                totalQuantity: parsedTotalQuantity,
                availableQuantity: parsedAvailableQuantity,
                conditionStatus: conditionStatus?.trim() || "Good",
            },
            include: {
                category: true,
                homeFacility: {
                    include: {
                        building: true,
                    },
                },
            },
        });

        res.status(201).json({
            success: true,
            message: "Equipment created successfully.",
            data: equipment,
        });
    } catch (error) {
        console.error("Error creating equipment:", error);

        res.status(500).json({
            success: false,
            message: "Failed to create equipment.",
        });
    }
};

const updateEquipment = async (req, res) => {
    const id = parseInt(req.params.id, 10);

    if (Number.isNaN(id)) {
        return res.status(400).json({
            success: false,
            message: "Invalid equipment ID. ID must be a number.",
        });
    }

    try {
        const existingEquipment = await prisma.equipment.findUnique({
            where: {
                equipmentId: id,
            },
        });

        if (!existingEquipment) {
            return res.status(404).json({
                success: false,
                message: `Equipment with ID ${id} not found.`,
            });
        }

        const {
            categoryId,
            homeFacilityId,
            equipmentName,
            totalQuantity,
            availableQuantity,
            conditionStatus,
        } = req.body;

        const updateData = {};

        if (categoryId !== undefined) {
            const parsedCategoryId = parseInt(categoryId, 10);

            if (Number.isNaN(parsedCategoryId)) {
                return res.status(400).json({
                    success: false,
                    message: "categoryId must be a number.",
                });
            }

            updateData.categoryId = parsedCategoryId;
        }

        if (homeFacilityId !== undefined) {
            if (homeFacilityId === null) {
                updateData.homeFacilityId = null;
            } else {
                const parsedHomeFacilityId = parseInt(homeFacilityId, 10);

                if (Number.isNaN(parsedHomeFacilityId)) {
                    return res.status(400).json({
                        success: false,
                        message: "homeFacilityId must be a number or null.",
                    });
                }

                updateData.homeFacilityId = parsedHomeFacilityId;
            }
        }

        if (equipmentName !== undefined) {
            if (!equipmentName.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "equipmentName cannot be empty.",
                });
            }

            updateData.equipmentName = equipmentName.trim();
        }

        if (totalQuantity !== undefined) {
            const parsedTotalQuantity = parseInt(totalQuantity, 10);

            if (
                Number.isNaN(parsedTotalQuantity) ||
                parsedTotalQuantity <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message: "totalQuantity must be greater than 0.",
                });
            }

            updateData.totalQuantity = parsedTotalQuantity;
        }

        if (availableQuantity !== undefined) {
            const parsedAvailableQuantity = parseInt(availableQuantity, 10);

            if (
                Number.isNaN(parsedAvailableQuantity) ||
                parsedAvailableQuantity < 0
            ) {
                return res.status(400).json({
                    success: false,
                    message: "availableQuantity must be 0 or greater.",
                });
            }

            updateData.availableQuantity = parsedAvailableQuantity;
        }

        if (conditionStatus !== undefined) {
            if (!conditionStatus.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "conditionStatus cannot be empty.",
                });
            }

            updateData.conditionStatus = conditionStatus.trim();
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                message: "No valid fields provided to update.",
            });
        }

        const newTotalQuantity =
            updateData.totalQuantity ?? existingEquipment.totalQuantity;

        const newAvailableQuantity =
            updateData.availableQuantity ??
            existingEquipment.availableQuantity;

        if (
            newAvailableQuantity < 0 ||
            newAvailableQuantity > newTotalQuantity
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "availableQuantity must be between 0 and totalQuantity.",
            });
        }

        const equipment = await prisma.equipment.update({
            where: {
                equipmentId: id,
            },
            data: updateData,
            include: {
                category: true,
                homeFacility: {
                    include: {
                        building: true,
                    },
                },
            },
        });

        res.status(200).json({
            success: true,
            message: "Equipment updated successfully.",
            data: equipment,
        });
    } catch (error) {
        console.error("Error updating equipment:", error);

        res.status(500).json({
            success: false,
            message: "Failed to update equipment.",
        });
    }
};

const deleteEquipment = async (req, res) => {
    const id = parseInt(req.params.id, 10);

    if (Number.isNaN(id)) {
        return res.status(400).json({
            success: false,
            message: "Invalid equipment ID. ID must be a number.",
        });
    }

    try {
        const existingEquipment = await prisma.equipment.findUnique({
            where: {
                equipmentId: id,
            },
        });

        if (!existingEquipment) {
            return res.status(404).json({
                success: false,
                message: `Equipment with ID ${id} not found.`,
            });
        }

        const deactivatedEquipment = await prisma.equipment.update({
            where: {
                equipmentId: id,
            },
            data: {
                conditionStatus: "Inactive",
            },
            include: {
                category: true,
                homeFacility: {
                    include: {
                        building: true,
                    },
                },
            },
        });

        res.status(200).json({
            success: true,
            message: "Equipment deactivated successfully.",
            data: deactivatedEquipment,
        });
    } catch (error) {
        console.error("Error deactivating equipment:", error);

        res.status(500).json({
            success: false,
            message: "Failed to deactivate equipment.",
        });
    }
};

module.exports = {
    getEquipment,
    getEquipmentById,
    createEquipment,
    updateEquipment,
    deleteEquipment,
};