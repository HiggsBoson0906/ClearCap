import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const API_BASE = ""; 

function App() {
  const [currentClips, setCurrentClips] = useState([]);
  const [currentClipIndex, setCurrentClipIndex] = useState(0);

  const [sessionId, setSessionId] = useState(null);
  const [socket, setSocket] = useState(null);
  const [text, setText] = useState("");
  const [captions, setCaptions] = useState([]);
  const [connecting, setConnecting] = useState(false);

  const [status, setStatus] = useState("");
  const getClipUrl = (clipId) => {
    if (!clipId) return "/clips/DEFAULT.mp4";
    // clip_MODI -> MODI
    const token = clipId.startsWith("clip_")
      ? clipId.slice("clip_".length)
      : clipId;
    return `/clips/${token}.mp4`;
  };

  const createSession = async () => {
    try {
      setConnecting(true);
      setStatus("Creating session...");

      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: "en-IN",
          mode: "text+sign",
        }),
      });

      const data = await res.json();
      console.log("Session response:", data);
      setSessionId(data.sessionId);

      // connect socket.io
      const s = io("/", {
        transports: ["websocket"],
      });

      s.on("connect", () => {
        console.log("Socket connected:", s.id);
        setStatus("Connected.");
      });

      s.on("disconnect", () => {
        console.log("Socket disconnected");
        setStatus("Disconnected.");
      });

      s.on("caption_final", (msg) => {
        console.log("caption_final:", msg);
        setCaptions((prev) => [msg, ...prev]);

        // Start a new avatar clip sequence for this caption
        if (msg.isl && Array.isArray(msg.isl.clipIds) && msg.isl.clipIds.length > 0) {
          setCurrentClips(msg.isl.clipIds);
          setCurrentClipIndex(0);
        } else {
          // If no specific clips, you can show a DEFAULT clip or nothing
          setCurrentClips([]);
          setCurrentClipIndex(0);
        }
      });


      setSocket(s);
    } catch (err) {
      console.error("Error creating session:", err);
      setStatus("Failed to create session. Check console.");
    } finally {
      setConnecting(false);
    }
  };

  const sendTranscript = () => {
    if (!socket || !socket.connected) {
      alert("Socket not connected. Create session first.");
      return;
    }
    if (!sessionId) {
      alert("No session id. Create session first.");
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) {
      alert("Enter some text.");
      return;
    }
    const payload = { sessionId, text: trimmed };
    console.log("Sending transcript_final:", payload);
    socket.emit("transcript_final", payload);
  };

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (socket) socket.disconnect();
    };
  }, [socket]);

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "20px",
        background: "#121212",
        color: "#f5f5f5",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1>ClearCap Live Caption Demo</h1>

      <div style={{ marginBottom: "16px" }}>
        <button
          onClick={createSession}
          disabled={connecting || !!sessionId}
          style={{
            padding: "8px 12px",
            marginRight: "8px",
            cursor: connecting || sessionId ? "not-allowed" : "pointer",
          }}
        >
          {sessionId ? "Session Active" : "Create Session"}
        </button>
        {sessionId && <span>Session ID: {sessionId}</span>}
        <div style={{ marginTop: "4px", fontSize: "12px" }}>{status}</div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: "16px",
          alignItems: "flex-start",
        }}
      >
        {/* LEFT: Text input + captions */}
        <div>
          <div
            style={{
              background: "#1e1e1e",
              padding: "12px",
              borderRadius: "8px",
              marginBottom: "16px",
            }}
          >
            <label htmlFor="textInput" style={{ fontSize: "14px" }}>
              Fake transcript (pretend ASR output):
            </label>
            <textarea
              id="textInput"
              style={{
                width: "100%",
                height: "80px",
                marginTop: "4px",
                padding: "8px",
                background: "#121212",
                color: "#f5f5f5",
                borderRadius: "4px",
                border: "1px solid #444",
              }}
              placeholder="Type a sentence you might hear in a live event..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button
              onClick={sendTranscript}
              style={{
                marginTop: "8px",
                padding: "8px 12px",
                cursor: "pointer",
              }}
            >
              Send transcript_final
            </button>
          </div>

          <h2>Caption Output</h2>
          <div>
            {captions.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  borderRadius: "8px",
                  border: "1px solid #444",
                  padding: "10px",
                  marginBottom: "10px",
                  background: msg.color || "#222",
                }}
              >
                <div style={{ fontSize: "13px", color: "#ccc" }}>
                  Original: {msg.original}
                </div>
                <div
                  style={{
                    fontSize: "16px",
                    fontWeight: 600,
                    marginTop: "4px",
                  }}
                >
                  Simplified: {msg.simplified}
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    marginTop: "4px",
                    color: "#ddd",
                  }}
                >
                  Language: {msg.language} | Emotion: {msg.emotion} | Gloss:{" "}
                  {msg.isl?.gloss?.join(" ") || ""} | Clips:{" "}
                  {msg.isl?.clipIds?.join(", ") || ""}
                </div>
              </div>
            ))}
            {captions.length === 0 && (
              <div
                style={{ fontSize: "13px", color: "#aaa", marginTop: "8px" }}
              >
                No captions yet. Create a session and send some text.
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: ISL Avatar */}
        <div
          style={{
            background: "#1e1e1e",
            padding: "12px",
            borderRadius: "8px",
          }}
        >
          <h2 style={{ marginTop: 0 }}>ISL Avatar</h2>
          {currentClips.length === 0 ? (
            <div style={{ fontSize: "13px", color: "#aaa" }}>
              No sign clips for this caption.
            </div>
          ) : (
            <>
              <div style={{ fontSize: "12px", marginBottom: "8px" }}>
                Playing clip {currentClipIndex + 1} of {currentClips.length}
              </div>
              <video
                key={currentClipIndex} // force reload when index changes
                style={{
                  width: "100%",
                  borderRadius: "8px",
                  border: "1px solid #444",
                  background: "#000",
                }}
                src={getClipUrl(currentClips[currentClipIndex])}
                autoPlay
                controls
                onEnded={() => {
                  setCurrentClipIndex((idx) => {
                    if (idx + 1 < currentClips.length) {
                      return idx + 1;
                    }
                    return idx; // stay on last clip
                  });
                }}
              />
              <div
                style={{
                  fontSize: "11px",
                  marginTop: "8px",
                  color: "#ccc",
                  wordBreak: "break-all",
                }}
              >
                Clip IDs: {currentClips.join(", ")}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
