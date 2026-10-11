// Mock events until the frontend is wired to /api/events/:id.
// Fields mirror backend/src/data/sample-events.ts plus the wireframe's extras
// (imageUrl, price, ages, verified, accessibility, transportation).
export const events = [
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
    price: 'Free',
    ages: 'All ages',
    verified: true,
    accessibility: 'Wheelchair accessible',
    transportation: 'Bus / Walk / Parking',
  },
  {
    id: '2',
    title: 'Fall Career Fair',
    description: 'Meet employers recruiting for internships and full-time roles.',
    location: 'Campus Center Auditorium',
    startsAt: '2026-10-15T15:00:00Z',
    endsAt: '2026-10-15T19:00:00Z',
    organizer: 'Career Services',
    price: 'Free',
    ages: 'Students & alumni',
    verified: true,
    accessibility: 'Wheelchair accessible',
    transportation: 'Bus / Walk',
  },
  {
    id: '3',
    title: 'Hack Night',
    description: 'Bring a project or find a team. Snacks provided.',
    location: 'Computer Science Building, Room 150',
    startsAt: '2026-10-17T22:00:00Z',
    endsAt: '2026-10-18T02:00:00Z',
    organizer: 'Hack Club',
    price: 'Free',
    ages: '18+',
    verified: false,
    transportation: 'Walk / Bus',
  },
];

export function getEventById(id) {
  return events.find((event) => event.id === id);
}
