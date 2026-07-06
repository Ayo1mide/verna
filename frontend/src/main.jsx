import React from "react";
import ReactDOM from "react-dom/client";
import VernApp from "../VernApp.jsx";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("React render error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <pre style={{ whiteSpace: "pre-wrap", padding: 16, color: "#fff", background: "#111", fontSize: 14 }}>
          {`React render error:\n${String(this.state.error?.stack || this.state.error)}`}
        </pre>
      );
    }
    return this.props.children;
  }
}

function paintGlobalError(prefix, payload) {
  const root = document.getElementById("root");
  if (!root) return;
  const text = typeof payload === "string" ? payload : String(payload?.stack || payload?.message || payload);
  root.innerHTML = `<pre style="white-space:pre-wrap;padding:16px;color:#fff;background:#111;font-size:14px;">${prefix}\n${text}</pre>`;
}

window.addEventListener("error", (event) => {
  paintGlobalError("Window error:", event.error || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  paintGlobalError("Unhandled promise rejection:", event.reason);
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <VernApp />
    </ErrorBoundary>
  </React.StrictMode>
);
