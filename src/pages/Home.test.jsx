import { afterEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import Home from "./Home.jsx";
import { fail, loggedInRoutes, mockApi, renderPage, resetApi } from "../test/api.jsx";

// Filtering now happens on the backend (see backend/tests/events-*.test.ts for
// the Today/This Week rules). These tests check what the page asks for and how
// it shows the answer.

const events = [
  {
    // Today, free, verified
    id: "a",
    title: "Today Free Event",
    startsAt: "2026-10-25T22:00:00Z", // 6:00 PM Eastern
    location: "Town Common",
    price: "Free",
    verified: true,
  },
  {
    // Paid, has an image, not verified
    id: "b",
    title: "Midweek Paid Event",
    startsAt: "2026-10-28T19:00:00Z",
    location: "Campus Center",
    price: "$10.00",
    imageUrl: "https://example.com/b.jpg",
    verified: false,
  },
  {
    // No location
    id: "c",
    title: "Far Future Event",
    startsAt: "2026-11-20T19:00:00Z",
    location: null,
    price: "Free",
    verified: false,
  },
];

const routes = (overrides = {}) => ({ "GET /api/events": { events }, ...overrides });

function renderHome(route = "/") {
  return renderPage(
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<h1>Login page</h1>} />
    </Routes>,
    { route },
  );
}

const chip = (name) => screen.getByRole("button", { name });
const cardFor = (title) => screen.getByRole("heading", { name: title }).closest("article");
const loaded = () => screen.findByRole("heading", { name: "Today Free Event" });

afterEach(resetApi);

