using Dans.Api.Dtos;
using Dans.Api.Infrastructure;
using Dans.Api.Models;
using System.Data.Common;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Dans.Api.Data;

/// <summary>
/// Fills an empty database with reference data (barangays, safety guides, hotlines), the first administrator
/// account and — when "Seed:DemoData" is true — sample users, reports, alerts and evacuation centers.
/// </summary>
public static class DbSeeder
{
    public const string DemoPassword = "Demo@123";

    /// <summary>Estimated evacuees per classroom: a 7 m x 9 m (63 m²) DepEd classroom at 3.5 m² per person (Sphere minimum).</summary>
    private const int PeoplePerClassroom = 18;

    /// <summary>Barangays of the Municipality of Compostela, Davao de Oro. Administrators can edit this list in the app.</summary>
    private static readonly string[] BarangayNames =
    [
        "Aurora", "Bagongon", "Gabi", "Lagab", "Mangayon", "Mapaca", "Maparat", "New Alegria",
        "Ngan", "Osmeña", "Panansalan", "Poblacion", "San Jose", "San Miguel", "Siocon", "Tamia",
    ];

    /// <summary>
    /// Creates the database if needed and applies the schema upgrades in <see cref="SchemaUpgrades"/>.
    /// In Development, a database from a much older version of DANS that cannot be upgraded
    /// (missing tables) is rebuilt automatically, because it only holds demo data.
    /// </summary>
    public static async Task EnsureDatabaseAsync(AppDbContext db, IHostEnvironment environment, ILogger logger)
    {
        await db.Database.EnsureCreatedAsync();
        await SchemaUpgrades.ApplyAsync(db, logger);
        if (!environment.IsDevelopment() || await SchemaIsCurrentAsync(db)) return;

        logger.LogWarning("The development database was created by an older version of DANS and is being rebuilt with fresh demo data.");
        await db.Database.EnsureDeletedAsync();
        await db.Database.EnsureCreatedAsync();
    }

    private static async Task<bool> SchemaIsCurrentAsync(AppDbContext db)
    {
        try
        {
            await db.Users.OrderBy(u => u.Id).Select(u => new { u.FailedLoginCount, u.LockoutEndsAt, u.PrivacyConsentAt }).FirstOrDefaultAsync();
            await db.Sessions.OrderBy(s => s.Id).Select(s => s.Id).FirstOrDefaultAsync();
            return true;
        }
        catch (DbException)
        {
            return false;
        }
    }

    public static async Task SeedAsync(AppDbContext db, IPasswordHasher<User> hasher, IConfiguration config,
        IHostEnvironment environment, ILogger logger)
    {
        if (!await db.Barangays.AnyAsync())
        {
            db.Barangays.AddRange(BarangayNames.Select(name => new Barangay { Name = name }));
            await db.SaveChangesAsync();
        }

        if (!await db.SafetyGuides.AnyAsync())
        {
            db.SafetyGuides.AddRange(SafetyGuides());
            await db.SaveChangesAsync();
        }

        if (!await db.EmergencyContacts.AnyAsync())
        {
            db.EmergencyContacts.AddRange(
                new EmergencyContact
                {
                    Name = "National Emergency Hotline", Number = "911", SortOrder = 1,
                    Description = "Police, fire and medical emergencies anywhere in the Philippines.",
                },
                new EmergencyContact
                {
                    Name = "Philippine Red Cross", Number = "143", SortOrder = 2,
                    Description = "Rescue, ambulance and blood services.",
                });
            await db.SaveChangesAsync();
        }

        if (await db.Users.AnyAsync()) return;

        var barangayIds = await db.Barangays.ToDictionaryAsync(b => b.Name, b => b.Id);
        int BarangayId(string name) => barangayIds.TryGetValue(name, out var id) ? id : barangayIds.Values.First();

        // Outside Development the first administrator needs a strong password from configuration
        // (for example the Seed__AdminPassword environment variable) — never a default one.
        var adminPassword = config["Seed:AdminPassword"];
        if (string.IsNullOrWhiteSpace(adminPassword))
            throw new InvalidOperationException(
                "Seed:AdminPassword is not set. Set it (e.g. with the Seed__AdminPassword environment variable) to create the first administrator.");
        if (!environment.IsDevelopment() && PasswordPolicy.Validate(adminPassword) is { } passwordError)
            throw new InvalidOperationException($"Seed:AdminPassword is too weak for production. {passwordError}");

        var admin = NewUser(hasher, "System Administrator", config["Seed:AdminEmail"] ?? "admin@dans.local", "09000000000",
            UserRole.Admin, BarangayId("Poblacion"), adminPassword);
        db.Users.Add(admin);
        await db.SaveChangesAsync();
        logger.LogInformation("Created administrator account {Email}. Change its password after signing in.", admin.Email);

        if (config.GetValue<bool>("Seed:DemoData"))
        {
            await SeedDemoDataAsync(db, hasher, BarangayId);
            logger.LogInformation("Added demo data. Demo accounts use the password {Password}.", DemoPassword);
        }
    }

