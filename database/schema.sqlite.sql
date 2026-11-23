-- DANS (Disaster Alert and Notification System) database schema for SQLite.
-- Generated from the Entity Framework Core model with: dotnet run -- --export-schema <folder>
-- The API creates this schema automatically on first start; this file is for reference and manual setup.

CREATE TABLE "Barangays" (
    "Id" INTEGER NOT NULL CONSTRAINT "PK_Barangays" PRIMARY KEY AUTOINCREMENT,
    "Name" TEXT NOT NULL
);


CREATE TABLE "EmergencyContacts" (
    "Id" INTEGER NOT NULL CONSTRAINT "PK_EmergencyContacts" PRIMARY KEY AUTOINCREMENT,
    "Name" TEXT NOT NULL,
    "Number" TEXT NOT NULL,
    "Description" TEXT NULL,
    "SortOrder" INTEGER NOT NULL
);


CREATE TABLE "SafetyGuides" (
    "Id" INTEGER NOT NULL CONSTRAINT "PK_SafetyGuides" PRIMARY KEY AUTOINCREMENT,
    "Type" INTEGER NOT NULL,
    "Title" TEXT NOT NULL,
    "Summary" TEXT NOT NULL,
    "BeforeTips" TEXT NOT NULL,
    "DuringTips" TEXT NOT NULL,
    "AfterTips" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL
);


CREATE TABLE "EvacuationCenters" (
    "Id" INTEGER NOT NULL CONSTRAINT "PK_EvacuationCenters" PRIMARY KEY AUTOINCREMENT,
    "Name" TEXT NOT NULL,
    "BarangayId" INTEGER NOT NULL,
    "Address" TEXT NOT NULL,
    "Capacity" INTEGER NOT NULL,
    "CurrentOccupancy" INTEGER NOT NULL,
    "Status" INTEGER NOT NULL,
    "ContactPerson" TEXT NULL,
    "ContactNumber" TEXT NULL,
    "Facilities" TEXT NULL,
    "Latitude" REAL NULL,
    "Longitude" REAL NULL,
    "UpdatedAt" TEXT NOT NULL,
    CONSTRAINT "FK_EvacuationCenters_Barangays_BarangayId" FOREIGN KEY ("BarangayId") REFERENCES "Barangays" ("Id") ON DELETE RESTRICT
);


CREATE TABLE "Users" (
    "Id" INTEGER NOT NULL CONSTRAINT "PK_Users" PRIMARY KEY AUTOINCREMENT,
    "FullName" TEXT NOT NULL,
    "Email" TEXT NOT NULL,
    "PhoneNumber" TEXT NOT NULL,
    "PasswordHash" TEXT NOT NULL,
    "Role" INTEGER NOT NULL,
    "BarangayId" INTEGER NULL,
    "Address" TEXT NULL,
    "IsActive" INTEGER NOT NULL,
    "CreatedAt" TEXT NOT NULL,
    "FailedLoginCount" INTEGER NOT NULL,
    "LockoutEndsAt" TEXT NULL,
    "PrivacyConsentAt" TEXT NULL,
    CONSTRAINT "FK_Users_Barangays_BarangayId" FOREIGN KEY ("BarangayId") REFERENCES "Barangays" ("Id") ON DELETE RESTRICT
);


CREATE TABLE "IncidentReports" (
    "Id" INTEGER NOT NULL CONSTRAINT "PK_IncidentReports" PRIMARY KEY AUTOINCREMENT,
    "ReporterId" INTEGER NOT NULL,
    "Type" INTEGER NOT NULL,
    "Severity" INTEGER NOT NULL,
    "BarangayId" INTEGER NOT NULL,
    "Location" TEXT NOT NULL,
    "Description" TEXT NOT NULL,
    "PeopleAffected" INTEGER NULL,
    "Latitude" REAL NULL,
    "Longitude" REAL NULL,
    "Status" INTEGER NOT NULL,
    "AssignedToId" INTEGER NULL,
    "CreatedAt" TEXT NOT NULL,
    "UpdatedAt" TEXT NOT NULL,
    "ClosedAt" TEXT NULL,
    CONSTRAINT "FK_IncidentReports_Barangays_BarangayId" FOREIGN KEY ("BarangayId") REFERENCES "Barangays" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_IncidentReports_Users_AssignedToId" FOREIGN KEY ("AssignedToId") REFERENCES "Users" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_IncidentReports_Users_ReporterId" FOREIGN KEY ("ReporterId") REFERENCES "Users" ("Id") ON DELETE RESTRICT
);


CREATE TABLE "Notifications" (
    "Id" INTEGER NOT NULL CONSTRAINT "PK_Notifications" PRIMARY KEY AUTOINCREMENT,
    "UserId" INTEGER NOT NULL,
    "Title" TEXT NOT NULL,
    "Message" TEXT NOT NULL,
    "Type" INTEGER NOT NULL,
    "Link" TEXT NULL,
    "IsRead" INTEGER NOT NULL,
    "CreatedAt" TEXT NOT NULL,
    CONSTRAINT "FK_Notifications_Users_UserId" FOREIGN KEY ("UserId") REFERENCES "Users" ("Id") ON DELETE CASCADE
);


