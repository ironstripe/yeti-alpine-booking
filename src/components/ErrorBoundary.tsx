import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('Application Error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
          <Card className="w-full max-w-lg">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
              <CardTitle className="text-xl">Etwas ist schiefgelaufen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-center text-muted-foreground">
                Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut 
                oder kontaktieren Sie den Support, falls das Problem weiterhin besteht.
              </p>
              
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <div className="rounded-md border bg-muted/50 p-3">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    Technische Details
                  </p>
                  <pre className="overflow-auto text-xs text-destructive">
                    {this.state.error.toString()}
                    {this.state.errorInfo?.componentStack}
                  </pre>
                </div>
              )}
              
              <div className="flex justify-center gap-3">
                <Button variant="outline" onClick={this.handleReset}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Erneut versuchen
                </Button>
                <Button onClick={() => window.location.href = '/'}>
                  <Home className="mr-2 h-4 w-4" />
                  Zur Startseite
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
