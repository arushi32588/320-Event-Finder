import type { Event } from '@/lib/events';

// Placeholder events served while Supabase isn't configured, so the frontend
// can call the API before anyone has database keys. Same data as the
// frontend's src/data/events.js.
export const sampleEvents: Event[] = [
  {
    id: '1',
    title: 'Community Outdoor Movie Night',
    description:
      'Bring a blanket or lawn chair for a family-friendly film on the big screen at the Town Common. ' +
      'The event is outdoors on flat, paved paths with accessible seating near the front. ' +
      'The PVTA 30 and 31 buses stop one block away, and free parking is available on Boltwood Ave. ' +
      'Questions? Contact the organizers at events@amherstcommunity.org.',
    location: 'Amherst Town Common',
    startsAt: '2026-10-16T23:00:00Z',
    endsAt: '2026-10-17T01:30:00Z',
    organizer: 'Amherst Community Group',
    verified: true,
    price: 'Free',
    ages: 'All ages',
    accessibility: 'Wheelchair accessible',
    transportation: 'Bus / Walk / Parking',
    imageUrl: null,
  },
  {
    id: '2',
    title: 'Fall Career Fair',
    description: 'Meet employers recruiting for internships and full-time roles.',
    location: 'Campus Center Auditorium',
    startsAt: '2026-10-15T15:00:00Z',
    endsAt: '2026-10-15T19:00:00Z',
    organizer: 'Career Services',
    verified: true,
    price: 'Free',
    ages: 'Students & alumni',
    accessibility: 'Wheelchair accessible',
    transportation: 'Bus / Walk',
    imageUrl: null,
  },
  {
    id: '3',
    title: 'Hack Night',
    description: 'Bring a project or find a team. Snacks provided.',
    location: 'Computer Science Building, Room 150',
    startsAt: '2026-10-17T22:00:00Z',
    endsAt: '2026-10-18T02:00:00Z',
    organizer: 'Hack Club',
    verified: false,
    price: 'Free',
    ages: '18+',
    accessibility: null,
    transportation: 'Walk / Bus',
    imageUrl: null,
  },
];
