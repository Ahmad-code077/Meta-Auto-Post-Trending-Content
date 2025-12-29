import { ThemeToggler } from "@/components/theme/ThemeToggler";
import Link from "next/link";
import { ArrowRight, Globe, ShieldCheck, Zap, BarChart3, Users } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-accent/20">
      {/* Navigation */}
      <nav className="container mx-auto px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold text-foreground">MetaPost</span>
          <span className="text-sm text-primary px-2 py-1 bg-primary/10 rounded-full">Dashboard</span>
        </div>

        <div className="flex items-center gap-4">
          <ThemeToggler />
          <Link
            href="/login"
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 font-medium transition-colors"
          >
            Login
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="container mx-auto px-6 py-16 md:py-24">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-full mb-6">
            <Globe className="w-4 h-4" />
            <span className="text-sm font-medium">Automated Content Management System</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6 leading-tight">
            Smart Content Moderation &<br />
            <span className="text-primary">Automated Post Management</span>
          </h1>

          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            A powerful dashboard that automatically fetches daily RSS feeds,
            curates content, and provides intelligent moderation tools for
            streamlined content approval workflows.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 px-8 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-semibold text-lg transition-colors"
            >
              Get Started
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="#features"
              className="inline-flex items-center justify-center gap-2 px-8 py-3 border border-input bg-background rounded-lg hover:bg-accent hover:text-accent-foreground font-semibold text-lg transition-colors"
            >
              Learn More
            </Link>
          </div>

          {/* Feature Highlights */}
          <div id="features" className="grid md:grid-cols-3 gap-8 mb-20">
            <div className="p-6 bg-card rounded-xl border border-border hover:border-primary/30 transition-colors">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Globe className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">Daily RSS Automation</h3>
              <p className="text-muted-foreground">
                Automatically fetches and parses the latest content from RSS feeds every day
              </p>
            </div>

            <div className="p-6 bg-card rounded-xl border border-border hover:border-primary/30 transition-colors">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <ShieldCheck className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">Smart Moderation</h3>
              <p className="text-muted-foreground">
                Advanced tools to approve, reject, and manage content with detailed insights
              </p>
            </div>

            <div className="p-6 bg-card rounded-xl border border-border hover:border-primary/30 transition-colors">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <BarChart3 className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">Analytics Dashboard</h3>
              <p className="text-muted-foreground">
                Track performance, engagement, and moderation statistics in real-time
              </p>
            </div>
          </div>

          {/* How It Works */}
          <div className="bg-card rounded-2xl border border-border p-8 mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-8 text-center">How It Works</h2>
            <div className="grid md:grid-cols-4 gap-6">
              {[
                { step: "1", title: "Fetch RSS", desc: "Automatically pulls latest content daily" },
                { step: "2", title: "Content Queue", desc: "Posts organized for review" },
                { step: "3", title: "Moderation", desc: "Approve/reject with custom rules" },
                { step: "4", title: "Publish", desc: "Schedule or publish approved content" }
              ].map((item) => (
                <div key={item.step} className="text-center">
                  <div className="w-10 h-10 bg-primary text-primary-foreground rounded-full flex items-center justify-center mx-auto mb-3 font-bold">
                    {item.step}
                  </div>
                  <h4 className="font-semibold text-foreground mb-1">{item.title}</h4>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Call to Action */}
          <div className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-2xl p-8 border border-primary/20">
            <h2 className="text-2xl font-bold text-foreground mb-4">Ready to Streamline Your Content Workflow?</h2>
            <p className="text-muted-foreground mb-6">
              Join content managers who save hours every day with automated post management.
            </p>
            <div className="flex items-center justify-center gap-6">
              <Link
                href="/login"
                className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-semibold transition-colors"
              >
                Start Moderating Now
              </Link>
              <div className="text-sm text-muted-foreground">
                <Users className="w-4 h-4 inline mr-1" />
                Trusted by content teams worldwide
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-6 text-center">
          <p className="text-muted-foreground text-sm">
            © {new Date().getFullYear()} MetaPost Dashboard. Automating content management since 2024.
          </p>
          <p className="text-xs text-muted-foreground/70 mt-2">
            Note: Signup is by invitation only. Contact admin for access.
          </p>
        </div>
      </footer>
    </div>
  );
}