import { Calendar } from "lucide-react";

export function LoadingScreen() {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center transition-all duration-500 ease-in-out">
      <div className="text-center animate-fadeIn">
        {/* Logo Container with pulse animation */}
        <div className="mb-8">
          <div className="w-32 h-32 mx-auto bg-emerald-600 rounded-full flex items-center justify-center mb-4 animate-pulse">
            <Calendar className="w-16 h-16 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-wide">Grindfy</h1>
          <h2 className="text-xl text-emerald-400 font-semibold">Grade Planner</h2>
        </div>

        {/* Loading Text */}
        <div className="mb-8">
          <p className="text-lg text-slate-300 mb-4 animate-pulse">Carregando dados do usu&#225;rio</p>

          {/* Loading Animation */}
          <div className="flex justify-center space-x-1">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="text-sm text-slate-400 max-w-md mx-auto">
          <p className="leading-relaxed">Preparando sua grade de torneios e configura&#231;&#245;es personalizadas...</p>
        </div>
      </div>
    </div>
  );
}
