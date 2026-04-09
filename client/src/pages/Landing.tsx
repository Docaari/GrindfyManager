import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  BarChart3,
  Library,
  Calendar,
  Radio,
  Brain,
  Upload,
  Check,
  Star,
  ArrowRight,
  Trophy,
} from "lucide-react";
import { useLocation } from "wouter";
import { getLandingFeatures } from "@/lib/landing-content-helpers";
import { getFAQItems, getTestimonials, getSocialProofStats } from "@/lib/landing-content-helpers";
import { getPricingPlans, formatPrice } from "@/lib/landing-pricing-helpers";

const iconMap: Record<string, React.ElementType> = {
  BarChart3,
  Library,
  Calendar,
  Radio,
  Brain,
  Upload,
};

export default function Landing() {
  const [, setLocation] = useLocation();

  const features = getLandingFeatures();
  const faqs = getFAQItems();
  const testimonials = getTestimonials();
  const socialProofStats = getSocialProofStats();
  const pricingPlans = getPricingPlans();

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Trophy className="h-7 w-7 text-emerald-500" />
            <span className="text-2xl font-bold">
              <span className="text-white">Grind</span>
              <span className="text-emerald-500">fy</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              onClick={() => setLocation("/login")}
              className="text-gray-300 hover:text-white"
            >
              Login
            </Button>
            <Button
              onClick={() => setLocation("/register")}
              className="bg-emerald-500 hover:bg-emerald-600 text-black font-semibold"
            >
              Criar Conta Gratis
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 via-transparent to-transparent" />
        <div className="container mx-auto px-4 py-20 md:py-32 text-center relative z-10">
          <Badge variant="outline" className="mb-6 border-emerald-500/30 text-emerald-400 px-4 py-1">
            Plataforma #1 para grinders de MTT
          </Badge>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
            Controle total sobre sua{" "}
            <span className="text-emerald-500">carreira no poker</span>
          </h1>
          <p className="text-lg md:text-xl text-gray-400 mb-10 max-w-3xl mx-auto leading-relaxed">
            Importe seus historicos, analise sua performance com dashboards completos,
            planeje sua grade semanal e acompanhe sessoes em tempo real.
            Tudo em um so lugar.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              onClick={() => setLocation("/register")}
              className="bg-emerald-500 hover:bg-emerald-600 text-black font-semibold text-lg px-8 py-3"
            >
              Criar Conta Gratis
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="lg"
              onClick={() => setLocation("/login")}
              className="text-gray-300 hover:text-white text-lg"
            >
              Ja tem conta? Login
            </Button>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="border-y border-gray-800 bg-gray-900/50">
        <div className="container mx-auto px-4 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {socialProofStats.map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-emerald-500 mb-1">
                  {stat.value}
                </div>
                <div className="text-sm text-gray-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Tudo que voce precisa para{" "}
            <span className="text-emerald-500">evoluir no poker</span>
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Ferramentas profissionais para jogadores que levam o grind a serio.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => {
            const IconComponent = iconMap[feature.icon] || BarChart3;
            return (
              <Card
                key={i}
                className="bg-gray-900/50 border-gray-800 hover:border-emerald-500/30 transition-colors"
              >
                <CardHeader>
                  <div className="h-12 w-12 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-4">
                    <IconComponent className="h-6 w-6 text-emerald-500" />
                  </div>
                  <CardTitle className="text-white text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-400">{feature.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Pricing Section */}
      <section className="bg-gray-900/30 py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Planos que cabem no seu{" "}
              <span className="text-emerald-500">bankroll</span>
            </h2>
            <p className="text-gray-400 text-lg">
              Comece gratis e evolua quando estiver pronto.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {pricingPlans.map((plan) => (
              <Card
                key={plan.id}
                className={`relative bg-gray-900/80 border-gray-800 ${
                  plan.highlighted
                    ? "border-emerald-500 ring-1 ring-emerald-500/20"
                    : ""
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-emerald-500 text-black font-semibold px-3">
                      Recomendado
                    </Badge>
                  </div>
                )}
                {plan.discount && (
                  <div className="absolute -top-3 right-4">
                    <Badge variant="outline" className="border-emerald-500/50 text-emerald-400">
                      -{plan.discount}%
                    </Badge>
                  </div>
                )}
                <CardHeader className="text-center pb-4">
                  <CardTitle className="text-white text-xl">{plan.name}</CardTitle>
                  <div className="mt-4">
                    <span className="text-4xl font-bold text-white">
                      {formatPrice(plan.price)}
                    </span>
                    {plan.price > 0 && (
                      <span className="text-gray-400 ml-1">/{plan.period}</span>
                    )}
                  </div>
                  {plan.totalAnnual && (
                    <p className="text-sm text-gray-500 mt-1">
                      {formatPrice(plan.totalAnnual)} por ano
                    </p>
                  )}
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3 mb-6">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-300 text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className={`w-full ${
                      plan.highlighted
                        ? "bg-emerald-500 hover:bg-emerald-600 text-black font-semibold"
                        : "bg-gray-800 hover:bg-gray-700 text-white"
                    }`}
                    onClick={() =>
                      setLocation(plan.id === "free" ? "/register" : "/register")
                    }
                  >
                    {plan.cta}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            O que dizem os{" "}
            <span className="text-emerald-500">jogadores</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {testimonials.map((testimonial, i) => (
            <Card key={i} className="bg-gray-900/50 border-gray-800">
              <CardContent className="pt-6">
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, j) => (
                    <Star
                      key={j}
                      className="h-4 w-4 fill-emerald-500 text-emerald-500"
                    />
                  ))}
                </div>
                <p className="text-gray-300 mb-4 italic">
                  &ldquo;{testimonial.quote}&rdquo;
                </p>
                <div>
                  <p className="text-white font-semibold">{testimonial.name}</p>
                  <p className="text-gray-500 text-sm">{testimonial.role}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* FAQ Section */}
      <section className="bg-gray-900/30 py-20">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Perguntas{" "}
              <span className="text-emerald-500">frequentes</span>
            </h2>
          </div>

          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((faq, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="border border-gray-800 rounded-lg px-4 bg-gray-900/50"
              >
                <AccordionTrigger className="text-white hover:text-emerald-400 text-left">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-gray-400">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA Final */}
      <section className="container mx-auto px-4 py-20 text-center">
        <div className="bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-emerald-500/10 rounded-2xl p-12 max-w-3xl mx-auto border border-emerald-500/20">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Pronto para comecar?
          </h2>
          <p className="text-gray-400 mb-8 text-lg">
            Crie sua conta gratis e comece a analisar sua performance hoje mesmo.
          </p>
          <Button
            size="lg"
            onClick={() => setLocation("/register")}
            className="bg-emerald-500 hover:bg-emerald-600 text-black font-semibold text-lg px-8 py-3"
          >
            Criar Conta Gratis
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 bg-gray-950 py-8">
        <div className="container mx-auto px-4 text-center text-gray-500">
          <p>&copy; 2026 Grindfy. Todos os direitos reservados.</p>
          <div className="flex items-center justify-center gap-6 mt-4 text-sm">
            <button
              onClick={() => setLocation("/login")}
              className="hover:text-emerald-400 transition-colors"
            >
              Login
            </button>
            <button
              onClick={() => setLocation("/register")}
              className="hover:text-emerald-400 transition-colors"
            >
              Criar Conta
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
