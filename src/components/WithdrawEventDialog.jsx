import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import "../theme.css";
import "./ChangePhotoDialog.css"; // reusing the cpd-* modal styles so both popups look the same
import "./WithdrawEventDialog.css";

// "Are you sure?" popup before withdrawing (deleting) an event that is still
// waiting for an admin. Nothing is deleted until "Withdraw event" is clicked.
// onWithdrawn runs after the server confirms; onClose for Cancel / Escape.
export default function WithdrawEventDialog({ event, onClose, onWithdrawn }) {
  const dialogRef = useRef(null);
  const keepRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Same open-on-mount trick as ChangePhotoDialog.
    const dialog = dialogRef.current;
    if (!dialog.open) dialog.showModal();
    // Start on the safe button so pressing Enter right away doesn't delete anything.
    keepRef.current.focus();
  }, []);

  async function withdraw() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/me/events/${event.id}`, { method: "DELETE" });
      onWithdrawn(event);
    } catch (err) {
      // Stay open and show why (e.g. the server's message if it was already approved).
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="cpd-dialog"
      role="alertdialog"
      aria-labelledby="wed-title"
      aria-describedby="wed-text"
      onClose={onClose}
      onCancel={(e) => busy && e.preventDefault()}
    >
      <h2 className="cpd-title" id="wed-title">Withdraw this event?</h2>
      <p className="cpd-event">{event.title}</p>
      <p className="wed-text" id="wed-text">
        This permanently deletes the event and its photos, and it won't be reviewed.
        This can't be undone.
      </p>
      {error && <p className="app-error" role="alert">{error}</p>}
      <div className="cpd-actions">
        <button ref={keepRef} type="button" className="cp-btn" onClick={onClose} disabled={busy}>
          Keep event
        </button>
        <button type="button" className="cp-btn wed-danger" onClick={withdraw} disabled={busy}>
          {busy ? "Withdrawing…" : "Withdraw event"}
        </button>
      </div>
    </dialog>
  );
}
