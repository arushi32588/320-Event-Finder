import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, useParams } from "react-router";
import ChatThread, { KindSticker } from "../components/ChatThread.jsx";
import { listConversations } from "../lib/messages.js";
import "../theme.css";
import "./Messages.css";

const eventDateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });

export default function Messages() {
  const { conversationId } = useParams();
  const [conversations, setConversations] = useState(null);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    return listConversations()
      .then((list) => {
        setConversations(list);
        setError("");
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const backLink = (
    <Link to="/messages" className="msg-back">← All messages</Link>
  );

  return (
    <div className={conversationId ? "msg-page msg-has-thread" : "msg-page"}>
      <h1 className="msg-title">Messages</h1>

      <div className="msg-layout">
        <nav className="msg-list-pane" aria-label="Conversations">
          {error && <p className="app-error" role="alert">{error}</p>}
          {!error && !conversations && <p className="app-message" role="status">Loading conversations…</p>}
          {conversations?.length === 0 && (
            <p className="msg-empty">
              No conversations yet. RSVP to an event to join its group chat, or message an organizer from any event page.
            </p>
          )}
          {conversations?.length > 0 && (
            <ul className="msg-list">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <ConversationRow conversation={conversation} />
                </li>
              ))}
            </ul>
          )}
        </nav>

        <div className="msg-card msg-thread-pane">
          {conversationId ? (
            <ChatThread conversationId={conversationId} onActivity={refresh} backLink={backLink} />
          ) : (
            <div className="msg-placeholder">
              <span className="msg-placeholder-mark" aria-hidden="true">✶</span>
              <p>Pick a conversation to start chatting.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConversationRow({ conversation }) {
  const { kind, event, title, lastMessage } = conversation;
  const preview = lastMessage ? `${lastMessage.senderName}: ${lastMessage.body}` : "No messages yet";

  return (
    <NavLink to={`/messages/${conversation.id}`} className="msg-row">
      <span className="msg-row-top">
        <span className="msg-row-title">{title}</span>
        <KindSticker kind={kind} />
      </span>
      {kind === "direct" && (
        <span className="msg-row-event">
          {event.title}
          {event.startsAt && ` · ${eventDateFormat.format(new Date(event.startsAt))}`}
        </span>
      )}
      <span className="msg-row-preview">{preview}</span>
    </NavLink>
  );
}
