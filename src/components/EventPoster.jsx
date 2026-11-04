import "./EventPoster.css";

const timeZone = "America/New_York";
const part = (options) => new Intl.DateTimeFormat("en-US", { timeZone, ...options });
const weekday = part({ weekday: "short" });
const day = part({ day: "numeric" });
const month = part({ month: "short" });

const ART_STYLES = 5;

// The same event always gets the same art.
function artFor(id) {
  const number = Number(id);
  if (Number.isInteger(number)) return number % ART_STYLES;
  return [...String(id)].reduce((sum, char) => sum + char.charCodeAt(0), 0) % ART_STYLES;
}

// A generated poster for events without a photo, with the date on a ticket.
export default function EventPoster({ event, muted = false }) {
  const start = event.startsAt ? new Date(event.startsAt) : null;

  return (
    <div
      className={muted ? "poster poster-muted" : "poster"}
      data-art={artFor(event.id)}
      aria-hidden="true"
    >
      {event.imageUrl && <img src={event.imageUrl} alt="" />}
      {start && (
        <span className="poster-ticket">
          <span className="poster-weekday">{weekday.format(start)}</span>
          <span className="poster-day">{day.format(start)}</span>
          <span className="poster-month">{month.format(start)}</span>
        </span>
      )}
      {event.price === "Free" && <span className="sticker poster-free">Free!</span>}
    </div>
  );
}
