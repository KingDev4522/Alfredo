import { Component } from "react";

// Catches render-time crashes so a bug shows a readable message with a recovery
// button instead of a blank black screen that can only be fixed by reloading.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("UI crash caught by ErrorBoundary:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="w-full min-h-[60vh] flex flex-col items-center justify-center gap-4 px-4 py-16 text-center">
        <h1 className="text-2xl font-bold" style={{ color: "#F2F4F8", fontFamily: "'Space Grotesk', sans-serif" }}>
          Something broke on this screen
        </h1>
        <p className="max-w-md text-sm" style={{ color: "#9AA1B4" }}>
          Your recordings and account data are safe. Reload to continue.
        </p>
        {this.state.error?.message && (
          <pre className="max-w-xl overflow-auto rounded-md bg-black/40 border border-white/10 p-3 text-left text-xs text-rose-300">
            {this.state.error.message}
          </pre>
        )}
        <button
          onClick={() => window.location.reload()}
          className="rounded-full bg-[#2DE2E6] px-6 py-2.5 font-semibold text-slate-900"
        >
          Reload page
        </button>
      </div>
    );
  }
}
