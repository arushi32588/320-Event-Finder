import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import Home from "./Home.jsx";

// 15 tests and 7 edge cases total

// MOCK DATA: swap the real events file for a small fake list
// The real events in src/data/events.js are all dated in the past, so "Today" and "This Week" would show nothing and we couldn't test them 
// The fake list is also stable, so the tests don't break if someone edits the real data
// Each fake event is built to test one thing (see the comments on each)
// The clock is frozen to Sun Oct 25 2026, 12:00 PM Eastern (see beforeEach)

vi.mock("../data/events.js", () => ({
  events: [
    {
      // Today, free, verified, NOT accessible
      id: "a",
      title: "Today Free Event",
      startsAt: "2026-10-25T22:00:00Z", // 6:00 PM Eastern
      location: "Town Common",
      price: "Free",
      verified: true,
    },
    {
      // This week, paid, has an image, NOT verified, NOT accessible
      id: "b",
      title: "Midweek Paid Event",
      startsAt: "2026-10-28T19:00:00Z",
      location: "Campus Center",
      price: "$10",
      imageUrl: "https://example.com/b.jpg",
      verified: false,
    },
    {
      // Far in the future, free, accessible, NO location
      id: "c",
      title: "Far Future Event",
      startsAt: "2026-11-20T19:00:00Z",
      price: "Free",
      accessibility: "Step-free entrance",
    },
    {
      // Already happened, free
      id: "d",
      title: "Past Event",
      startsAt: "2026-10-15T15:00:00Z",
      location: "Library",
      price: "Free",
    },
  ],
}));

// Draws the Home page for a test. Home uses <Link>, which only works inside a router, so we wrap it in MemoryRouter (a router that lives in memory instead of the browser's address bar)
function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );
}

// Small helpers so the tests below are shorter and easier to read
// chip("Free") -> finds the button named "Free"
// cardFor("X") -> finds the whole event card whose title is "X"
// titlesOnScreen() -> the list of event titles currently showing

const chip = (name) => screen.getByRole("button", { name });
const cardFor = (title) =>
  screen.getByRole("heading", { name: title }).closest("article");
const titlesOnScreen = () =>
  screen.queryAllByRole("heading", { level: 3 }).map((h) => h.textContent);

// Frozen Clock: Home decides "today" and "this week" using the current time, so we freeze the clock before every test
// Without this, the tests would pass or fail depending on what day you run them
// We only fake the Date (not timers) so that clicking with userEvent still works normally
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T16:00:00Z"));
});

// Put the real clock back after each test so one test can't affect the next
afterEach(() => {
  vi.useRealTimers();
});

describe("Home: page content", () => {
    // Checks the basics are there: main title, subtitle and "Upcoming Events"
    // If the page fails to load properly, these are the first things to go
  it("shows the hero title, subtitle and section heading", () => {
    renderHome();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Discover events happening around you",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/browse local events in amherst/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Upcoming Events" }),
    ).toBeInTheDocument();
  });

  // With no filters on, every event should get a card (we have 4 fake ones)
  // This is the page's main job, listing events
  it("renders one card per event when no filters are on", () => {
    renderHome();
    expect(screen.getAllByRole("article")).toHaveLength(4);
  });

  
  // Checks a card shows its date, time, location and price in the right format
  // This is the info people actually read. The time is formatted in Eastern time, so we also check the formatting works
  it("shows the date, time, location and price on a card", () => {
    renderHome();
    const card = within(cardFor("Today Free Event"));
    // \s because newer Node versions put a special space before "PM"
    expect(card.getByText(/Sun, Oct 25 • 6:00\sPM/)).toBeInTheDocument();
    expect(card.getByText("Town Common • Free")).toBeInTheDocument();
  });

  // Checks the event title is a link to that event's page (/events/<id>)
  // Clicking a card is how users get to the Event Details page
  it("links the card title to its event details page", () => {
    renderHome();
    expect(
      screen.getByRole("link", { name: "Today Free Event" }),
    ).toHaveAttribute("href", "/events/a");
  });

  // Edge Case: an event with no location. The page joins location and price with a bullet ("Town Common • Free"), so a missing location must not leave a stray bullet like "• Free"
  // That's because real data is often incomplete
  it("skips the bullet when an event has no location", () => {
    renderHome();
    // Far Future Event has a price but no location -> just "Free"
    expect(
      within(cardFor("Far Future Event")).getByText("Free"),
    ).toBeInTheDocument();
  });

  // The "✓ Verified" badge should show on verified events only
  // Showing it on everything would make it meaningless
  // We check both that it shows when it should (1 badge total) and that it's missing on an unverified card
  it("shows the Verified badge only on verified events", () => {
    renderHome();
    expect(screen.getAllByText("✓ Verified")).toHaveLength(1);
    expect(
      within(cardFor("Today Free Event")).getByText("✓ Verified"),
    ).toBeInTheDocument();
    expect(
      within(cardFor("Midweek Paid Event")).queryByText("✓ Verified"),
    ).not.toBeInTheDocument();
  });

  // Edge Case: an image should only appear when the event has an imageUrl
  // Without this check, events with no picture could show a broken image
  it("only renders an image for events that have an imageUrl", () => {
    const { container } = renderHome();
    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute("src", "https://example.com/b.jpg");
  });
});

