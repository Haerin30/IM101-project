-- CreateTable
CREATE TABLE "Role" (
    "roleId" SERIAL NOT NULL,
    "roleName" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("roleId")
);

-- CreateTable
CREATE TABLE "FacilityType" (
    "facilityTypeId" SERIAL NOT NULL,
    "typeName" TEXT NOT NULL,

    CONSTRAINT "FacilityType_pkey" PRIMARY KEY ("facilityTypeId")
);

-- CreateTable
CREATE TABLE "EquipmentCategory" (
    "categoryId" SERIAL NOT NULL,
    "categoryName" TEXT NOT NULL,

    CONSTRAINT "EquipmentCategory_pkey" PRIMARY KEY ("categoryId")
);

-- CreateTable
CREATE TABLE "ReservationStatus" (
    "statusId" SERIAL NOT NULL,
    "statusName" TEXT NOT NULL,

    CONSTRAINT "ReservationStatus_pkey" PRIMARY KEY ("statusId")
);

-- CreateTable
CREATE TABLE "User" (
    "userId" SERIAL NOT NULL,
    "roleId" INTEGER NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "idNumber" TEXT,
    "contactNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Building" (
    "buildingId" SERIAL NOT NULL,
    "buildingName" TEXT NOT NULL,
    "floorCount" INTEGER NOT NULL,

    CONSTRAINT "Building_pkey" PRIMARY KEY ("buildingId")
);

-- CreateTable
CREATE TABLE "Facility" (
    "facilityId" SERIAL NOT NULL,
    "buildingId" INTEGER NOT NULL,
    "facilityTypeId" INTEGER NOT NULL,
    "facilityName" TEXT NOT NULL,
    "floorNumber" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Available',

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("facilityId")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "equipmentId" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "homeFacilityId" INTEGER,
    "equipmentName" TEXT NOT NULL,
    "totalQuantity" INTEGER NOT NULL,
    "availableQuantity" INTEGER NOT NULL,
    "conditionStatus" TEXT NOT NULL DEFAULT 'Good',

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("equipmentId")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "reservationId" SERIAL NOT NULL,
    "facilityId" INTEGER NOT NULL,
    "requestedBy" INTEGER NOT NULL,
    "approvedBy" INTEGER,
    "statusId" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "startDatetime" TIMESTAMP(3) NOT NULL,
    "endDatetime" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("reservationId")
);

-- CreateTable
CREATE TABLE "ReservationEquipment" (
    "reservationId" INTEGER NOT NULL,
    "equipmentId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "ReservationEquipment_pkey" PRIMARY KEY ("reservationId","equipmentId")
);

-- CreateTable
CREATE TABLE "EquipmentLoan" (
    "loanId" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "equipmentId" INTEGER NOT NULL,
    "approvedBy" INTEGER,
    "quantity" INTEGER NOT NULL,
    "checkoutDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "returnDate" TIMESTAMP(3),
    "conditionOut" TEXT,
    "conditionIn" TEXT,
    "loanStatus" TEXT NOT NULL DEFAULT 'Borrowed',

    CONSTRAINT "EquipmentLoan_pkey" PRIMARY KEY ("loanId")
);

-- CreateTable
CREATE TABLE "FacilityStaffAssignment" (
    "assignmentId" SERIAL NOT NULL,
    "facilityId" INTEGER NOT NULL,
    "staffId" INTEGER NOT NULL,
    "assignedRole" TEXT NOT NULL DEFAULT 'Custodian',
    "assignedDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacilityStaffAssignment_pkey" PRIMARY KEY ("assignmentId")
);

-- CreateTable
CREATE TABLE "MaintenanceRequest" (
    "requestId" SERIAL NOT NULL,
    "facilityId" INTEGER,
    "equipmentId" INTEGER,
    "reportedBy" INTEGER,
    "assignedStaffId" INTEGER,
    "description" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'Normal',
    "status" TEXT NOT NULL DEFAULT 'Open',
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,

    CONSTRAINT "MaintenanceRequest_pkey" PRIMARY KEY ("requestId")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "logId" BIGSERIAL NOT NULL,
    "tableName" TEXT NOT NULL,
    "recordId" INTEGER NOT NULL,
    "actionType" TEXT NOT NULL,
    "changedBy" INTEGER,
    "oldValue" JSONB,
    "newValue" JSONB,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("logId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_roleName_key" ON "Role"("roleName");

-- CreateIndex
CREATE UNIQUE INDEX "FacilityType_typeName_key" ON "FacilityType"("typeName");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentCategory_categoryName_key" ON "EquipmentCategory"("categoryName");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationStatus_statusName_key" ON "ReservationStatus"("statusName");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_idNumber_key" ON "User"("idNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Building_buildingName_key" ON "Building"("buildingName");

-- CreateIndex
CREATE UNIQUE INDEX "FacilityStaffAssignment_facilityId_staffId_key" ON "FacilityStaffAssignment"("facilityId", "staffId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("roleId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("buildingId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_facilityTypeId_fkey" FOREIGN KEY ("facilityTypeId") REFERENCES "FacilityType"("facilityTypeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "EquipmentCategory"("categoryId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_homeFacilityId_fkey" FOREIGN KEY ("homeFacilityId") REFERENCES "Facility"("facilityId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("facilityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "ReservationStatus"("statusId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationEquipment" ADD CONSTRAINT "ReservationEquipment_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("reservationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationEquipment" ADD CONSTRAINT "ReservationEquipment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("equipmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentLoan" ADD CONSTRAINT "EquipmentLoan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentLoan" ADD CONSTRAINT "EquipmentLoan_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("equipmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentLoan" ADD CONSTRAINT "EquipmentLoan_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityStaffAssignment" ADD CONSTRAINT "FacilityStaffAssignment_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("facilityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityStaffAssignment" ADD CONSTRAINT "FacilityStaffAssignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("facilityId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("equipmentId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_reportedBy_fkey" FOREIGN KEY ("reportedBy") REFERENCES "User"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "User"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "User"("userId") ON DELETE SET NULL ON UPDATE CASCADE;