describe("Home: page content", () => {
  it("shows the hero title, subtitle and section heading", async () => {
    mockApi(routes());
    renderHome();
    expect(screen.getByRole("heading", { level: 1, name: "Find your next good time." })).toBeInTheDocument();
    expect(screen.getByText(/concerts, markets, meetups and more/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Upcoming Events" })).toBeInTheDocument();
    await loaded();
  });

  it("loads events from the backend, showing a loading message first", async () => {
    const { calls } = mockApi(routes());
    renderHome();
    expect(screen.getByRole("status")).toHaveTextContent(/loading events/i);
    await loaded();
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(calls[0].path).toBe("/api/events");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the date, time, location and price on a card", async () => {
    mockApi(routes());
    renderHome();
    await loaded();
    const card = within(cardFor("Today Free Event"));
    // \s because newer Node versions put a special space before "PM"
    expect(card.getByText(/Sun, Oct 25 • 6:00\sPM/)).toBeInTheDocument();
    expect(card.getByText("Town Common • Free")).toBeInTheDocument();
  });

  it("links the card title to its event details page", async () => {
    mockApi(routes());
    renderHome();
    await loaded();
    expect(screen.getByRole("link", { name: "Today Free Event" })).toHaveAttribute("href", "/events/a");
  });

  it("skips the bullet when an event has no location", async () => {
    mockApi(routes());
    renderHome();
    await loaded();
    expect(within(cardFor("Far Future Event")).getByText("Free")).toBeInTheDocument();
  });

  it("shows the Verified badge only on verified events", async () => {
    mockApi(routes());
    renderHome();
    await loaded();
    expect(within(cardFor("Today Free Event")).getByText("✓ Verified")).toBeInTheDocument();
    expect(within(cardFor("Midweek Paid Event")).queryByText("✓ Verified")).not.toBeInTheDocument();
  });

  it("only renders an image for events that have an imageUrl", async () => {
    mockApi(routes());
    renderHome();
    await loaded();
    expect(cardFor("Midweek Paid Event").querySelector("img")).toHaveAttribute("src", "https://example.com/b.jpg");
    expect(cardFor("Today Free Event").querySelector("img")).toBeNull();
  });

  it("shows the server's message when loading fails", async () => {
    mockApi(routes({ "GET /api/events": fail(500, "Could not load events. Please try again.") }));
    renderHome();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load events");
    expect(screen.queryByText(/no events match/i)).not.toBeInTheDocument();
  });

  it("shows the empty message when nothing matches", async () => {
    mockApi({ "GET /api/events": { events: [] } });
    renderHome();
    expect(await screen.findByText(/no events match these filters/i)).toBeInTheDocument();
  });
});

describe("Home: filters", () => {
  it("turns a chip on and off, asking the backend each time", async () => {
    const { callsTo } = mockApi(routes());
    const user = userEvent.setup();
    renderHome();
    await loaded();
    expect(chip("Free")).toHaveAttribute("aria-pressed", "false");

    await user.click(chip("Free"));
    expect(chip("Free")).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(callsTo("GET", "/api/events")).toHaveLength(2));
    expect(callsTo("GET", "/api/events")[1].params.getAll("filter")).toEqual(["free"]);

    await user.click(chip("Free"));
    await waitFor(() => expect(callsTo("GET", "/api/events")).toHaveLength(3));
    expect(callsTo("GET", "/api/events")[2].params.getAll("filter")).toEqual([]);
  });

  it("shows only what the backend returns for the filter", async () => {
    mockApi({
      "GET /api/events": ({ params }) => ({
        events: params.has("filter") ? [events[0]] : events,
      }),
    });
    const user = userEvent.setup();
    renderHome();
    await loaded();
    await user.click(chip("Today"));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
  });

  it("sends several filters together", async () => {
    const { callsTo } = mockApi(routes());
    const user = userEvent.setup();
    renderHome();
    await loaded();
    await user.click(chip("This Week"));
    await user.click(chip("Free"));
    await waitFor(() => expect(callsTo("GET", "/api/events")).toHaveLength(3));
    expect(callsTo("GET", "/api/events")[2].params.getAll("filter")).toEqual(["week", "free"]);
  });

  it("opens and closes the extra filters", async () => {
    mockApi(routes());
    const user = userEvent.setup();
    renderHome();
    await loaded();
    expect(screen.queryByRole("button", { name: "Accessible" })).not.toBeInTheDocument();
    await user.click(chip(/more filters/i));
    expect(chip(/more filters/i)).toHaveAttribute("aria-expanded", "true");
    expect(chip("Accessible")).toBeInTheDocument();
    await user.click(chip(/more filters/i));
    expect(screen.queryByRole("button", { name: "Accessible" })).not.toBeInTheDocument();
  });

  it("sends the Accessible filter, and keeps it on after the panel closes", async () => {
    const { callsTo } = mockApi(routes());
    const user = userEvent.setup();
    renderHome();
    await loaded();
    await user.click(chip(/more filters/i));
    await user.click(chip("Accessible"));
    await waitFor(() => expect(callsTo("GET", "/api/events")).toHaveLength(2));
    await user.click(chip(/more filters/i));
    expect(callsTo("GET", "/api/events")).toHaveLength(2);
    expect(callsTo("GET", "/api/events")[1].params.getAll("filter")).toEqual(["accessible"]);
  });

  it("disables filters the backend can't do yet, instead of pretending", async () => {
    mockApi(routes());
    const user = userEvent.setup();
    renderHome();
    await loaded();
    await user.click(chip(/more filters/i));
    for (const name of ["Age", "Category", "Indoor/Outdoor"]) {
      expect(chip(name)).toBeDisabled();
    }
  });
});

describe("Home: search", () => {
  it("searches for the text in the URL and says so in the heading", async () => {
    const { calls } = mockApi(routes());
    renderHome("/?q=jazz");
    expect(screen.getByRole("heading", { level: 2, name: 'Results for "jazz"' })).toBeInTheDocument();
    await loaded();
    expect(calls.find((c) => c.path === "/api/events").params.get("q")).toBe("jazz");
  });
});

describe("Home: Save button", () => {
  it("sends logged-out visitors to log in instead of saving", async () => {
    const { calls } = mockApi(routes());
    const user = userEvent.setup();
    renderHome();
    await loaded();
    await user.click(within(cardFor("Today Free Event")).getByRole("button"));
    expect(await screen.findByRole("heading", { name: "Login page" })).toBeInTheDocument();
    expect(calls.some((c) => c.path.includes("/save"))).toBe(false);
  });

  const loggedIn = (overrides = {}) => ({
    ...routes(),
    ...loggedInRoutes(),
    "GET /api/me/saved-events": { events: [events[2]] },
    "PUT /api/events/b/save": { saved: true },
    "DELETE /api/events/c/save": { saved: false },
    ...overrides,
  });

  it("marks the events this user already saved", async () => {
    mockApi(loggedIn());
    renderHome();
    await loaded();
    expect(await within(cardFor("Far Future Event")).findByRole("button", { name: "Saved" })).toHaveAttribute("aria-pressed", "true");
    expect(within(cardFor("Today Free Event")).getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("saves just the card that was clicked, on the server", async () => {
    const { callsTo } = mockApi(loggedIn());
    const user = userEvent.setup();
    renderHome();
    await loaded();
    await within(cardFor("Far Future Event")).findByRole("button", { name: "Saved" });
    await user.click(within(cardFor("Midweek Paid Event")).getByRole("button"));
    expect(within(cardFor("Midweek Paid Event")).getByRole("button", { name: "Saved" })).toBeInTheDocument();
    expect(within(cardFor("Today Free Event")).getByRole("button", { name: "Save" })).toBeInTheDocument();
    await waitFor(() => expect(callsTo("PUT", "/api/events/b/save")).toHaveLength(1));
  });

  it("un-saves on the server when clicked again", async () => {
    const { callsTo } = mockApi(loggedIn());
    const user = userEvent.setup();
    renderHome();
    await loaded();
    await user.click(await within(cardFor("Far Future Event")).findByRole("button", { name: "Saved" }));
    expect(within(cardFor("Far Future Event")).getByRole("button", { name: "Save" })).toBeInTheDocument();
    await waitFor(() => expect(callsTo("DELETE", "/api/events/c/save")).toHaveLength(1));
  });

  it("undoes the change and explains when saving fails", async () => {
    mockApi(loggedIn({ "PUT /api/events/b/save": fail(500, "Could not save this event. Please try again.") }));
    const user = userEvent.setup();
    renderHome();
    await loaded();
    await within(cardFor("Far Future Event")).findByRole("button", { name: "Saved" });
    await user.click(within(cardFor("Midweek Paid Event")).getByRole("button"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save this event");
    expect(within(cardFor("Midweek Paid Event")).getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("remembers saved events after they are filtered out and back", async () => {
    mockApi({
      ...loggedIn(),
      "GET /api/events": ({ params }) => ({ events: params.has("filter") ? [events[0]] : events }),
    });
    const user = userEvent.setup();
    renderHome();
    await loaded();
    await within(cardFor("Far Future Event")).findByRole("button", { name: "Saved" });
    await user.click(chip("Free"));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
    await user.click(chip("Free"));
    expect(await within(await screen.findByRole("heading", { name: "Far Future Event" }).then((h) => h.closest("article"))).findByRole("button", { name: "Saved" })).toBeInTheDocument();
  });
});
