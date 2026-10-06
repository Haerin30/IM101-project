const express = require("express");
const testRoutes = require("./routes/test.routes");
const facilityRoutes = require("./routes/facility.routes");
const equipmentRoutes = require("./routes/equipment.routes");
const reservationRoutes = require("./routes/reservation.routes");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());

app.use("/api/equipment", equipmentRoutes);

app.use("/api/facilities", facilityRoutes);

// Health check
app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "Campus Facility Management API is running!",
    });
});

// Test routes
app.use("/api/test", testRoutes);

app.use("/api/reservations", reservationRoutes);

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});