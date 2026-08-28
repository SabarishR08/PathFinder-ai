"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Compass,
  Fingerprint,
  Scale,
  Route as RouteIcon,
  Hammer,
  RefreshCcw,
  BrainCircuit,
  Github,
  FileText,
  Trophy,
  MessagesSquare,
  Sparkles,
  ArrowRight,
} from "lucide-react";

const LOOP_STAGES = [
  {
    icon: Fingerprint,
    title: "1 · Prove",
    text: "Connect GitHub, LeetCode, Codeforces or paste your resume. Skills are extracted from real artefacts with evidence quotes — not self-report checkboxes.",
  },
  {
    icon: Scale,
    title: "2 · Calibrate",
    text: "Claims get audited against evidence. Over-claimed skills trigger a short quiz pitched at the claimed level. Pass to verify; fail and the plan adjusts honestly.",
  },
  {
    icon: RouteIcon,
    title: "3 · Plan",
    text: "A deterministic engine (topological sort + SPT scheduling over a 211-skill prerequisite DAG) orders your roadmap from 2,118 real courses. No hallucinated syllabi.",
  },
  {
    icon: Hammer,
    title: "4 · Build",
    text: "Every other phase ends with a ZPD-calibrated project — sized 1.5–3× your evidenced level so it stretches without breaking. Your path compounds into a portfolio.",
  },
  {
    icon: RefreshCcw,
    title: "5 · Adapt",
    text: "Quiz failures insert remediation. 'Too hard' feedback splits phases. Project passes re-plan the rest. The roadmap is a living document with diffs you can inspect.",
  },
];

const FEATURES = [
  {
    icon: Github,
    title: "GitHub skill forensics",
    text: "Repos, languages, READMEs and activity are ingested via the GitHub API and mapped to the skill graph — with per-skill evidence quotes and strength scores.",
  },
  {
    icon: Scale,
    title: "Dunning-Kruger defence",
    text: "The claims-vs-evidence radar exposes the gap between what you say you know and what your data supports — then closes it with calibration quizzes.",
  },
  {
    icon: BrainCircuit,
    title: "Aria, your AI mentor",
    text: "A streaming mentor grounded in your actual profile, path and progress. Socratic mode makes it guide instead of lecture.",
  },
  {
    icon: Trophy,
    title: "Project verification loop",
    text: "Submit a repo URL. The evaluator fetches your code, grades it against the rubric, and marks skills PROVEN — the strongest evidence tier.",
  },
  {
    icon: FileText,
    title: "Explainable everything",
    text: "Every skill, course and project answers 'why?' with three grounds: your evidence, the graph structure, and your goal — plus the counterfactual.",
  },
  {
    icon: Sparkles,
    title: "Zero-black-box engine",
    text: "Paths come from real algorithms with published complexity, running in ~30ms over real course data. LLMs handle conversation; math handles planning.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 border border-primary/30">
              <Compass className="h-4.5 w-4.5 text-primary" />
            </span>
            <span className="font-semibold tracking-tight">
              PathFinder<span className="text-primary"> AI</span>
            </span>
          </div>
          <Button asChild size="sm" className="glow-primary">
            <Link href="/onboarding">
              Start free <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(60% 45% at 50% 0%, oklch(0.72 0.14 162 / 0.13), transparent 70%), radial-gradient(35% 30% at 80% 20%, oklch(0.78 0.13 80 / 0.08), transparent 70%)",
            }}
          />
          <div className="relative mx-auto max-w-5xl px-4 sm:px-6 pt-20 pb-16 text-center">
            <Badge variant="outline" className="mb-6 border-primary/40 text-primary bg-primary/5">
              Every recommendation starts with proof
            </Badge>
            <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-[1.05]">
              Learning paths built on <span className="text-gradient">evidence</span>,
              <br />
              not vibes.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Most recommenders ask one question and guess the rest. PathFinder interviews you,
              audits your actual GitHub and competitive-programming record, calibrates what you
              claim against what you can prove, then generates a verifiable roadmap that adapts
              as you learn.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button asChild size="lg" className="glow-primary">
                <Link href="/onboarding">
                  Build my path <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/dashboard">I already have a profile</Link>
              </Button>
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <RouteIcon className="h-4 w-4 text-primary" /> 211-skill prerequisite DAG
              </span>
              <span className="flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-primary" /> 2,118 real courses
              </span>
              <span className="flex items-center gap-1.5">
                <Hammer className="h-4 w-4 text-primary" /> ZPD-calibrated projects
              </span>
              <span className="flex items-center gap-1.5">
                <RefreshCcw className="h-4 w-4 text-primary" /> Adaptive replanning
              </span>
            </div>
          </div>
        </section>

        {/* The loop */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">The closed loop</h2>
            <p className="mt-2 text-muted-foreground max-w-xl mx-auto">
              Personalisation isn&apos;t a one-time quiz — it&apos;s a cycle that keeps
              correcting itself with your real output.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-5">
            {LOOP_STAGES.map((stage) => (
              <Card key={stage.title} className="glass-card">
                <CardHeader className="pb-2">
                  <stage.icon className="h-6 w-6 text-primary mb-2" />
                  <CardTitle className="text-base">{stage.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground leading-relaxed">
                  {stage.text}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Built like a product, not a demo
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <Card key={f.title} className="glass-card">
                <CardHeader className="pb-2">
                  <f.icon className="h-5 w-5 text-primary mb-2" />
                  <CardTitle className="text-base">{f.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground leading-relaxed">{f.text}</CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-3xl px-4 sm:px-6 py-16 text-center">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Stop guessing what to learn next.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Ten minutes of onboarding — interview, evidence, calibration — and your roadmap
            exists, with every step justified.
          </p>
          <Button asChild size="lg" className="mt-6 glow-primary">
            <Link href="/onboarding">
              Start the interview <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </section>
      </main>

      <footer className="border-t border-border/70 py-6 mt-auto">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>PathFinder AI — evidence-based adaptive learning paths</span>
          <span>Deterministic engine · LLM-augmented UX · graceful degradation everywhere</span>
        </div>
      </footer>
    </div>
  );
}
