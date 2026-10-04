const prisma = require("../prisma");

const getFacilities = async (req, res) => {
    try {
        const facilities = await prisma.facility.findMany({
            orderBy: {
                facilityId: "asc",
            },
        });

        res.json({
            success: true,
            data: facilities,
        });
    } catch (error) {
        console.error("Error fetching facilities:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch facilities.",
        });
    }
};

const createFacility = async (req, res) => {
    try {
        const {
            building_id,
            buildingId,
            facility_type_id,
            facilityTypeId,
            facility_name,
            facilityName,
            floor_number,
            floorNumber,
            capacity,
            status,
        } = req.body;

        const facility = await prisma.facility.create({
            data: {
                buildingId: Number(buildingId || building_id),
                facilityTypeId: Number(facilityTypeId || facility_type_id),
                facilityName: facilityName || facility_name,
                floorNumber: Number(floorNumber || floor_number),
                capacity: Number(capacity),
                status: status || "Available",
            },
        });

        res.status(201).json({
            success: true,
            message: "Facility created successfully.",
            data: facility,
        });
    } catch (error) {
        console.error("Error creating facility:", error);

        res.status(500).json({
            success: false,
            message: "Failed to create facility.",
            error: error.message,
        });
    }
};

const getFacilityById = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid facility ID. ID must be a number.",
            });
        }

        const facility = await prisma.facility.findUnique({
            where: {
                facilityId: id,
            },
            include: {
                building: true,
                facilityType: true,
            },
        });

        if (!facility) {
            return res.status(404).json({
                success: false,
                message: `Facility with ID ${id} not found.`,
            });
        }

        res.json({
            success: true,
            data: facility,
        });
    } catch (error) {
        console.error("Error fetching facility by ID:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch facility.",
        });
    }
};

const updateFacility = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid facility ID. ID must be a number.",
            });
        }

        const existingFacility = await prisma.facility.findUnique({
            where: { facilityId: id },
        });

        if (!existingFacility) {
            return res.status(404).json({
                success: false,
                message: `Facility with ID ${id} not found.`,
            });
        }

        const {
            buildingId,
            building_id,
            facilityTypeId,
            facility_type_id,
            facilityName,
            facility_name,
            floorNumber,
            floor_number,
            capacity,
            status,
        } = req.body;

        const updateData = {};

        const bId = buildingId !== undefined ? buildingId : building_id;
        if (bId !== undefined) {
            const num = Number(bId);
            if (isNaN(num)) {
                return res.status(400).json({
                    success: false,
                    message: "buildingId must be a valid number.",
                });
            }
            updateData.buildingId = num;
        }

        const ftId = facilityTypeId !== undefined ? facilityTypeId : facility_type_id;
        if (ftId !== undefined) {
            const num = Number(ftId);
            if (isNaN(num)) {
                return res.status(400).json({
                    success: false,
                    message: "facilityTypeId must be a valid number.",
                });
            }
            updateData.facilityTypeId = num;
        }

        const fName = facilityName !== undefined ? facilityName : facility_name;
        if (fName !== undefined) {
            if (typeof fName !== "string" || fName.trim() === "") {
                return res.status(400).json({
                    success: false,
                    message: "facilityName cannot be empty.",
                });
            }
            updateData.facilityName = fName.trim();
        }

        const flNumber = floorNumber !== undefined ? floorNumber : floor_number;
        if (flNumber !== undefined) {
            const num = Number(flNumber);
            if (isNaN(num)) {
                return res.status(400).json({
                    success: false,
                    message: "floorNumber must be a valid number.",
                });
            }
            updateData.floorNumber = num;
        }

        if (capacity !== undefined) {
            const num = Number(capacity);
            if (isNaN(num) || num < 0) {
                return res.status(400).json({
                    success: false,
                    message: "capacity must be a non-negative number.",
                });
            }
            updateData.capacity = num;
        }

        if (status !== undefined) {
            if (typeof status !== "string" || status.trim() === "") {
                return res.status(400).json({
                    success: false,
                    message: "status must be a valid non-empty string.",
                });
            }
            updateData.status = status.trim();
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                message: "No valid fields provided to update.",
            });
        }

        const updatedFacility = await prisma.facility.update({
            where: { facilityId: id },
            data: updateData,
            include: {
                building: true,
                facilityType: true,
            },
        });

        res.json({
            success: true,
            message: "Facility updated successfully.",
            data: updatedFacility,
        });
    } catch (error) {
        console.error("Error updating facility:", error);

        res.status(500).json({
            success: false,
            message: "Failed to update facility.",
            error: error.message,
        });
    }
};

const deleteFacility = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid facility ID. ID must be a number.",
            });
        }

        const existingFacility = await prisma.facility.findUnique({
            where: { facilityId: id },
        });

        if (!existingFacility) {
            return res.status(404).json({
                success: false,
                message: `Facility with ID ${id} not found.`,
            });
        }

        const deactivatedFacility = await prisma.facility.update({
            where: { facilityId: id },
            data: {
                status: "Inactive",
            },
            include: {
                building: true,
                facilityType: true,
            },
        });

        res.json({
            success: true,
            message: "Facility deactivated successfully (soft-deleted).",
            data: deactivatedFacility,
        });
    } catch (error) {
        console.error("Error deactivating facility:", error);

        res.status(500).json({
            success: false,
            message: "Failed to deactivate facility.",
            error: error.message,
        });
    }
};

module.exports = {
    getFacilities,
    getFacilityById,
    createFacility,
    updateFacility,
    deleteFacility,
};