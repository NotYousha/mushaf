import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

/**
 * The last line before a blank screen.
 *
 * Without one of these a single throw anywhere in the tree unmounts the whole
 * app and leaves the page black, with nothing to report and nothing to press
 * — which is exactly what happened when picking a photograph failed. A reader
 * losing the mushaf mid-page deserves better than that, so the error is shown
 * and the app offers its own way back.
 *
 * Deliberately plain: it must not depend on the theme, the language, or
 * anything else that might itself be what broke.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept so a listener who hits this can say what it said.
    console.error('mushaf crashed:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="crash" role="alert">
        <h1>حدث خطأ · Something went wrong</h1>
        <p className="crash-msg">{error.message || String(error)}</p>
        <div className="crash-actions">
          <button type="button" onClick={() => this.setState({ error: null })}>
            المحاولة مرة أخرى · Try again
          </button>
          <button type="button" onClick={() => window.location.reload()}>
            إعادة التحميل · Reload
          </button>
        </div>
        <p className="crash-note">
          محفوظاتك وتلاواتك المحفوظة لم تتأثر.
          <br />
          Your saved recitations are untouched.
        </p>
      </div>
    )
  }
}
