import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, TrendingUp, Calendar, Brain, Lightbulb, Upload } from "lucide-react";

export default function Landing() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen bg-poker-bg text-white">
      {/* Header */}
      <header className="border-b border-gray-700 bg-poker-surface">
        <div className="container mx-auto px-4 py-6 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Trophy className="h-8 w-8 text-poker-gold" />
            <h1 className="text-2xl font-bold text-poker-gold">Grindfy</h1>
          </div>
          <Button 
            onClick={handleLogin}
            className="bg-poker-green hover:bg-poker-green-light text-white"
          >
            Login
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16 text-center">
        <h2 className="text-4xl md:text-6xl font-bold mb-6">
          Your Ultimate <span className="text-poker-gold">Poker Tournament</span> Tracker
        </h2>
        <p className="text-xl text-gray-300 mb-8 max-w-3xl mx-auto">
          Transform your poker data into actionable insights. Track performance, 
          optimize your tournament selection, and maximize your ROI with our comprehensive analytics platform.
        </p>
        <Button 
          onClick={handleLogin}
          size="lg"
          className="bg-poker-green hover:bg-poker-green-light text-white text-lg px-8 py-3"
        >
          Get Started
        </Button>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-16">
        <h3 className="text-3xl font-bold text-center mb-12">
          Everything You Need to <span className="text-poker-gold">Dominate</span> the Tables
        </h3>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <Card className="bg-poker-surface border-gray-700">
            <CardHeader>
              <TrendingUp className="h-12 w-12 text-poker-green mb-4" />
              <CardTitle className="text-white">Performance Dashboard</CardTitle>
              <CardDescription className="text-gray-400">
                Track your ROI, profit evolution, and key metrics with beautiful charts and insights.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-poker-surface border-gray-700">
            <CardHeader>
              <Trophy className="h-12 w-12 text-poker-green mb-4" />
              <CardTitle className="text-white">Tournament Library</CardTitle>
              <CardDescription className="text-gray-400">
                Organize and analyze your tournament templates with detailed statistics and performance data.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-poker-surface border-gray-700">
            <CardHeader>
              <Calendar className="h-12 w-12 text-poker-green mb-4" />
              <CardTitle className="text-white">Weekly Planner</CardTitle>
              <CardDescription className="text-gray-400">
                Plan your tournament schedule with drag-and-drop functionality and profit optimization.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-poker-surface border-gray-700">
            <CardHeader>
              <Brain className="h-12 w-12 text-poker-green mb-4" />
              <CardTitle className="text-white">Mental Preparation</CardTitle>
              <CardDescription className="text-gray-400">
                Prepare mentally for sessions with checklists, goal setting, and performance tracking.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-poker-surface border-gray-700">
            <CardHeader>
              <Lightbulb className="h-12 w-12 text-poker-green mb-4" />
              <CardTitle className="text-white">Grade Coach</CardTitle>
              <CardDescription className="text-gray-400">
                Get AI-powered insights and recommendations to optimize your tournament selection.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-poker-surface border-gray-700">
            <CardHeader>
              <Upload className="h-12 w-12 text-poker-green mb-4" />
              <CardTitle className="text-white">Easy Data Import</CardTitle>
              <CardDescription className="text-gray-400">
                Import your tournament history from all major poker sites with simple file uploads.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-16 text-center">
        <div className="bg-poker-surface rounded-xl p-8 max-w-2xl mx-auto">
          <h3 className="text-3xl font-bold mb-4">Ready to Level Up Your Game?</h3>
          <p className="text-gray-300 mb-6">
            Join thousands of poker players who are already using Grindfy to optimize their performance.
          </p>
          <Button 
            onClick={handleLogin}
            size="lg"
            className="bg-poker-green hover:bg-poker-green-light text-white text-lg px-8 py-3"
          >
            Start Your Journey
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-700 bg-poker-surface py-8">
        <div className="container mx-auto px-4 text-center text-gray-400">
          <p>&copy; 2024 Grindfy. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
