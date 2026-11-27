// Sample users until the backend has GET /api/admin/users
// Fields: id, name, email, role (attendee | organizer | admin),
// organizerStatus (none | pending | approved | rejected), joinedAt

export const sampleUsers = [
    { id: 'u-1', name: 'Maya Fox', email: 'maya@example.org', role: 'attendee', organizerStatus: 'none', joinedAt: '2026-09-04T15:00:00Z' },
    { id: 'u-2', name: 'Dana Whitfield', email: 'dana@amherstjazz.example.org', role: 'organizer', organizerStatus: 'approved', joinedAt: '2026-09-12T18:30:00Z' },
    { id: 'u-3', name: 'Sam Lee', email: 'sam@pvfoodshare.example.org', role: 'attendee', organizerStatus: 'pending', joinedAt: '2026-10-02T14:10:00Z' },
    { id: 'u-4', name: 'Jordan Lee', email: 'jordan@example.org', role: 'attendee', organizerStatus: 'rejected', joinedAt: '2026-10-09T20:45:00Z' },
    { id: 'u-5', name: 'Priya Shah', email: 'priya@example.org', role: 'attendee', organizerStatus: 'none', joinedAt: '2026-10-21T16:00:00Z' },
    { id: 'u-6', name: 'Alex Rivera', email: 'alex@example.org', role: 'admin', organizerStatus: 'none', joinedAt: '2026-08-28T12:00:00Z' },
  ];