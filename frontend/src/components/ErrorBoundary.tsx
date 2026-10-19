import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[NSaiPetroSoft ErrorBoundary Caught]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetState = () => {
    if (window.confirm('Resetting local state will clear un-synced cache and reload the application. Proceed?')) {
      try {
        localStorage.removeItem('nsai_offline_queue');
        localStorage.removeItem('nsai_auth_token');
        sessionStorage.clear();
      } catch (e) {
        console.warn('Cache clear error:', e);
      }
      window.location.reload();
    }
  };

  private toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            backgroundColor: 'rgba(10, 36, 106, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, sans-serif',
          }}
        >
          <div
            style={{
              backgroundColor: '#ece9d8',
              border: '2px solid #ffffff',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 1px 1px #fff, inset -1px -1px #808080',
              borderRadius: '4px',
              width: '100%',
              maxWidth: '560px',
              overflow: 'hidden',
            }}
          >
            {/* Title Bar */}
            <div
              style={{
                background: 'linear-gradient(90deg, #0a246a 0%, #a6caf0 100%)',
                color: '#ffffff',
                padding: '6px 10px',
                fontWeight: 700,
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>{this.props.fallbackTitle || 'NSaiPetroSoft - Application Recovery'}</span>
              <span style={{ fontSize: '11px', opacity: 0.8 }}>Fault Tolerant Recovery</span>
            </div>

            {/* Dialog Body */}
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div style={{ fontSize: '36px', lineHeight: 1 }}>⚠️</div>
                <div>
                  <h3 style={{ margin: '0 0 6px 0', fontSize: '16px', color: '#0a246a' }}>
                    Client-Side Runtime Exception Intercepted
                  </h3>
                  <p style={{ margin: '0', fontSize: '13px', color: '#333333', lineHeight: 1.4 }}>
                    A component encountered an unexpected error. Your offline transaction records and database data
                    remain secure.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={this.handleReload}
                  style={{
                    backgroundColor: '#0055ea',
                    color: '#ffffff',
                    border: '1px solid #002f80',
                    borderRadius: '3px',
                    padding: '8px 16px',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                    boxShadow: 'inset 1px 1px #80aaff, inset -1px -1px #002f80',
                  }}
                >
                  ⟳ Reload Application
                </button>

                <button
                  type="button"
                  onClick={this.handleResetState}
                  style={{
                    backgroundColor: '#ffffff',
                    color: '#c00000',
                    border: '1px solid #7f9db9',
                    borderRadius: '3px',
                    padding: '8px 14px',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  🧹 Clear Cache & Reload
                </button>

                <button
                  type="button"
                  onClick={this.toggleDetails}
                  style={{
                    backgroundColor: '#ece9d8',
                    color: '#444444',
                    border: '1px solid #808080',
                    borderRadius: '3px',
                    padding: '8px 12px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    marginLeft: 'auto',
                  }}
                >
                  {this.state.showDetails ? 'Hide Diagnostics' : 'View Diagnostics ▼'}
                </button>
              </div>

              {/* Collapsible Error Diagnostics */}
              {this.state.showDetails && (
                <div
                  style={{
                    marginTop: '16px',
                    padding: '12px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #808080',
                    borderRadius: '3px',
                    maxHeight: '180px',
                    overflowY: 'auto',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    color: '#b00020',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}
                >
                  <strong>Error:</strong> {this.state.error?.toString()}
                  {this.state.errorInfo?.componentStack && (
                    <>
                      <br />
                      <br />
                      <strong>Component Stack:</strong>
                      {this.state.errorInfo.componentStack}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
export default ErrorBoundary;
