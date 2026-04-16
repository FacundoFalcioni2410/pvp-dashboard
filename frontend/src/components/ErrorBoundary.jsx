import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: "#ef4444", fontFamily: "monospace", fontSize: 13 }}>
          <strong>Error:</strong> {this.state.error.message}
          <br />
          <button
            style={{ marginTop: 12, padding: "4px 12px", cursor: "pointer" }}
            onClick={() => this.setState({ error: null })}
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
