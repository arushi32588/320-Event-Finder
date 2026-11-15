// Sample imported events until the backend has GET /api/admin/imported-events
// Fields: the usual event fields plus where the event came from

export const sampleImport = {
  lastImportedAt: "2026-11-12T20:00:00Z",
  events: [
    {
      id: "imp-1",
      title: "Fall Choir Concert",
      startsAt: "2026-11-20T00:00:00Z",
      location: "Bezanson Recital Hall",
      sourceName: "UMass Events Calendar",
      sourceUrl: "https://www.umass.edu/events",
      importedAt: "2026-11-12T20:00:00Z",
      status: "pending",
    },
    {
      id: "imp-2",
      title: "Winter Farmers Market",
      startsAt: "2026-11-22T15:00:00Z",
      location: "Amherst Regional Middle School",
      sourceName: "Town of Amherst",
      sourceUrl: "https://www.amherstma.gov",
      importedAt: "2026-11-12T20:00:00Z",
      status: "pending",
    },
    {
      id: "imp-3",
      title: "Open Mic Night",
      startsAt: "2026-11-19T23:30:00Z",
      location: "Jones Library",
      sourceName: "Jones Library",
      sourceUrl: "https://www.joneslibrary.org",
      importedAt: "2026-11-11T20:00:00Z",
      status: "approved",
    },
  ],
};
