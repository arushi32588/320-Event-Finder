import { useEffect, useRef, useState } from "react";
import EventPoster from "./EventPoster.jsx";
import { IMAGE_TYPES, validateImage } from "../lib/eventImages.js";
import "../theme.css";
import "./CoverPhotoPicker.css";

// Choose a cover photo by browsing or dropping a file, previewed as the event's
// poster. Bad files are refused here with a message; `error` shows errors from
// elsewhere, like a failed upload.
export default function CoverPhotoPicker({ id, label = "Cover photo", file, onChange, previewEvent, currentPhoto = null, error = "" }) {
  const inputRef = useRef(null);
  const [fileError, setFileError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function choose(picked) {
    if (!picked) return;
    const problem = validateImage(picked);
    setFileError(problem ?? "");
    if (!problem) onChange(picked);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    choose(e.dataTransfer.files?.[0]);
  }

  const shownError = fileError || error;
  const errorId = `${id}-error`;
  const photo = file ? previewUrl : currentPhoto;
  const hasPhoto = Boolean(file || currentPhoto);

  return (
    <div className="cp-picker">
      <label htmlFor={id} className="cp-label">{label}</label>
      <input
        ref={inputRef}
        id={id}
        type="file"
        className="visually-hidden cp-input"
        accept={IMAGE_TYPES.join(",")}
        tabIndex={hasPhoto ? -1 : 0}
        aria-invalid={shownError ? "true" : undefined}
        aria-describedby={shownError ? errorId : hasPhoto ? undefined : `${id}-hint`}
        onChange={(e) => {
          choose(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {hasPhoto ? (
        <div className="cp-preview">
          <div className="cp-preview-poster">
            <EventPoster event={previewEvent} photo={photo} />
          </div>
          <div className="cp-preview-actions">
            {file && <span className="cp-filename">{file.name}</span>}
            <button type="button" className="cp-btn" onClick={() => inputRef.current.click()}>
              Replace
            </button>
            <button
              type="button"
              className="cp-btn"
              onClick={() => {
                setFileError("");
                onChange(null);
              }}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <label
          htmlFor={id}
          className={dragging ? "cp-zone cp-zone-active" : "cp-zone"}
          aria-invalid={shownError ? "true" : undefined}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <span className="sticker cp-zone-sticker" aria-hidden="true">+ Photo</span>
          <span className="cp-zone-text">
            Drop a photo here or <span className="cp-browse">browse</span>
          </span>
          <span className="cp-zone-hint" id={`${id}-hint`}>JPEG, PNG or WebP, up to 5 MB</span>
        </label>
      )}

      {shownError && <p className="ov-error cp-error" id={errorId}>{shownError}</p>}
    </div>
  );
}
