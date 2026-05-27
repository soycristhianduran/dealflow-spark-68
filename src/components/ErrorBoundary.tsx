import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center p-6 bg-background">
          <div className="max-w-md w-full text-center space-y-4">
            <div className="text-4xl">⚠️</div>
            <h1 className="text-xl font-semibold text-foreground">Algo salió mal</h1>
            <p className="text-sm text-muted-foreground">
              Ocurrió un error inesperado. Intenta recargar la página.
            </p>
            {this.state.errorMessage && (
              <p className="text-xs font-mono bg-muted rounded-lg px-3 py-2 text-muted-foreground text-left break-all">
                {this.state.errorMessage}
              </p>
            )}
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Recargar página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
