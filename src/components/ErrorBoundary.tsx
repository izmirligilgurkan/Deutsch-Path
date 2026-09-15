import { Component, type ComponentChildren } from 'preact';
import { t } from '~/i18n/strings.ts';

interface Props { children: ComponentChildren }
interface State { error: Error | null }

/** Keeps one broken screen from blanking the whole app. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static override getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error): void {
    console.error('[ui]', error);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div class="card">
        <h2>{t.errors.crashed}</h2>
        <p class="muted small">{t.errors.crashedBody}</p>
        <pre class="mono small" style="white-space:pre-wrap;overflow-x:auto">{error.message}</pre>
        <button class="primary btn-block" onClick={() => { this.setState({ error: null }); }}>
          {t.common.retry}
        </button>
      </div>
    );
  }
}
