-- DANS (Disaster Alert and Notification System) database schema for SQL Server.
-- Generated from the Entity Framework Core model with: dotnet run -- --export-schema <folder>
-- The API creates this schema automatically on first start; this file is for reference and manual setup.

CREATE TABLE [Barangays] (
    [Id] int NOT NULL IDENTITY,
    [Name] nvarchar(100) NOT NULL,
    CONSTRAINT [PK_Barangays] PRIMARY KEY ([Id])
);
GO


CREATE TABLE [EmergencyContacts] (
    [Id] int NOT NULL IDENTITY,
    [Name] nvarchar(100) NOT NULL,
    [Number] nvarchar(50) NOT NULL,
    [Description] nvarchar(250) NULL,
    [SortOrder] int NOT NULL,
    CONSTRAINT [PK_EmergencyContacts] PRIMARY KEY ([Id])
);
GO


CREATE TABLE [SafetyGuides] (
    [Id] int NOT NULL IDENTITY,
    [Type] int NOT NULL,
    [Title] nvarchar(150) NOT NULL,
    [Summary] nvarchar(1000) NOT NULL,
    [BeforeTips] nvarchar(max) NOT NULL,
    [DuringTips] nvarchar(max) NOT NULL,
    [AfterTips] nvarchar(max) NOT NULL,
    [UpdatedAt] datetime2 NOT NULL,
    CONSTRAINT [PK_SafetyGuides] PRIMARY KEY ([Id])
);
GO


CREATE TABLE [EvacuationCenters] (
    [Id] int NOT NULL IDENTITY,
    [Name] nvarchar(150) NOT NULL,
    [BarangayId] int NOT NULL,
    [Address] nvarchar(250) NOT NULL,
    [Capacity] int NOT NULL,
    [CurrentOccupancy] int NOT NULL,
    [Status] int NOT NULL,
    [ContactPerson] nvarchar(100) NULL,
    [ContactNumber] nvarchar(30) NULL,
    [Facilities] nvarchar(500) NULL,
    [Latitude] float NULL,
    [Longitude] float NULL,
    [UpdatedAt] datetime2 NOT NULL,
    CONSTRAINT [PK_EvacuationCenters] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_EvacuationCenters_Barangays_BarangayId] FOREIGN KEY ([BarangayId]) REFERENCES [Barangays] ([Id]) ON DELETE NO ACTION
);
GO


CREATE TABLE [Users] (
    [Id] int NOT NULL IDENTITY,
    [FullName] nvarchar(100) NOT NULL,
    [Email] nvarchar(150) NOT NULL,
    [PhoneNumber] nvarchar(20) NOT NULL,
    [PasswordHash] nvarchar(max) NOT NULL,
    [Role] int NOT NULL,
    [BarangayId] int NULL,
    [Address] nvarchar(200) NULL,
    [IsActive] bit NOT NULL,
    [CreatedAt] datetime2 NOT NULL,
    [FailedLoginCount] int NOT NULL,
    [LockoutEndsAt] datetime2 NULL,
    [PrivacyConsentAt] datetime2 NULL,
    CONSTRAINT [PK_Users] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_Users_Barangays_BarangayId] FOREIGN KEY ([BarangayId]) REFERENCES [Barangays] ([Id]) ON DELETE NO ACTION
);
GO


