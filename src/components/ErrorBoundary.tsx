import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render/lifecycle errors so a blank white window is replaced by a message.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      const err = this.state.error;
      return (
        <div
          className="min-h-screen bg-background p-6 text-foreground"
          role="alert"
        >
          <h1 className="mb-4 text-lg font-semibold">
            界面渲染出错（ErrorBoundary）
          </h1>
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/50 p-4 text-xs">
            {err.message}
            {err.stack ? `\n\n${err.stack}` : ""}
          </pre>
          <p className="mt-4 text-sm text-muted-foreground">
            请打开开发者工具（若有）查看控制台，或将上述信息反馈给开发者。
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