    private static User NewUser(IPasswordHasher<User> hasher, string name, string email, string phone, UserRole role,
        int barangayId, string password, string? address = null)
    {
        var user = new User
        {
            FullName = name,
            Email = Text.NormalizeEmail(email),
            PhoneNumber = phone,
            Role = role,
            BarangayId = barangayId,
            Address = address,
        };
        user.PasswordHash = hasher.HashPassword(user, password);
        return user;
    }

    private static async Task SeedDemoDataAsync(AppDbContext db, IPasswordHasher<User> hasher, Func<string, int> barangayId)
    {
        var now = DateTime.UtcNow;

        var official = NewUser(hasher, "Maria Santos", "official@dans.local", "09000000001", UserRole.Official, barangayId("Poblacion"), DemoPassword);
        var responder = NewUser(hasher, "Pedro Reyes", "responder@dans.local", "09000000002", UserRole.Responder, barangayId("Poblacion"), DemoPassword);
        var volunteer = NewUser(hasher, "Ana Garcia", "volunteer@dans.local", "09000000003", UserRole.Volunteer, barangayId("Ngan"), DemoPassword);
        var resident = NewUser(hasher, "Juan Dela Cruz", "resident@dans.local", "09000000004", UserRole.Resident, barangayId("Poblacion"), DemoPassword, "Purok 2");
        db.Users.AddRange(official, responder, volunteer, resident);

        // Evacuation sites: the public schools of Compostela (schools are the usual evacuation centers in the Philippines),
        // at least one in each of the 16 barangays.
        // - Locations: the school grounds as mapped on OpenStreetMap (© OpenStreetMap contributors, ODbL), retrieved 2026-11-21.
        // - Barangays and classroom counts: DepEd school data, SY 2024-25 (teacherph.com school directory).
        // - Capacity is an ESTIMATE: classrooms x 18 people (a 7 m x 9 m DepEd classroom / 3.5 m² per person, the Sphere
        //   humanitarian minimum). The MDRRMO's official list and capacities should replace these when available.
        // - Status, occupancy and contact persons are demo values for the presentation scenario.
        EvacuationCenter School(string name, string barangay, string address, int classrooms, double lat, double lng,
            CenterStatus status = CenterStatus.Closed, int occupancy = 0, User? contact = null) => new()
        {
            Name = name, BarangayId = barangayId(barangay), Address = address,
            Capacity = classrooms * PeoplePerClassroom, CurrentOccupancy = occupancy, Status = status,
            ContactPerson = contact?.FullName, ContactNumber = contact?.PhoneNumber,
            Facilities = "Classrooms, Toilets", Latitude = lat, Longitude = lng,
        };

        db.EvacuationCenters.AddRange(
            School("Compostela Central Elementary School", "Poblacion", "School grounds", 101, 7.671825, 126.089522, CenterStatus.Open, 126, official),
            School("Compostela National High School", "Poblacion", "School grounds", 136, 7.669093, 126.091349, CenterStatus.Open, 310, responder),
            School("Aurora Elementary School", "Aurora", "School grounds", 7, 7.657362, 126.047783),
            School("Bagongon Elementary School", "Bagongon", "School grounds", 9, 7.707682, 126.066850),
            School("Gabi Elementary School", "Gabi", "School grounds", 15, 7.607001, 126.058300),
            School("Gabi National High School", "Gabi", "School grounds", 46, 7.609566, 126.059232),
            School("Lagab Elementary School", "Lagab", "School grounds", 5, 7.668906, 126.064221),
            School("Mangayon Elementary School", "Mangayon", "School grounds", 21, 7.714233, 126.105508),
            School("Mangayon National High School", "Mangayon", "School grounds", 23, 7.705872, 126.108467),
            School("Mapaca Elementary School", "Mapaca", "School grounds", 8, 7.716919, 126.049442),
            School("Maparat Elementary School", "Maparat", "School grounds", 31, 7.683738, 126.044960),
            School("Maparat National High School", "Maparat", "School grounds", 34, 7.683142, 126.047983),
            School("New Alegria Elementary School", "New Alegria", "School grounds", 10, 7.631827, 126.066876),
            School("Ngan Elementary School", "Ngan", "School grounds", 4, 7.683533, 126.112230, CenterStatus.Full, 72, volunteer),
            School("Mambusao Elementary School", "Ngan", "School grounds, Sitio Mambusao", 8, 7.682609, 126.130936),
            School("T.H. Valderrama Elementary School", "Ngan", "School grounds", 17, 7.694317, 126.133354),
            School("Consuelo M. Valderrama National High School", "Ngan", "School grounds", 17, 7.694992, 126.132869, CenterStatus.Open, 35),
            School("Bongkilaton Integrated School", "Ngan", "School grounds, Sitio Bongkilaton", 7, 7.702462, 126.147423),
            School("Bango Elementary School", "Ngan", "School grounds, Sitio Bango", 11, 7.680616, 126.189197),
            School("Bango National High School", "Ngan", "School grounds, Sitio Bango", 14, 7.682265, 126.189840),
            School("Osmeña Elementary School", "Osmeña", "School grounds", 17, 7.665121, 126.103688),
            School("Panansalan Integrated School", "Panansalan", "School grounds", 8, 7.656525, 126.259327),
            School("Lower Panansalan Elementary School", "Panansalan", "School grounds, Lower Panansalan", 7, 7.612388, 126.293090),
            School("San Jose Elementary School", "San Jose", "School grounds", 20, 7.648373, 126.074227),
            School("San Miguel Elementary School", "San Miguel", "School grounds", 18, 7.640339, 126.122238),
            School("San Miguel National High School", "San Miguel", "School grounds", 25, 7.639807, 126.123726, CenterStatus.Open, 42),
            School("Siocon Elementary School", "Siocon", "School grounds", 17, 7.644117, 126.037339),
            School("Siocon National High School", "Siocon", "School grounds", 18, 7.644278, 126.035090),
            School("Tamia Elementary School", "Tamia", "School grounds", 8, 7.698521, 126.098469));

        await db.SaveChangesAsync(); // assigns the user ids used below

        IncidentReport Report(User reporter, DisasterType type, SeverityLevel severity, string barangay, string location,
            string description, int? people, double hoursAgo, double? lat = null, double? lng = null) => new()
        {
            ReporterId = reporter.Id, Type = type, Severity = severity, BarangayId = barangayId(barangay),
            Location = location, Description = description, PeopleAffected = people, Latitude = lat, Longitude = lng,
            CreatedAt = now.AddHours(-hoursAgo), UpdatedAt = now.AddHours(-hoursAgo),
        };
        ReportUpdate Update(User user, double hoursAgo, string note, ReportStatus? status = null) =>
            new() { UserId = user.Id, Status = status, Note = note, CreatedAt = now.AddHours(-hoursAgo) };

        var flood = Report(resident, DisasterType.Flood, SeverityLevel.High, "Poblacion", "Purok 3, near the riverbank",
            "The river is rising fast and water has reached the houses along the riverbank. Several families need help moving to higher ground.",
            25, 3, 7.6683, 126.0915);
        flood.Status = ReportStatus.Responding;
        flood.AssignedToId = responder.Id;
        flood.UpdatedAt = now.AddHours(-2);
        flood.Updates.AddRange([
            Update(resident, 3, "Report submitted.", ReportStatus.Pending),
            Update(official, 2.8, "Confirmed by the barangay tanod on site.", ReportStatus.Verified),
            Update(official, 2.7, $"Assigned to {responder.FullName} (Responder)."),
            Update(responder, 2, "Rescue team deployed with a rubber boat.", ReportStatus.Responding),
        ]);

        var landslide = Report(volunteer, DisasterType.Landslide, SeverityLevel.Moderate, "Ngan", "Barangay road going to the upper purok",
            "Soil and rocks fell on the road after the heavy rain. Cracks are visible on the slope above two houses.", 8, 0.7);
        landslide.Updates.Add(Update(volunteer, 0.7, "Report submitted.", ReportStatus.Pending));

        var tree = Report(resident, DisasterType.Typhoon, SeverityLevel.Low, "San Miguel", "National highway near the waiting shed",
            "A big tree fell across one lane of the highway because of strong winds. Vehicles are passing slowly on the other lane.", null, 1.2);
        tree.Status = ReportStatus.Verified;
        tree.UpdatedAt = now.AddHours(-1);
        tree.Updates.AddRange([
            Update(resident, 1.2, "Report submitted.", ReportStatus.Pending),
            Update(official, 1, "Road clearing team informed.", ReportStatus.Verified),
        ]);

        var fire = Report(resident, DisasterType.Fire, SeverityLevel.High, "San Jose", "Residential area near the chapel",
            "A house is on fire. Neighbors are trying to put it out with buckets of water.", 6, 50);
        fire.Status = ReportStatus.Resolved;
        fire.AssignedToId = responder.Id;
        fire.UpdatedAt = now.AddHours(-48);
        fire.ClosedAt = fire.UpdatedAt;
        fire.Updates.AddRange([
            Update(resident, 50, "Report submitted.", ReportStatus.Pending),
            Update(official, 49.9, "Verified through a call to the barangay.", ReportStatus.Verified),
            Update(official, 49.9, $"Assigned to {responder.FullName} (Responder)."),
            Update(responder, 49.7, "Fire truck dispatched together with the BFP.", ReportStatus.Responding),
            Update(responder, 48, "Fire put out. No injuries; one house partially damaged.", ReportStatus.Resolved),
        ]);

        var medical = Report(resident, DisasterType.Medical, SeverityLevel.Moderate, "Poblacion", "Public market entrance",
            "An elderly man collapsed near the public market and needs medical help.", 1, 120);
        medical.Status = ReportStatus.Dismissed;
        medical.UpdatedAt = now.AddHours(-119);
        medical.ClosedAt = medical.UpdatedAt;
        medical.Updates.AddRange([
            Update(resident, 120, "Report submitted.", ReportStatus.Pending),
            Update(official, 119, "Duplicate: already handled through a 911 call.", ReportStatus.Dismissed),
        ]);

        db.Reports.AddRange(flood, landslide, tree, fire, medical);

        var targetBarangays = await db.Barangays
            .Where(b => b.Name == "Poblacion" || b.Name == "San Miguel" || b.Name == "Ngan")
            .ToListAsync();
        db.Alerts.AddRange(
            new Alert
            {
                Title = "Heavy Rainfall Warning",
                Message = "Continuous heavy rain is expected over the next 24 hours. Rivers and creeks may overflow. " +
                          "Residents in low-lying and riverside areas should prepare to evacuate.",
                Instructions = "Prepare your go-bag and important documents.\n" +
                               "Move to the nearest open evacuation center if water starts to rise.\n" +
                               "Do not cross flooded roads, rivers or creeks.\n" +
                               "Keep your phone charged and watch DANS for updates.",
                Type = DisasterType.Flood, Severity = SeverityLevel.High, IssuedById = official.Id,
                IssuedAt = now.AddHours(-2), ExpiresAt = now.AddHours(22), Barangays = targetBarangays,
            },
            new Alert
            {
                Title = "Nationwide Simultaneous Earthquake Drill",
                Message = "An earthquake drill will be held in schools, offices and barangay halls. This is only a drill.",
                Instructions = "When you hear the alarm: DROP, COVER and HOLD ON.\nWait for the signal, then walk calmly to the open evacuation area.",
                Type = DisasterType.Earthquake, Severity = SeverityLevel.Low, IssuedById = official.Id,
                IssuedAt = now.AddDays(-6), ExpiresAt = now.AddDays(-5),
            });

        await db.SaveChangesAsync();

        db.Notifications.AddRange(
            new Notification
            {
                UserId = resident.Id, Type = NotificationType.Alert, Link = "/alerts", CreatedAt = now.AddHours(-2),
                Title = "HIGH ALERT: Heavy Rainfall Warning",
                Message = "Continuous heavy rain is expected over the next 24 hours. Rivers and creeks may overflow.",
            },
            new Notification
            {
                UserId = resident.Id, Type = NotificationType.Report, Link = $"/reports/{flood.Id}", CreatedAt = now.AddHours(-2),
                Title = $"Update on your report {Mappings.ReferenceNo(flood.Id, flood.CreatedAt)}",
                Message = "Responders are now attending to your report. Note: Rescue team deployed with a rubber boat.",
            });
        await db.SaveChangesAsync();
    }