CREATE TABLE [IncidentReports] (
    [Id] int NOT NULL IDENTITY,
    [ReporterId] int NOT NULL,
    [Type] int NOT NULL,
    [Severity] int NOT NULL,
    [BarangayId] int NOT NULL,
    [Location] nvarchar(200) NOT NULL,
    [Description] nvarchar(2000) NOT NULL,
    [PeopleAffected] int NULL,
    [Latitude] float NULL,
    [Longitude] float NULL,
    [Status] int NOT NULL,
    [AssignedToId] int NULL,
    [CreatedAt] datetime2 NOT NULL,
    [UpdatedAt] datetime2 NOT NULL,
    [ClosedAt] datetime2 NULL,
    CONSTRAINT [PK_IncidentReports] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_IncidentReports_Barangays_BarangayId] FOREIGN KEY ([BarangayId]) REFERENCES [Barangays] ([Id]) ON DELETE NO ACTION,
    CONSTRAINT [FK_IncidentReports_Users_AssignedToId] FOREIGN KEY ([AssignedToId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION,
    CONSTRAINT [FK_IncidentReports_Users_ReporterId] FOREIGN KEY ([ReporterId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
);
GO


CREATE TABLE [Notifications] (
    [Id] int NOT NULL IDENTITY,
    [UserId] int NOT NULL,
    [Title] nvarchar(200) NOT NULL,
    [Message] nvarchar(2000) NOT NULL,
    [Type] int NOT NULL,
    [Link] nvarchar(200) NULL,
    [IsRead] bit NOT NULL,
    [CreatedAt] datetime2 NOT NULL,
    CONSTRAINT [PK_Notifications] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_Notifications_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([Id]) ON DELETE CASCADE
);
GO


CREATE TABLE [UserSessions] (
    [Id] nvarchar(64) NOT NULL,
    [UserId] int NOT NULL,
    [CreatedAt] datetime2 NOT NULL,
    [ExpiresAt] datetime2 NOT NULL,
    [RevokedAt] datetime2 NULL,
    [UserAgent] nvarchar(256) NULL,
    CONSTRAINT [PK_UserSessions] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_UserSessions_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([Id]) ON DELETE CASCADE
);
GO


CREATE TABLE [Alerts] (
    [Id] int NOT NULL IDENTITY,
    [Title] nvarchar(150) NOT NULL,
    [Message] nvarchar(2000) NOT NULL,
    [Instructions] nvarchar(4000) NULL,
    [Type] int NOT NULL,
    [Severity] int NOT NULL,
    [IssuedById] int NOT NULL,
    [IssuedAt] datetime2 NOT NULL,
    [ExpiresAt] datetime2 NULL,
    [LiftedAt] datetime2 NULL,
    [ReportId] int NULL,
    CONSTRAINT [PK_Alerts] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_Alerts_IncidentReports_ReportId] FOREIGN KEY ([ReportId]) REFERENCES [IncidentReports] ([Id]) ON DELETE SET NULL,
    CONSTRAINT [FK_Alerts_Users_IssuedById] FOREIGN KEY ([IssuedById]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
);
GO


CREATE TABLE [ReportUpdates] (
    [Id] int NOT NULL IDENTITY,
    [ReportId] int NOT NULL,
    [UserId] int NOT NULL,
    [Status] int NULL,
    [Note] nvarchar(1000) NULL,
    [CreatedAt] datetime2 NOT NULL,
    CONSTRAINT [PK_ReportUpdates] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_ReportUpdates_IncidentReports_ReportId] FOREIGN KEY ([ReportId]) REFERENCES [IncidentReports] ([Id]) ON DELETE CASCADE,
    CONSTRAINT [FK_ReportUpdates_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
);
GO


CREATE TABLE [AlertBarangays] (
    [AlertId] int NOT NULL,
    [BarangaysId] int NOT NULL,
    CONSTRAINT [PK_AlertBarangays] PRIMARY KEY ([AlertId], [BarangaysId]),
    CONSTRAINT [FK_AlertBarangays_Alerts_AlertId] FOREIGN KEY ([AlertId]) REFERENCES [Alerts] ([Id]) ON DELETE CASCADE,
    CONSTRAINT [FK_AlertBarangays_Barangays_BarangaysId] FOREIGN KEY ([BarangaysId]) REFERENCES [Barangays] ([Id]) ON DELETE CASCADE
);
GO


CREATE INDEX [IX_AlertBarangays_BarangaysId] ON [AlertBarangays] ([BarangaysId]);
GO


CREATE INDEX [IX_Alerts_IssuedAt] ON [Alerts] ([IssuedAt]);
GO


CREATE INDEX [IX_Alerts_IssuedById] ON [Alerts] ([IssuedById]);
GO


CREATE INDEX [IX_Alerts_ReportId] ON [Alerts] ([ReportId]);
GO


CREATE UNIQUE INDEX [IX_Barangays_Name] ON [Barangays] ([Name]);
GO


CREATE INDEX [IX_EvacuationCenters_BarangayId] ON [EvacuationCenters] ([BarangayId]);
GO


CREATE INDEX [IX_IncidentReports_AssignedToId] ON [IncidentReports] ([AssignedToId]);
GO


CREATE INDEX [IX_IncidentReports_BarangayId] ON [IncidentReports] ([BarangayId]);
GO


CREATE INDEX [IX_IncidentReports_CreatedAt] ON [IncidentReports] ([CreatedAt]);
GO


CREATE INDEX [IX_IncidentReports_ReporterId] ON [IncidentReports] ([ReporterId]);
GO


CREATE INDEX [IX_IncidentReports_Status] ON [IncidentReports] ([Status]);
GO


CREATE INDEX [IX_Notifications_UserId_IsRead] ON [Notifications] ([UserId], [IsRead]);
GO


CREATE INDEX [IX_ReportUpdates_ReportId] ON [ReportUpdates] ([ReportId]);
GO


CREATE INDEX [IX_ReportUpdates_UserId] ON [ReportUpdates] ([UserId]);
GO


CREATE INDEX [IX_Users_BarangayId] ON [Users] ([BarangayId]);
GO


CREATE UNIQUE INDEX [IX_Users_Email] ON [Users] ([Email]);
GO


CREATE INDEX [IX_UserSessions_UserId] ON [UserSessions] ([UserId]);
GO


