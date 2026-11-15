import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { getConversation, MAX_MESSAGE_LENGTH, sendMessage } from "../lib/messages.js";
import "../theme.css";
import "./ChatThread.css";

export const POLL_MS = 5000;
const GROUP_WINDOW_MS = 5 * 60_000;

const timeFormat = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const dayTimeFormat = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const eventDateFormat = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" });

function formatSentAt(iso) {
  const date = new Date(iso);
  return date.toDateString() === new Date().toDateString() ? timeFormat.format(date) : dayTimeFormat.format(date);
}

// A name is shown once per run of messages from the same person.
function startsRun(message, previous) {
  if (!previous || previous.sender.id !== message.sender.id) return true;
  return new Date(message.sentAt) - new Date(previous.sentAt) > GROUP_WINDOW_MS;
}

export function KindSticker({ kind }) {
  return (
    <span className={`sticker chat-kind chat-kind-${kind}`}>{kind === "group" ? "Group" : "Direct"}</span>
  );
}

// One conversation: its messages, kept fresh by polling, and a box to reply.
// onActivity runs after the viewer sends or new messages arrive, so a list of
// conversations can update its previews.
export default function ChatThread({ conversationId, onActivity, backLink = null }) {
  const [state, setState] = useState({ id: null, data: null, error: null });
  const [pending, setPending] = useState([]);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState("");
  const logRef = useRef(null);
  const stickToBottom = useRef(true);
  const onActivityRef = useRef(onActivity);
  const seen = useRef({ id: null, count: 0 });

  useEffect(() => {
    onActivityRef.current = onActivity;
  }, [onActivity]);

  const load = useCallback(async (id, { quiet }) => {
    try {
      const data = await getConversation(id);
      const grew = seen.current.id === id && data.messages.length > seen.current.count;
      seen.current = { id, count: data.messages.length };
      setState({ id, data, error: null });
      if (grew) onActivityRef.current?.();
    } catch (err) {
      // A failed poll keeps what's on screen; the next one tries again.
      if (!quiet) setState({ id, data: null, error: err });
    }
  }, []);

  useEffect(() => {
    let active = true;
    stickToBottom.current = true;
    const guarded = (opts) => active && load(conversationId, opts);
    guarded({ quiet: false });
    const timer = setInterval(() => guarded({ quiet: true }), POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [conversationId, load]);

  // Resets the reply box when switching threads (during render, not in an effect).
  const [draftFor, setDraftFor] = useState(conversationId);
  if (draftFor !== conversationId) {
    setDraftFor(conversationId);
    setDraft("");
    setPending([]);
    setSendError("");
  }

  const current = state.id === conversationId ? state : null;
  const messages = current?.data?.messages ?? [];
  const shown = [...messages, ...pending];

  // Follow new messages unless the reader has scrolled up to read older ones.
  useLayoutEffect(() => {
    const log = logRef.current;
    if (log && stickToBottom.current) log.scrollTop = log.scrollHeight;
  }, [shown.length]);

  function handleScroll() {
    const log = logRef.current;
    stickToBottom.current = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  }

  async function send() {
    const body = draft.trim();
    if (!body || pending.length > 0) return;
    const temp = { id: `pending-${Date.now()}`, body, sentAt: new Date().toISOString(), sender: { id: "viewer", name: "You" }, mine: true, pending: true };
    stickToBottom.current = true;
    setSendError("");
    setDraft("");
    setPending([temp]);
    try {
      const message = await sendMessage(conversationId, body);
      if (seen.current.id === conversationId) seen.current.count += 1;
      setState((old) =>
        old.id === conversationId && old.data && !old.data.messages.some((m) => m.id === message.id)
          ? { ...old, data: { ...old.data, messages: [...old.data.messages, message] } }
          : old,
      );
      onActivityRef.current?.();
    } catch (err) {
      setDraft((text) => text || body);
      setSendError(err.fields?.body ?? err.message);
    } finally {
      setPending([]);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  if (!current) return <p className="app-message chat-status" role="status">Loading conversation…</p>;

  if (current.error) {
    return (
      <div className="chat-thread chat-thread-message">
        {current.error.status === 404 ? (
          <p className="chat-status">This conversation isn't available.</p>
        ) : (
          <p className="app-error" role="alert">{current.error.message}</p>
        )}
        {backLink}
      </div>
    );
  }

  const { conversation } = current.data;
  const eventDate = conversation.event.startsAt ? eventDateFormat.format(new Date(conversation.event.startsAt)) : null;

  return (
    <section className="chat-thread" aria-label={`Conversation: ${conversation.title}`}>
      <header className="chat-header">
        {backLink}
        <div className="chat-heading">
          <h2 className="chat-title">{conversation.title}</h2>
          <KindSticker kind={conversation.kind} />
        </div>
        <p className="chat-subtitle">
          {conversation.kind === "group" ? "Everyone going, plus the organizer" : "Private conversation"}
          {" · "}
          <Link to={`/events/${conversation.event.id}`}>
            {conversation.kind === "group" ? "View event" : conversation.event.title}
          </Link>
          {eventDate && <span> · {eventDate}</span>}
        </p>
      </header>

      <ol className="chat-log" ref={logRef} onScroll={handleScroll} role="log" aria-live="polite" aria-label="Messages">
        {shown.length === 0 && (
          <li className="chat-empty">No messages yet. Say hello!</li>
        )}
        {shown.map((message, index) => {
          const showName = startsRun(message, shown[index - 1]);
          const className = [
            "chat-message",
            message.mine ? "chat-mine" : "chat-theirs",
            message.sender.isOrganizer && "chat-organizer",
            showName && "chat-run-start",
            message.pending && "chat-pending",
          ].filter(Boolean).join(" ");
          return (
            <li key={message.id} className={className}>
              {showName && !message.mine && (
                <p className="chat-sender">
                  {message.sender.name}
                  {message.sender.isOrganizer && <span className="sticker chat-organizer-tag">Organizer</span>}
                </p>
              )}
              <div className="chat-bubble">
                <p className="chat-body">{message.body}</p>
                <p className="chat-time">
                  {message.pending ? "Sending…" : <time dateTime={message.sentAt}>{formatSentAt(message.sentAt)}</time>}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label htmlFor="chat-draft" className="visually-hidden">Message</label>
        <textarea
          id="chat-draft"
          rows={1}
          value={draft}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="Write a message…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-invalid={sendError ? "true" : undefined}
          aria-describedby={sendError ? "chat-send-error" : "chat-hint"}
        />
        <button type="submit" className="chat-send" disabled={!draft.trim() || pending.length > 0}>
          Send
        </button>
        {sendError ? (
          <p className="chat-error" id="chat-send-error" role="alert">{sendError}</p>
        ) : (
          <p className="chat-hint" id="chat-hint">Enter to send · Shift+Enter for a new line</p>
        )}
      </form>
    </section>
  );
}