describe("Home: main filters", () => {
    // A filter button starts off, turns on when clicked and off when clicked again
    // "aria-pressed" is the on/off state the button exposes (also what screen readers use)
    // The whole filter system builds on this toggle
  it("turns a chip on and off when clicked", async () => {
    const user = userEvent.setup();
    renderHome();
    expect(chip("Free")).toHaveAttribute("aria-pressed", "false");
    await user.click(chip("Free"));
    expect(chip("Free")).toHaveAttribute("aria-pressed", "true");
    await user.click(chip("Free"));
    expect(chip("Free")).toHaveAttribute("aria-pressed", "false");
  });

  // "Free" should hide the paid event and keep every free one
  // It's the simplest filter, and checking the exact list proves it keeps the right events and drops the right one
  it("Free hides paid events", async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(chip("Free"));
    expect(titlesOnScreen()).toEqual([
      "Today Free Event",
      "Far Future Event",
      "Past Event",
    ]);
  });

  // "Today" should only show events that start today
  // This depends on the date, which is why the clock is frozen.
  it("Today only shows events starting today (Eastern time)", async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(chip("Today"));
    expect(titlesOnScreen()).toEqual(["Today Free Event"]);
  });

  // "This Week" should show events from now until 7 days from now, and hide events that already happened or are further away
  // This checks both edges of the 7-day window.
  it("This Week shows upcoming events within 7 days, not past or later ones", async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(chip("This Week"));
    expect(titlesOnScreen()).toEqual([
      "Today Free Event",
      "Midweek Paid Event",
    ]);
  });

  // Edge Case: two filters on at once
  // The page uses AND logic, so an event must match both to stay
  // A common bug is accidentally using OR, which would show too much
  // "Midweek Paid Event" is this week but not free, so it must disappear
  it("combines filters with AND logic", async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(chip("This Week"));
    await user.click(chip("Free"));
    // Midweek Paid Event is this week but not free, so it drops out
    expect(titlesOnScreen()).toEqual(["Today Free Event"]);
  });

  // Turning a filter off should bring the hidden events back
  // Users change their mind, and the list shouldn't get stuck filtered
  it("brings events back when a filter is turned off", async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(chip("Today"));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    await user.click(chip("Today"));
    expect(screen.getAllByRole("article")).toHaveLength(4);
  });

  // Edge Case: filters that leave zero events
  // The page should show a friendly message instead of a blank space
  // Users hit this often
  // We get there by combining "Today" and "Accessible": today's event isn't accessible, and the accessible one isn't today
  it("shows the empty message when nothing matches", async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(chip("Today"));
    await user.click(chip("More filters ▾"));
    await user.click(chip("Accessible"));
    // today's event isn't accessible, and the accessible one isn't today
    expect(
      screen.getByText("No events match these filters yet."),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("article")).toHaveLength(0);
  });

  // Edge Case: timezones
  // The page decides "today" in Eastern time (Amherst)
  // We move the clock to 3:30 AM UTC on Oct 26, which is still the night of Oct 25 in Amherst, so the 6 PM Oct 25 event should still count as today
  // A page that used the wrong timezone would drop it too early.
  it("decides 'today' by Eastern time, even late at night UTC", async () => {
    // 3:30 AM UTC on Oct 26 is still 11:30 PM on Oct 25 in Amherst,
    // so the 6 PM Oct 25 event should still count as today
    vi.setSystemTime(new Date("2026-10-26T03:30:00Z"));
    const user = userEvent.setup();
    renderHome();
    await user.click(chip("Today"));
    expect(titlesOnScreen()).toEqual(["Today Free Event"]);
  });
});

