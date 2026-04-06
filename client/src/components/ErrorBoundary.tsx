import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">
            {this.props.fallbackMessage || 'Algo deu errado'}
          </h3>
          <p className="text-gray-400 mb-6 max-w-md">
            Ocorreu um erro inesperado nesta secao. Tente recarregar a pagina.
          </p>
          <div className="flex gap-3">
            <Button
              onClick={this.handleReset}
              variant="outline"
              className="border-gray-600 text-gray-300 hover:bg-gray-700"
            >
              Tentar novamente
            </Button>
            <Button
              onClick={() => window.location.reload()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Recarregar pagina
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
