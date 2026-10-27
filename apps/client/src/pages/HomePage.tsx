import { Link } from 'react-router-dom';
import { 
  Mail, Send, Users, BarChart2, Shield, Zap, ArrowRight, CheckCircle2, 
  Sparkles, MessageSquare, Target, TrendingUp, Globe, Lock, Clock, 
  Rocket, Star, Award, ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/features/auth/auth.store';
import { Logo } from '@/components/ui/Logo';

const features = [
  {
    icon: Send,
    title: 'Powerful Email Campaigns',
    desc: 'Build stunning emails with our rich text editor. Send personalized campaigns with merge variables and custom templates.',
    color: 'bg-gradient-to-br from-indigo-500 to-indigo-600',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
  },
  {
    icon: MessageSquare,
    title: 'WhatsApp Marketing',
    desc: 'Reach customers on WhatsApp through the official Meta Cloud API. Send approved templates and track delivery and read receipts.',
    color: 'bg-gradient-to-br from-emerald-500 to-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
  },
  {
    icon: Users,
    title: 'Smart Audience Management',
    desc: 'Import contacts via CSV, segment by behavior, and manage unlimited audience lists. Target the right people every time.',
    color: 'bg-gradient-to-br from-purple-500 to-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
  },
  {
    icon: BarChart2,
    title: 'Real-Time Analytics',
    desc: 'Track opens, clicks, and conversions in real-time. Detailed campaign reports with engagement metrics and trends.',
    color: 'bg-gradient-to-br from-blue-500 to-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
  {
    icon: Zap,
    title: '99%+ Deliverability',
    desc: 'Industry-leading inbox placement with custom SMTP support. Connect your own mail server or use our optimized infrastructure.',
    color: 'bg-gradient-to-br from-amber-500 to-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
  },
  {
    icon: Shield,
    title: 'Secure & Compliant',
    desc: 'Enterprise-grade security with automatic bounce handling, unsubscribe management, and GDPR compliance built-in.',
    color: 'bg-gradient-to-br from-rose-500 to-rose-600',
    bgColor: 'bg-rose-50',
    borderColor: 'border-rose-200',
  },
];

const stats = [
  { value: '12,000+', label: 'Active Users', icon: Users },
  { value: '50M+', label: 'Emails Sent', icon: Send },
  { value: '99.4%', label: 'Delivery Rate', icon: TrendingUp },
  { value: '24/7', label: 'Support', icon: Clock },
];

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    desc: 'Perfect for individuals and testing.',
    features: [
      '1,000 subscribers',
      '5,000 emails/month',
      'Basic analytics',
      'Email templates',
      'CSV import',
      'Community support'
    ],
    cta: 'Get Started Free',
    highlight: false,
  },
  {
    name: 'Starter',
    price: '$29',
    period: '/month',
    desc: 'For growing teams and businesses.',
    features: [
      '10,000 subscribers',
      '100,000 emails/month',
      'Advanced analytics',
      'WhatsApp campaigns',
      'A/B testing',
      'Priority support',
      'Custom SMTP',
      'Merge variables'
    ],
    cta: 'Start Free Trial',
    highlight: true,
  },
  {
    name: 'Pro',
    price: '$99',
    period: '/month',
    desc: 'For high-volume enterprise senders.',
    features: [
      'Unlimited subscribers',
      'Unlimited emails',
      'Full analytics suite',
      'Unlimited WhatsApp',
      'Dedicated IP',
      'API access',
      '24/7 phone support',
      'Custom domain',
      'White-label option'
    ],
    cta: 'Start Free Trial',
    highlight: false,
  },
];

const testimonials = [
  {
    name: 'Sarah Johnson',
    role: 'Marketing Director',
    company: 'TechCorp Inc.',
    image: '👩‍💼',
    quote: 'BulkFlow transformed our email marketing. We saw a 300% increase in engagement within the first month.',
    rating: 5,
  },
  {
    name: 'Michael Chen',
    role: 'CEO',
    company: 'StartupXYZ',
    image: '👨‍💼',
    quote: 'The WhatsApp integration is a game-changer. Our customers love the instant communication.',
    rating: 5,
  },
  {
    name: 'Emily Rodriguez',
    role: 'Growth Manager',
    company: 'E-commerce Plus',
    image: '👩‍💻',
    quote: 'Best email platform we\'ve used. The analytics are incredibly detailed and actionable.',
    rating: 5,
  },
];