// The more filters panel 

describe("Home: More filters", () => {
    // The extra filters start hidden, appear when "More filters" is clicked, and hide again on a second click
    // "aria-expanded" is the open/closed state
    //  Keeps the page clean by default, but the extras must be reachable
  it("opens and closes the extra filters", async () => {
    const user = userEvent.setup();
    renderHome();
    expect(chip(/more filters/i)).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: "Accessible" }),
    ).not.toBeInTheDocument();
    await user.click(chip(/more filters/i));
    expect(chip(/more filters/i)).toHaveAttribute("aria-expanded", "true");
    for (const name of ["Age", "Category", "Accessible", "Indoor/Outdoor"]) {
      expect(chip(name)).toBeInTheDocument();
    }
    await user.click(chip(/more filters/i));
    expect(
      screen.queryByRole("button", { name: "Accessible" }),
    ).not.toBeInTheDocument();
  });

  // "Accessible" should only keep events that list accessibility info
  // It's the one extra filter that actually works right now.
  it("Accessible only shows events that list accessibility info", async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(chip(/more filters/i));
    await user.click(chip("Accessible"));
    expect(titlesOnScreen()).toEqual(["Far Future Event"]);
  });

  // Edge Case: closing the panel must NOT turn its filters off
  // Otherwise users would think a filter was gone while the list is still filtered, which is confusing
  it("keeps a filter active after the panel is closed", async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(chip(/more filters/i));
    await user.click(chip("Accessible"));
    await user.click(chip(/more filters/i)); // collapse
    expect(titlesOnScreen()).toEqual(["Far Future Event"]);
  });

  // Age, Category and Indoor/Outdoor aren't built yet: they toggle on and off but don't change the list
  // This test documents that current behavior, so nobody is surprised by it
  // Update it once they actually filter
  it("Age, Category and Indoor/Outdoor chips toggle but don't filter yet", async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(chip(/more filters/i));
    for (const name of ["Age", "Category", "Indoor/Outdoor"]) {
      await user.click(chip(name));
      expect(chip(name)).toHaveAttribute("aria-pressed", "true");
    }
    expect(screen.getAllByRole("article")).toHaveLength(4);
  });
});

// Save button on each card

describe("Home: Save button", () => {
    // Clicking Save should change only that card to "Saved"
    // The other three cards stay "Save"
    // It proves each card tracks its own saved state instead of all cards changing together
  it("saves just the card that was clicked", async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(within(cardFor("Midweek Paid Event")).getByRole("button"));
    expect(
      within(cardFor("Midweek Paid Event")).getByRole("button", {
        name: "Saved",
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button", { name: "Save" })).toHaveLength(3);
  });

  // Clicking "Saved" again should go back to "Save"
  // Users need to be able to undo a save
  it("un-saves when clicked again", async () => {
    const user = userEvent.setup();
    renderHome();
    const card = cardFor("Today Free Event");
    await user.click(within(card).getByRole("button"));
    await user.click(within(card).getByRole("button"));
    expect(
      within(card).getByRole("button", { name: "Save" }),
    ).toBeInTheDocument();
  });

    
  // Edge Case: save a card, then filter it out of the list and bring it back
  // The "Accessible" filter hides this event, so its card disappears
  // When the filter is turned off again, the card should still say "Saved"
  // Users would be annoyed if filtering wiped out what they saved
  it("remembers saved events after they are filtered out and back", async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(within(cardFor("Today Free Event")).getByRole("button"));
    await user.click(chip(/more filters/i));
    await user.click(chip("Accessible")); // hides Today Free Event
    expect(titlesOnScreen()).toEqual(["Far Future Event"]);
    await user.click(chip("Accessible")); // brings it back
    expect(
      within(cardFor("Today Free Event")).getByRole("button", {
        name: "Saved",
      }),
    ).toBeInTheDocument();
  });
});