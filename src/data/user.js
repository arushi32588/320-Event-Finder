// Fake data for profile page until the frontend is wired to api
// Fields reflect the backend account type
// (name, email, role) + the profile wireframes
// null - has not applied yet
// pending - request sent, waiting for an admin
// approved - verified organizer
// rejected - request was not approved, can apply again

export const currentUser = {
  id: "demo-user",
  name: "Maya Fox",
  email: "mfox@umass.edu",
  role: "attendee",
  preferences: ["Music", "Free events", "Accessible"],
  organizerStatus: null,
  savedEventIds: ["1", "2", "3"],
  pastEvents: [
    {
      id: "past-1",
      title: "Welcome Week Block Party",
      startsAt: "2026-09-05T22:00:00Z",
      location: "Southwest Residential Area",
    },
  ],
};
