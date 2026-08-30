"use client";

import { Component, type ReactNode, type ErrorInfo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";

interface Props {
  children: ReactNode;
  /** Label shown in the error card (e.g. "Interview", "Roadmap"). */
  stage?: string;
  /** Called when the user clicks "Go back". If omitted, the button is hidden. */
  onBack?: () => void;
  /** Called instead of full reload when the user clicks "Try again". */
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.stage ? `:${this.props.stage}` : ""}]`, error, info.componentStack);
  }

  handleRetry = () => {
    if (this.props.onRetry) {
      this.props.onRetry();
    }
    this.setState({ hasError: false, error: null });
  };

  handleBack = () => {
    this.setState({ hasError: false, error: null });
    this.props.onBack?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-xl mx-auto pt-10">
          <Card className="glass-card border-destructive/30">
            <CardHeader className="text-center pb-2">
              <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 border border-destructive/30">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </span>
              <CardTitle className="text-lg">
                Something went wrong{this.props.stage ? ` in ${this.props.stage}` : ""}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {friendlyMessage(this.state.error)}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {process.env.NODE_ENV === "development" && this.state.error && (
                <details className="rounded-lg bg-destructive/5 border border-destructive/20 p-3 text-xs font-mono text-destructive/80 overflow-auto max-h-40">
                  <summary className="cursor-pointer mb-1 font-sans text-sm text-muted-foreground">
                    Technical details
                  </summary>
                  <pre className="whitespace-pre-wrap">{this.state.error.message}</pre>
                  {this.state.error.stack && (
                    <pre className="whitespace-pre-wrap mt-2 opacity-60">{this.state.error.stack}</pre>
                  )}
                </details>
              )}
              <div className="flex gap-2">
                {this.props.onBack && (
                  <Button variant="outline" className="flex-1" onClick={this.handleBack}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Go back
                  </Button>
                )}
                <Button className="flex-1" onClick={this.handleRetry}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Try again
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

function friendlyMessage(error: Error | null): string {
  if (!error) return "An unexpected error occurred.";
  const msg = error.message.toLowerCase();
  if (msg.includes("network") || msg.includes("fetch")) {
    return "Network connection lost. Check your internet and try again.";
  }
  if (msg.includes("timeout")) {
    return "The request took too long. The server might be busy — try again in a moment.";
  }
  if (msg.includes("500") || msg.includes("internal")) {
    return "The server hit an internal error. This is temporary — try again.";
  }
  if (msg.includes("429") || msg.includes("rate")) {
    return "Too many requests. Wait a moment and try again.";
  }
  if (msg.includes("404") || msg.includes("not found")) {
    return "The requested resource wasn't found. It may have been removed.";
  }
  return "An unexpected error occurred. Try again or go back to a previous step.";
}