export function HomePage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <div className="min-h-screen bg-white">
      {/* Modern Navigation */}
      <header className="sticky top-0 z-50 border-b border-slate-200/60 bg-white/90 backdrop-blur-xl shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Logo variant="full" size="md" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />

          <nav className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-sm font-semibold text-slate-600 hover:text-indigo-600 transition-colors">
              Features
            </a>
            <a href="#pricing" className="text-sm font-semibold text-slate-600 hover:text-indigo-600 transition-colors">
              Pricing
            </a>
            <a href="#testimonials" className="text-sm font-semibold text-slate-600 hover:text-indigo-600 transition-colors">
              Reviews
            </a>
          </nav>

          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <Link to="/dashboard">
                <Button size="sm" className="font-bold shadow-lg">
                  Dashboard <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/auth/login">
                  <Button variant="ghost" size="sm" className="font-semibold">
                    Sign in
                  </Button>
                </Link>
                <Link to="/auth/register">
                  <Button size="sm" className="font-bold shadow-lg bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800">
                    Get Started Free
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section with Gradient Background */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-50 via-indigo-50/30 to-purple-50/20 pt-20 pb-32">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-0 right-0 -mt-40 -mr-40 w-96 h-96 rounded-full bg-indigo-400/20 blur-3xl animate-pulse-slow" />
          <div className="absolute bottom-0 left-0 -mb-40 -ml-40 w-96 h-96 rounded-full bg-purple-400/20 blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-blue-400/10 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-6xl px-6 text-center">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border-2 border-indigo-200 bg-white px-4 py-2 text-sm font-bold text-indigo-700 shadow-lg animate-fade-in">
            <Sparkles className="h-4 w-4 text-yellow-500 animate-pulse" />
            <span>Now with WhatsApp Marketing Integration</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-5xl font-extrabold leading-tight tracking-tight text-slate-900 md:text-7xl lg:text-8xl animate-fade-in">
            Multi-Channel Marketing
            <br />
            <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              Made Simple
            </span>
          </h1>

          {/* Subheadline */}
          <p className="mx-auto mt-8 max-w-3xl text-lg md:text-xl text-slate-600 leading-relaxed animate-fade-in">
            Send powerful email campaigns and WhatsApp messages to your audience. 
            Track engagement in real-time with advanced analytics. All from one intuitive platform.
          </p>

          {/* CTA Buttons */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in">
            <Link to="/auth/register">
              <Button size="lg" className="px-8 py-6 text-base font-bold shadow-2xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 hover:scale-105 transition-transform">
                <Rocket className="h-5 w-5 mr-2" />
                Start Free Trial
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </Link>
            <a href="#features">
              <Button variant="secondary" size="lg" className="px-8 py-6 text-base font-bold shadow-lg hover:shadow-xl">
                Explore Features
                <ChevronRight className="h-5 w-5 ml-2" />
              </Button>
            </a>
          </div>

          {/* Trust Indicators */}
          <p className="mt-6 text-sm text-slate-500 font-medium animate-fade-in">
            <CheckCircle2 className="inline h-4 w-4 text-emerald-500 mr-1" />
            No credit card required
            <span className="mx-3">•</span>
            <CheckCircle2 className="inline h-4 w-4 text-emerald-500 mr-1" />
            Free plan forever
            <span className="mx-3">•</span>
            <CheckCircle2 className="inline h-4 w-4 text-emerald-500 mr-1" />
            Cancel anytime
          </p>

          {/* Stats Row */}
          <div className="mt-16 grid grid-cols-2 gap-6 sm:grid-cols-4 max-w-4xl mx-auto">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="text-center bg-white/60 backdrop-blur-sm rounded-2xl p-6 border-2 border-slate-200/50 shadow-lg hover:shadow-xl transition-shadow">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white mb-3">
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="text-3xl font-extrabold text-slate-900">{stat.value}</p>
                  <p className="text-sm font-semibold text-slate-600 mt-1">{stat.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-white">
        <div className="mx-auto max-w-7xl px-6">
          {/* Section Header */}
          <div className="mb-16 text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 border-2 border-indigo-200 px-4 py-2 text-sm font-bold text-indigo-700 mb-4">
              <Target className="h-4 w-4" />
              <span>Powerful Features</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight">
              Everything you need to succeed
            </h2>
            <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
              Built for marketers who want results without the complexity. Start sending in minutes.
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className={`group relative rounded-2xl border-2 ${feature.borderColor} ${feature.bgColor} p-8 hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 animate-fade-in`}
                  style={{ animationDelay: `${idx * 0.1}s` }}
                >
                  {/* Icon */}
                  <div className={`inline-flex h-14 w-14 items-center justify-center rounded-xl ${feature.color} text-white shadow-lg group-hover:scale-110 transition-transform`}>
                    <Icon className="h-7 w-7" />
                  </div>

                  {/* Content */}
                  <h3 className="mt-6 text-xl font-bold text-slate-900">
                    {feature.title}
                  </h3>
                  <p className="mt-3 text-slate-600 leading-relaxed">
                    {feature.desc}
                  </p>

                  {/* Hover Arrow */}
                  <div className="mt-4 flex items-center text-sm font-bold text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    Learn more
                    <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Social Proof / Testimonials */}
      <section id="testimonials" className="py-24 bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
        <div className="mx-auto max-w-7xl px-6">
          {/* Section Header */}
          <div className="mb-16 text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 border-2 border-amber-200 px-4 py-2 text-sm font-bold text-amber-700 mb-4">
              <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
              <span>Loved by Thousands</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight">
              Don't just take our word for it
            </h2>
            <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
              Join thousands of businesses already growing with BulkFlow.
            </p>
          </div>

          {/* Testimonials Grid */}
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((testimonial, idx) => (
              <div
                key={testimonial.name}
                className="bg-white rounded-2xl border-2 border-slate-200 p-8 shadow-lg hover:shadow-2xl transition-all hover:-translate-y-1"
              >
                {/* Stars */}
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: testimonial.rating }).map((_, i) => (
                    <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>

                {/* Quote */}
                <p className="text-slate-700 leading-relaxed mb-6">
                  "{testimonial.quote}"
                </p>

                {/* Author */}
                <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                  <div className="text-3xl">{testimonial.image}</div>
                  <div>
                    <p className="font-bold text-slate-900">{testimonial.name}</p>
                    <p className="text-sm text-slate-600">
                      {testimonial.role} at {testimonial.company}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 bg-white">
        <div className="mx-auto max-w-7xl px-6">
          {/* Section Header */}
          <div className="mb-16 text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 border-2 border-emerald-200 px-4 py-2 text-sm font-bold text-emerald-700 mb-4">
              <Award className="h-4 w-4" />
              <span>Transparent Pricing</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight">
              Choose your plan
            </h2>
            <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
              Start free. Scale as you grow. No hidden fees or surprises.
            </p>
          </div>

          {/* Pricing Cards */}
          <div className="grid gap-8 md:grid-cols-3 max-w-6xl mx-auto">
            {plans.map((plan, idx) => (
              <div
                key={plan.name}
                className={`relative rounded-3xl border-2 p-8 transition-all duration-300 hover:-translate-y-2 ${
                  plan.highlight
                    ? 'border-indigo-500 bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-700 text-white shadow-2xl scale-105'
                    : 'border-slate-200 bg-white hover:shadow-2xl'
                }`}
              >
                {/* Popular Badge */}
                {plan.highlight && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-yellow-400 to-orange-400 px-4 py-1.5 text-xs font-extrabold text-slate-900 shadow-lg">
                      <Sparkles className="h-3.5 w-3.5" />
                      Most Popular
                    </span>
                  </div>
                )}

                {/* Plan Name */}
                <div className="mb-6">
                  <p className={`text-sm font-bold uppercase tracking-wide ${plan.highlight ? 'text-indigo-200' : 'text-slate-500'}`}>
                    {plan.name}
                  </p>
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className={`text-5xl font-extrabold tracking-tight ${plan.highlight ? 'text-white' : 'text-slate-900'}`}>
                      {plan.price}
                    </span>
                    <span className={`text-lg font-semibold ${plan.highlight ? 'text-indigo-200' : 'text-slate-500'}`}>
                      {plan.period}
                    </span>
                  </div>
                  <p className={`mt-3 text-sm ${plan.highlight ? 'text-indigo-100' : 'text-slate-600'}`}>
                    {plan.desc}
                  </p>
                </div>

                {/* Features List */}
                <ul className="mb-8 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <CheckCircle2 className={`h-5 w-5 shrink-0 mt-0.5 ${plan.highlight ? 'text-emerald-300' : 'text-emerald-500'}`} />
                      <span className={`text-sm font-medium ${plan.highlight ? 'text-white' : 'text-slate-700'}`}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <Link to="/auth/register">
                  <Button
                    size="lg"
                    className={`w-full font-bold text-base py-6 ${
                      plan.highlight
                        ? 'bg-white text-indigo-700 hover:bg-slate-50 shadow-xl'
                        : 'bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white shadow-lg'
                    }`}
                  >
                    {plan.cta}
                    <ArrowRight className="h-5 w-5 ml-2" />
                  </Button>
                </Link>
              </div>
            ))}
          </div>

          {/* Enterprise CTA */}
          <div className="mt-16 text-center">
            <p className="text-slate-600 font-medium">
              Need more than 1M emails per month?{' '}
              <a href="#contact" className="text-indigo-600 font-bold hover:text-indigo-700 hover:underline">
                Contact our sales team →
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 py-24">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-full h-full" style={{ 
            backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
            backgroundSize: '32px 32px'
          }} />
        </div>

        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 px-4 py-2 text-sm font-bold text-white mb-6">
            <Rocket className="h-4 w-4" />
            <span>Ready to Get Started?</span>
          </div>

          <h2 className="text-4xl md:text-6xl font-extrabold text-white tracking-tight">
            Start sending campaigns today
          </h2>
          <p className="mt-6 text-xl text-indigo-100 max-w-2xl mx-auto leading-relaxed">
            Join 12,000+ businesses using BulkFlow to reach their audience. 
            No credit card required. Free forever plan available.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/auth/register">
              <Button 
                size="lg" 
                className="px-10 py-7 text-lg font-bold bg-white text-indigo-700 hover:bg-slate-50 shadow-2xl hover:scale-105 transition-transform"
              >
                <Send className="h-5 w-5 mr-2" />
                Create Free Account
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </Link>
            <Link to="/auth/login">
              <Button 
                variant="ghost"
                size="lg" 
                className="px-10 py-7 text-lg font-bold text-white border-2 border-white/30 bg-white/10 backdrop-blur-sm hover:bg-white/20"
              >
                Sign In
              </Button>
            </Link>
          </div>

          {/* Trust Badges */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-6 text-white/80">
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              <span className="text-sm font-semibold">Enterprise Security</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <span className="text-sm font-semibold">GDPR Compliant</span>
            </div>
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              <span className="text-sm font-semibold">99.9% Uptime</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t-2 border-slate-200 bg-slate-50 py-12">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {/* Company */}
            <div>
              <Logo variant="full" size="sm" />
              <p className="mt-4 text-sm text-slate-600">
                Multi-channel marketing platform for modern businesses.
              </p>
              <div className="mt-4 flex gap-3">
                <a href="#" className="text-slate-400 hover:text-slate-600 transition-colors">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" /></svg>
                </a>
                <a href="#" className="text-slate-400 hover:text-slate-600 transition-colors">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" /></svg>
                </a>
                <a href="#" className="text-slate-400 hover:text-slate-600 transition-colors">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" /></svg>
                </a>
              </div>
            </div>

            {/* Product */}
            <div>
              <h3 className="font-bold text-slate-900 mb-4">Product</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="text-slate-600 hover:text-indigo-600">Features</a></li>
                <li><a href="#pricing" className="text-slate-600 hover:text-indigo-600">Pricing</a></li>
                <li><a href="#" className="text-slate-600 hover:text-indigo-600">API</a></li>
                <li><a href="#" className="text-slate-600 hover:text-indigo-600">Integrations</a></li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <h3 className="font-bold text-slate-900 mb-4">Company</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="text-slate-600 hover:text-indigo-600">About</a></li>
                <li><a href="#" className="text-slate-600 hover:text-indigo-600">Blog</a></li>
                <li><a href="#" className="text-slate-600 hover:text-indigo-600">Careers</a></li>
                <li><a href="#" className="text-slate-600 hover:text-indigo-600">Contact</a></li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h3 className="font-bold text-slate-900 mb-4">Legal</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="text-slate-600 hover:text-indigo-600">Privacy</a></li>
                <li><a href="#" className="text-slate-600 hover:text-indigo-600">Terms</a></li>
                <li><a href="#" className="text-slate-600 hover:text-indigo-600">Security</a></li>
                <li><a href="#" className="text-slate-600 hover:text-indigo-600">GDPR</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-slate-200 text-center">
            <p className="text-sm text-slate-500">
              © {new Date().getFullYear()} BulkFlow. All rights reserved. Built with ❤️ for marketers.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
