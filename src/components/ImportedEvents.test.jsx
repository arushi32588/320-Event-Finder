import { afterEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ImportedEvents from "./ImportedEvents.jsx";
import AdminDashboard from "../pages/AdminDashboard.jsx";
import { RequireAuth } from "../lib/auth.jsx";
import {
  fail,
  loggedInRoutes,
  mockApi,
  renderPage,
  resetApi,
} from "../test/api.jsx";

const imported = [
  {
    id: "a1",
    title: "Fall Choir Concert",
    startsAt: "2026-11-20T00:00:00Z",
    location: "Bezanson Hall",
    sourceName: "UMass Events Calendar",
    sourceUrl: "https://www.umass.edu/events",
    status: "pending",
  },
  {
    id: "a2",
    title: "Open Mic Night",
    startsAt: "2026-11-19T23:30:00Z",
    location: "Student Union",
    sourceName: "Town of Amherst",
    sourceUrl: null,
    status: "approved",
  },
];

const withEvents = (overrides = {}) => ({
  "GET /api/admin/imported-events": {
    events: imported,
    lastImportedAt: "2026-11-12T20:00:00Z",
  },
  ...overrides,
});

const rowFor = (title) =>
  screen.getByRole("heading", { level: 3, name: title }).closest("article");

afterEach(resetApi);

describe("ImportedEvents", () => {
  it("lists imported events with their source and status", async () => {
    mockApi(withEvents());
    renderPage(<ImportedEvents />);
    expect(
      await screen.findByRole("heading", {
        level: 3,
        name: "Fall Choir Concert",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/2 imported/)).toHaveTextContent("1 need review");
    expect(
      within(rowFor("Fall Choir Concert")).getByText("Needs review"),
    ).toBeInTheDocument();
    expect(
      within(rowFor("Open Mic Night")).getByText("Published"),
    ).toBeInTheDocument();
  });

  it("links to the original source only when there is a URL", async () => {
    mockApi(withEvents());
    renderPage(<ImportedEvents />);
    await screen.findByRole("heading", {
      level: 3,
      name: "Fall Choir Concert",
    });
    expect(
      within(rowFor("Fall Choir Concert")).getByRole("link", {
        name: "UMass Events Calendar",
      }),
    ).toHaveAttribute("href", "https://www.umass.edu/events");
    expect(
      within(rowFor("Open Mic Night")).queryByRole("link"),
    ).not.toBeInTheDocument();
    expect(
      within(rowFor("Open Mic Night")).getByText(/Town of Amherst/),
    ).toBeInTheDocument();
  });

  it("only offers Publish and Hide on events that need review", async () => {
    mockApi(withEvents());
    renderPage(<ImportedEvents />);
    await screen.findByRole("heading", {
      level: 3,
      name: "Fall Choir Concert",
    });
    expect(
      within(rowFor("Fall Choir Concert")).getByRole("button", {
        name: "Publish",
      }),
    ).toBeInTheDocument();
    expect(
      within(rowFor("Fall Choir Concert")).getByRole("button", {
        name: "Hide",
      }),
    ).toBeInTheDocument();
    expect(
      within(rowFor("Open Mic Night")).queryByRole("button"),
    ).not.toBeInTheDocument();
  });

  it("publishes an event on the server and updates its badge", async () => {
    const { callsTo } = mockApi(
      withEvents({
        "POST /api/admin/events/a1/approve": {
          event: { id: "a1", status: "approved" },
        },
      }),
    );
    const user = userEvent.setup();
    renderPage(<ImportedEvents />);
    await screen.findByRole("heading", {
      level: 3,
      name: "Fall Choir Concert",
    });
    await user.click(
      within(rowFor("Fall Choir Concert")).getByRole("button", {
        name: "Publish",
      }),
    );
    expect(
      await screen.findByText("Published Fall Choir Concert."),
    ).toBeInTheDocument();
    expect(callsTo("POST", "/api/admin/events/a1/approve")).toHaveLength(1);
    expect(
      within(rowFor("Fall Choir Concert")).getByText("Published"),
    ).toBeInTheDocument();
    expect(
      within(rowFor("Fall Choir Concert")).queryByRole("button", {
        name: "Publish",
      }),
    ).not.toBeInTheDocument();
  });

  it("hides an event on the server and updates its badge", async () => {
    const { callsTo } = mockApi(
      withEvents({
        "POST /api/admin/events/a1/reject": {
          event: { id: "a1", status: "rejected" },
        },
      }),
    );
    const user = userEvent.setup();
    renderPage(<ImportedEvents />);
    await screen.findByRole("heading", {
      level: 3,
      name: "Fall Choir Concert",
    });
    await user.click(
      within(rowFor("Fall Choir Concert")).getByRole("button", {
        name: "Hide",
      }),
    );
    expect(
      await screen.findByText("Hid Fall Choir Concert."),
    ).toBeInTheDocument();
    expect(callsTo("POST", "/api/admin/events/a1/reject")).toHaveLength(1);
    expect(
      within(rowFor("Fall Choir Concert")).getByText("Hidden"),
    ).toBeInTheDocument();
  });

  it("keeps the event as it was and explains if publishing fails", async () => {
    mockApi(
      withEvents({
        "POST /api/admin/events/a1/approve": fail(
          500,
          "Could not approve the event.",
        ),
      }),
    );
    const user = userEvent.setup();
    renderPage(<ImportedEvents />);
    await screen.findByRole("heading", {
      level: 3,
      name: "Fall Choir Concert",
    });
    await user.click(
      within(rowFor("Fall Choir Concert")).getByRole("button", {
        name: "Publish",
      }),
    );
    expect(
      await screen.findByText(
        "Could not update Fall Choir Concert: Could not approve the event.",
      ),
    ).toBeInTheDocument();
    expect(
      within(rowFor("Fall Choir Concert")).getByText("Needs review"),
    ).toBeInTheDocument();
  });

  it("Import now shows the new list and how many were added", async () => {
    const { callsTo } = mockApi(
      withEvents({
        "POST /api/admin/import": {
          imported: 1,
          lastImportedAt: "2026-11-13T20:00:00Z",
          events: [
            ...imported,
            {
              id: "a3",
              title: "Poetry Slam",
              startsAt: "2026-11-25T23:00:00Z",
              location: "Library",
              sourceName: "Jones Library",
              sourceUrl: null,
              status: "pending",
            },
          ],
        },
      }),
    );
    const user = userEvent.setup();
    renderPage(<ImportedEvents />);
    await screen.findByRole("heading", {
      level: 3,
      name: "Fall Choir Concert",
    });
    await user.click(screen.getByRole("button", { name: "Import now" }));
    expect(
      await screen.findByRole("heading", { level: 3, name: "Poetry Slam" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Import finished: 1 new events."),
    ).toBeInTheDocument();
    expect(callsTo("POST", "/api/admin/import")).toHaveLength(1);
  });

  it("shows the error and keeps the list if the import fails", async () => {
    mockApi(
      withEvents({
        "POST /api/admin/import": fail(500, "Import failed. Please try again."),
      }),
    );
    const user = userEvent.setup();
    renderPage(<ImportedEvents />);
    await screen.findByRole("heading", {
      level: 3,
      name: "Fall Choir Concert",
    });
    await user.click(screen.getByRole("button", { name: "Import now" }));
    expect(
      await screen.findByText("Import failed. Please try again."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Fall Choir Concert" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import now" })).toBeEnabled();
  });

  it("says the import is not connected yet when the endpoint is missing", async () => {
    mockApi(withEvents({ "POST /api/admin/import": fail(404, "Not found") }));
    const user = userEvent.setup();
    renderPage(<ImportedEvents />);
    await screen.findByRole("heading", {
      level: 3,
      name: "Fall Choir Concert",
    });
    await user.click(screen.getByRole("button", { name: "Import now" }));
    expect(
      await screen.findByText("Import isn't connected to the backend yet."),
    ).toBeInTheDocument();
  });

  it("shows an empty state when nothing has been imported", async () => {
    mockApi({
      "GET /api/admin/imported-events": { events: [], lastImportedAt: null },
    });
    renderPage(<ImportedEvents />);
    expect(
      await screen.findByText(/No imported events yet/),
    ).toBeInTheDocument();
    expect(screen.getByText(/0 imported/)).toBeInTheDocument();
    expect(screen.queryByText(/Last import/)).not.toBeInTheDocument();
  });

  it("shows the error when the list fails to load", async () => {
    mockApi({
      "GET /api/admin/imported-events": fail(
        500,
        "Could not load imported events.",
      ),
    });
    renderPage(<ImportedEvents />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load imported events.",
    );
    expect(
      screen.queryByText(/No imported events yet/),
    ).not.toBeInTheDocument();
  });

  it("falls back to sample data, with a note, while the backend route is missing", async () => {
    const { callsTo } = mockApi({
      "GET /api/admin/imported-events": fail(404, "Not found"),
    });
    const user = userEvent.setup();
    renderPage(<ImportedEvents />);
    expect(
      await screen.findByText(
        "Showing sample data until the import backend is ready.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Fall Choir Concert" }),
    ).toBeInTheDocument();
    // Sample rows are local only, so publishing one makes no server call.
    await user.click(
      within(rowFor("Fall Choir Concert")).getByRole("button", {
        name: "Publish",
      }),
    );
    expect(
      await screen.findByText("Published Fall Choir Concert."),
    ).toBeInTheDocument();
    expect(callsTo("POST", "/api/admin/events/imp-1/approve")).toHaveLength(0);
  });
});

describe("Admin Dashboard: Imported Events tab", () => {
  it("opens from the sidebar", async () => {
    mockApi({
      ...loggedInRoutes({ role: "admin" }),
      "GET /api/admin/verification-requests": { requests: [] },
      "GET /api/admin/events": { events: [] },
      ...withEvents(),
    });
    const user = userEvent.setup();
    renderPage(
      <RequireAuth>
        <AdminDashboard />
      </RequireAuth>,
    );
    await user.click(
      await screen.findByRole("button", { name: "Imported Events" }),
    );
    expect(
      await screen.findByRole("heading", {
        level: 3,
        name: "Fall Choir Concert",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        level: 2,
        name: "Pending Organizer Requests",
      }),
    ).not.toBeInTheDocument();
  });
});