CREATE TABLE "UserSessions" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_UserSessions" PRIMARY KEY,
    "UserId" INTEGER NOT NULL,
    "CreatedAt" TEXT NOT NULL,
    "ExpiresAt" TEXT NOT NULL,
    "RevokedAt" TEXT NULL,
    "UserAgent" TEXT NULL,
    CONSTRAINT "FK_UserSessions_Users_UserId" FOREIGN KEY ("UserId") REFERENCES "Users" ("Id") ON DELETE CASCADE
);


CREATE TABLE "Alerts" (
    "Id" INTEGER NOT NULL CONSTRAINT "PK_Alerts" PRIMARY KEY AUTOINCREMENT,
    "Title" TEXT NOT NULL,
    "Message" TEXT NOT NULL,
    "Instructions" TEXT NULL,
    "Type" INTEGER NOT NULL,
    "Severity" INTEGER NOT NULL,
    "IssuedById" INTEGER NOT NULL,
    "IssuedAt" TEXT NOT NULL,
    "ExpiresAt" TEXT NULL,
    "LiftedAt" TEXT NULL,
    "ReportId" INTEGER NULL,
    CONSTRAINT "FK_Alerts_IncidentReports_ReportId" FOREIGN KEY ("ReportId") REFERENCES "IncidentReports" ("Id") ON DELETE SET NULL,
    CONSTRAINT "FK_Alerts_Users_IssuedById" FOREIGN KEY ("IssuedById") REFERENCES "Users" ("Id") ON DELETE RESTRICT
);


CREATE TABLE "ReportUpdates" (
    "Id" INTEGER NOT NULL CONSTRAINT "PK_ReportUpdates" PRIMARY KEY AUTOINCREMENT,
    "ReportId" INTEGER NOT NULL,
    "UserId" INTEGER NOT NULL,
    "Status" INTEGER NULL,
    "Note" TEXT NULL,
    "CreatedAt" TEXT NOT NULL,
    CONSTRAINT "FK_ReportUpdates_IncidentReports_ReportId" FOREIGN KEY ("ReportId") REFERENCES "IncidentReports" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_ReportUpdates_Users_UserId" FOREIGN KEY ("UserId") REFERENCES "Users" ("Id") ON DELETE RESTRICT
);


CREATE TABLE "AlertBarangays" (
    "AlertId" INTEGER NOT NULL,
    "BarangaysId" INTEGER NOT NULL,
    CONSTRAINT "PK_AlertBarangays" PRIMARY KEY ("AlertId", "BarangaysId"),
    CONSTRAINT "FK_AlertBarangays_Alerts_AlertId" FOREIGN KEY ("AlertId") REFERENCES "Alerts" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_AlertBarangays_Barangays_BarangaysId" FOREIGN KEY ("BarangaysId") REFERENCES "Barangays" ("Id") ON DELETE CASCADE
);


CREATE INDEX "IX_AlertBarangays_BarangaysId" ON "AlertBarangays" ("BarangaysId");


CREATE INDEX "IX_Alerts_IssuedAt" ON "Alerts" ("IssuedAt");


CREATE INDEX "IX_Alerts_IssuedById" ON "Alerts" ("IssuedById");


CREATE INDEX "IX_Alerts_ReportId" ON "Alerts" ("ReportId");


CREATE UNIQUE INDEX "IX_Barangays_Name" ON "Barangays" ("Name");


CREATE INDEX "IX_EvacuationCenters_BarangayId" ON "EvacuationCenters" ("BarangayId");


CREATE INDEX "IX_IncidentReports_AssignedToId" ON "IncidentReports" ("AssignedToId");


CREATE INDEX "IX_IncidentReports_BarangayId" ON "IncidentReports" ("BarangayId");


CREATE INDEX "IX_IncidentReports_CreatedAt" ON "IncidentReports" ("CreatedAt");


CREATE INDEX "IX_IncidentReports_ReporterId" ON "IncidentReports" ("ReporterId");


CREATE INDEX "IX_IncidentReports_Status" ON "IncidentReports" ("Status");


CREATE INDEX "IX_Notifications_UserId_IsRead" ON "Notifications" ("UserId", "IsRead");


CREATE INDEX "IX_ReportUpdates_ReportId" ON "ReportUpdates" ("ReportId");


CREATE INDEX "IX_ReportUpdates_UserId" ON "ReportUpdates" ("UserId");


CREATE INDEX "IX_Users_BarangayId" ON "Users" ("BarangayId");


CREATE UNIQUE INDEX "IX_Users_Email" ON "Users" ("Email");


CREATE INDEX "IX_UserSessions_UserId" ON "UserSessions" ("UserId");


