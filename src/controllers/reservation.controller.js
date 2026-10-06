const prisma = require("../prisma");

const createReservation = async (req, res) => {
    try {
        const {
            facilityId,
            requestedBy,
            purpose,
            startDatetime,
            endDatetime,
        } = req.body;

        // Check if the facility exists
        const facility = await prisma.facility.findUnique({
            where: {
                facilityId: Number(facilityId),
            },
        });

        if (!facility) {
            return res.status(404).json({
                success: false,
                message: "Facility not found.",
            });
        }

        // Check if the requesting user exists
        const user = await prisma.user.findUnique({
            where: {
                userId: Number(requestedBy),
            },
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Requesting user not found.",
            });
        }

        // Find the Pending status
        const pendingStatus = await prisma.reservationStatus.findUnique({
            where: {
                statusName: "Pending",
            },
        });

        if (!pendingStatus) {
            return res.status(500).json({
                success: false,
                message: "Pending reservation status not found.",
            });
        }

        // Create the reservation
        const reservation = await prisma.reservation.create({
            data: {
                facilityId: Number(facilityId),
                requestedBy: Number(requestedBy),
                statusId: pendingStatus.statusId,
                purpose,
                startDatetime: new Date(startDatetime),
                endDatetime: new Date(endDatetime),
            },
            include: {
                facility: true,
                requester: {
                    select: {
                        userId: true,
                        fname: true,
                        lname: true,
                        email: true,
                        idNumber: true,
                        contactNumber: true,
                    },
                },
                status: true,
            },
        });

        res.status(201).json({
            success: true,
            message: "Reservation created successfully.",
            data: reservation,
        });
    } catch (error) {
        console.error("Create reservation error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to create reservation.",
        });
    }
};

const getReservations = async (req, res) => {
    try {
        const reservations = await prisma.reservation.findMany({
            include: {
                facility: true,
                requester: {
                    select: {
                        userId: true,
                        fname: true,
                        lname: true,
                        email: true,
                        idNumber: true,
                        contactNumber: true,
                    },
                },
                approver: {
                    select: {
                        userId: true,
                        fname: true,
                        lname: true,
                        email: true,
                    },
                },
                status: true,
            },
            orderBy: {
                reservationId: "asc",
            },
        });

        res.json({
            success: true,
            count: reservations.length,
            data: reservations,
        });
    } catch (error) {
        console.error("Get reservations error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to retrieve reservations.",
        });
    }
};

const getReservationById = async (req, res) => {
    try {
        const reservationId = Number(req.params.id);

        const reservation = await prisma.reservation.findUnique({
            where: {
                reservationId: reservationId,
            },
            include: {
                facility: true,
                requester: {
                    select: {
                        userId: true,
                        fname: true,
                        lname: true,
                        email: true,
                        idNumber: true,
                        contactNumber: true,
                    },
                },
                approver: {
                    select: {
                        userId: true,
                        fname: true,
                        lname: true,
                        email: true,
                    },
                },
                status: true,
            },
        });

        if (!reservation) {
            return res.status(404).json({
                success: false,
                message: "Reservation not found.",
            });
        }

        res.json({
            success: true,
            data: reservation,
        });
    } catch (error) {
        console.error("Get reservation error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to retrieve reservation.",
        });
    }
};

const updateReservation = async (req, res) => {
    try {
        const reservationId = Number(req.params.id);

        // Check if the reservation exists
        const existingReservation = await prisma.reservation.findUnique({
            where: {
                reservationId: reservationId,
            },
        });

        if (!existingReservation) {
            return res.status(404).json({
                success: false,
                message: "Reservation not found.",
            });
        }

        const {
            purpose,
            startDatetime,
            endDatetime,
        } = req.body;

        // Build the update object using only allowed fields
        const updateData = {};

        if (purpose !== undefined) {
            updateData.purpose = purpose;
        }

        if (startDatetime !== undefined) {
            updateData.startDatetime = new Date(startDatetime);
        }

        if (endDatetime !== undefined) {
            updateData.endDatetime = new Date(endDatetime);
        }

        // Update the reservation
        const reservation = await prisma.reservation.update({
            where: {
                reservationId: reservationId,
            },
            data: updateData,
            include: {
                facility: true,
                requester: {
                    select: {
                        userId: true,
                        fname: true,
                        lname: true,
                        email: true,
                        idNumber: true,
                        contactNumber: true,
                    },
                },
                approver: {
                    select: {
                        userId: true,
                        fname: true,
                        lname: true,
                        email: true,
                    },
                },
                status: true,
            },
        });

        res.json({
            success: true,
            message: "Reservation updated successfully.",
            data: reservation,
        });
    } catch (error) {
        console.error("Update reservation error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to update reservation.",
        });
    }
};

module.exports = {
    createReservation,
    getReservations,
    getReservationById,
    updateReservation,
};