    /// <summary>General preparedness advice based on public guidance from NDRRMC, PHIVOLCS, PAGASA and the BFP.</summary>
    private static IEnumerable<SafetyGuide> SafetyGuides() =>
    [
        new SafetyGuide
        {
            Type = DisasterType.Flood,
            Title = "Flood Safety",
            Summary = "Floods are the most common hazard during the rainy season. Flash floods can happen within minutes of heavy rain, especially near rivers, creeks and low-lying areas.",
            BeforeTips = Text.JoinLines([
                "Find out if your home is in a flood-prone or low-lying area and know the way to the nearest evacuation center.",
                "Prepare a go-bag: drinking water, ready-to-eat food, flashlight, radio, extra batteries, first-aid kit, medicines and important documents in a waterproof bag.",
                "Monitor PAGASA rainfall advisories and announcements from your barangay and the MDRRMO.",
                "Move appliances, valuables and documents to a higher place.",
                "Keep your mobile phone and power banks charged.",
            ]),
            DuringTips = Text.JoinLines([
                "Evacuate immediately when told to by authorities. Do not wait for the water to rise.",
                "Turn off the main power switch and close the gas tank before leaving your home.",
                "Never walk, swim or drive through flood water. Fast-moving water only ankle-deep can knock you down, and knee-deep water can sweep a car away.",
                "Stay away from rivers, creeks, drainage canals and fallen power lines.",
                "If you are trapped, go to the highest floor or the roof and signal for help.",
            ]),
            AfterTips = Text.JoinLines([
                "Return home only when authorities say it is safe.",
                "Avoid wading in floodwater. It can be contaminated and cause leptospirosis; see a doctor if you were exposed.",
                "Do not use wet electrical appliances until they are checked by an electrician.",
                "Boil drinking water or use bottled water until the supply is declared safe.",
                "Clean and disinfect everything that got wet and throw away food that touched floodwater.",
            ]),
        },
        new SafetyGuide
        {
            Type = DisasterType.Earthquake,
            Title = "Earthquake Safety",
            Summary = "Earthquakes strike without warning. Knowing what to do in the first seconds can save your life. Remember: DROP, COVER and HOLD ON.",
            BeforeTips = Text.JoinLines([
                "Secure heavy furniture, cabinets and appliances to the wall and keep heavy items on lower shelves.",
                "Identify safe spots in each room, such as under a sturdy table and away from windows.",
                "Prepare a go-bag and agree on a family meeting place.",
                "Join earthquake drills at school, at work and in your community.",
                "Learn how to turn off the electricity, water and gas in your home.",
            ]),
            DuringTips = Text.JoinLines([
                "DROP to the ground, take COVER under a sturdy table, and HOLD ON until the shaking stops.",
                "Stay away from windows, glass, hanging objects and tall furniture.",
                "If you are outdoors, go to an open area away from buildings, trees, posts and power lines.",
                "If you are driving, pull over away from bridges and overpasses and stay inside the vehicle.",
                "Do not use elevators and do not run outside while the ground is shaking.",
            ]),
            AfterTips = Text.JoinLines([
                "Expect aftershocks. DROP, COVER and HOLD ON each time.",
                "Check yourself and others for injuries and give first aid.",
                "Leave damaged buildings calmly using the stairs.",
                "Check for gas leaks, fire and electrical damage. Do not light matches if you smell gas.",
                "Stay away from slopes and riverbanks; earthquakes can trigger landslides.",
                "Follow updates from PHIVOLCS and local authorities.",
            ]),
        },
        new SafetyGuide
        {
            Type = DisasterType.Landslide,
            Title = "Landslide Safety",
            Summary = "Landslides often follow days of heavy rain or strong earthquakes, especially in mountainous barangays and on steep or quarried slopes.",
            BeforeTips = Text.JoinLines([
                "Know if your home is on or near a steep slope, at the foot of a mountain, or near a river channel.",
                "Watch for warning signs: new cracks in the ground or walls, tilting trees or posts, sudden muddy water in streams, and rumbling sounds.",
                "Plan an evacuation route to higher, stable ground away from the slope.",
                "Report ground cracks or slope movement to your barangay right away.",
            ]),
            DuringTips = Text.JoinLines([
                "Evacuate immediately if you notice warning signs or if authorities order an evacuation.",
                "Move out of the path of the slide, to the side and not downhill.",
                "Stay alert at night during heavy rain; many deadly landslides happen while people are asleep.",
                "If escape is impossible, curl into a tight ball and protect your head.",
            ]),
            AfterTips = Text.JoinLines([
                "Stay away from the slide area because more slides may follow.",
                "Look for injured or trapped people near the slide without entering it, and call for help.",
                "Watch out for flooding, which can follow a landslide.",
                "Report broken utility lines and damaged roads to the authorities.",
            ]),
        },
        new SafetyGuide
        {
            Type = DisasterType.Fire,
            Title = "Fire Safety",
            Summary = "Most home fires start from faulty electrical wiring, unattended cooking, candles and cigarettes. A small fire can become deadly in minutes.",
            BeforeTips = Text.JoinLines([
                "Do not overload outlets, replace damaged wires, and unplug appliances that are not in use.",
                "Never leave cooking, candles or mosquito coils unattended.",
                "Keep a fire extinguisher and learn how to use it: Pull, Aim, Squeeze, Sweep.",
                "Install smoke alarms and plan two ways out of every room.",
                "Keep matches and lighters away from children.",
            ]),
            DuringTips = Text.JoinLines([
                "Shout \"Fire!\" to warn everyone, get out immediately, then call 911 or the fire station.",
                "Stay low under the smoke and cover your nose and mouth with a wet cloth.",
                "Touch doors before opening them. If a door is hot, use another way out.",
                "If your clothes catch fire: STOP, DROP and ROLL.",
                "Never go back inside a burning building.",
            ]),
            AfterTips = Text.JoinLines([
                "Do not enter the burned building until firefighters say it is safe.",
                "Get treatment for burns and smoke inhalation.",
                "Ask your barangay or the MSWDO for assistance if your home was damaged.",
            ]),
        },
        new SafetyGuide
        {
            Type = DisasterType.Typhoon,
            Title = "Typhoon Safety",
            Summary = "Typhoons bring strong winds, heavy rain, floods and landslides. Follow PAGASA Tropical Cyclone Wind Signals and evacuation orders from local officials.",
            BeforeTips = Text.JoinLines([
                "Monitor PAGASA bulletins and Tropical Cyclone Wind Signals on radio, TV or official pages.",
                "Reinforce your roof, windows and doors, and trim tree branches near your house.",
                "Prepare a go-bag with food, water, medicines, flashlight, radio, power bank and documents.",
                "Know your evacuation center and evacuate early if you live in a flood- or landslide-prone area.",
                "Bring inside or tie down loose objects that strong winds can blow away.",
            ]),
            DuringTips = Text.JoinLines([
                "Stay indoors and away from windows and glass doors.",
                "Keep your radio or phone on for updates and evacuation orders.",
                "Turn off the electricity and gas if flooding is expected or authorities advise it.",
                "Do not go out when the wind calms down; it may be the eye of the typhoon and strong winds will return.",
                "Evacuate immediately when ordered.",
            ]),
            AfterTips = Text.JoinLines([
                "Wait for the official all-clear before going outside.",
                "Stay away from fallen power lines, damaged buildings and flooded areas.",
                "Check your home for damage and report hazards to your barangay.",
                "Boil drinking water and watch out for illnesses spread by floodwater.",
            ]),
        },
    ];
}
