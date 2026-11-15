import { useEffect, useRef, useState } from "react";
import CoverPhotoPicker from "./CoverPhotoPicker.jsx";
import { removeEventImage, uploadEventImage, useEventImageUrl } from "../lib/eventImages.js";
import "../theme.css";
import "./ChangePhotoDialog.css";

// A modal for changing or removing the cover photo of an event you submitted.
export default function ChangePhotoDialog({ event, onClose }) {
  const dialogRef = useRef(null);
  const existing = useEventImageUrl(event);
  const [file, setFile] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Removing the element on unmount takes it off screen; closing it here
    // would fire onClose again.
    const dialog = dialogRef.current;
    if (!dialog.open) dialog.showModal();
  }, []);

  function handleChange(next) {
    setError("");
    if (next) {
      setFile(next);
      setRemoving(false);
    } else if (file) {
      setFile(null);
    } else {
      setRemoving(true);
    }
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (file) await uploadEventImage(event.id, file);
      else if (removing) await removeEventImage(event.id);
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  const changed = Boolean(file) || removing;

  return (
    <dialog
      ref={dialogRef}
      className="cpd-dialog"
      aria-labelledby="cpd-title"
      onClose={onClose}
      onCancel={(e) => saving && e.preventDefault()}
    >
      <form method="dialog" onSubmit={save}>
        <h2 className="cpd-title" id="cpd-title">Cover photo</h2>
        <p className="cpd-event">{event.title}</p>
        <CoverPhotoPicker
          id={`photo-${event.id}`}
          label="Photo"
          file={file}
          onChange={handleChange}
          previewEvent={event}
          currentPhoto={removing ? null : existing}
          error={error}
        />
        <div className="cpd-actions">
          <button type="button" className="cp-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="cp-btn cp-btn-primary" disabled={!changed || saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
