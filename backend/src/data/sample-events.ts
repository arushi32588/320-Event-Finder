// Placeholder data until the Supabase events table exists (Sprint 2 schema task).
export type Event = {
  id: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  organizer: string;
};

export const sampleEvents: Event[] = [
  {
    id: '1',
    title: 'Fall Career Fair',
    description: 'Meet employers recruiting for internships and full-time roles.',
    location: 'Campus Center Auditorium',
    startsAt: '2026-10-15T15:00:00Z',
    endsAt: '2026-10-15T19:00:00Z',
    organizer: 'Career Services',
  },
  {
    id: '2',
    title: 'Hack Night',
    description: 'Bring a project or find a team. Snacks provided.',
    location: 'Computer Science Building, Room 150',
    startsAt: '2026-10-17T22:00:00Z',
    endsAt: '2026-10-18T02:00:00Z',
    organizer: 'Hack Club',
  },
  {
    id: '3',
    title: 'Intramural Soccer Signups',
    description: 'Register your team for the fall intramural league.',
    location: 'Recreation Center',
    startsAt: '2026-10-20T20:00:00Z',
    endsAt: '2026-10-20T22:00:00Z',
    organizer: 'Campus Recreation',
  },
];
