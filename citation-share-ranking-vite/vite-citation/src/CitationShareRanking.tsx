import { ArrowDownRight, ArrowUpRight, Box, GitBranch, Database, Cog, Hammer, Cloud, Rocket } from "lucide-react";

const items = [
  { name: "Incredibuild", share: 4.4,  change: -1,   icon: Rocket,    tone: "primary" },
  { name: "CircleCI",     share: 0.3,  change: -0.1, icon: Cog,       tone: "muted" },
  { name: "Bazel",        share: 0,    change: 0,    icon: Hammer,    tone: "muted" },
  { name: "Datadog",      share: 0,    change: 0,    icon: Database,  tone: "muted" },
  { name: "GitLab CI",    share: 0,    change: 0,    icon: GitBranch, tone: "muted" },
  { name: "Jenkins",      share: 0,    change: 0,    icon: Box,       tone: "muted" },
  { name: "Travis CI",    share: 0,    change: 0,    icon: Cloud,     tone: "muted" },
];

export const CitationShareRanking = () => {
  return (
    <div className="bg-card rounded-2xl border border-border shadow-card p-6 transition-all hover:shadow-elevated">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3 className="text-base font-semibold text-foreground">Citation share ranking</h3>
          <p className="text-xs text-muted-foreground mt-1 italic">Relative performance in citation volume</p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success-soft text-success text-[11px] font-semibold uppercase tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          Live Data
        </span>
      </div>

      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {items.map((it, i) => {
          const up = it.change >= 0;
          const isTop = i === 0;
          const Icon = it.icon;
          return (
            <div
              key={it.name}
              className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-all ${
                isTop ? "border-primary/20 bg-primary/5" : "border-border hover:border-primary/20 hover:bg-secondary/40"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-[10px] font-bold text-muted-foreground tabular-nums w-4">{i + 1}</span>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isTop ? "bg-gradient-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate flex items-center gap-2">
                    {it.name}
                    {isTop && <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground font-semibold uppercase">You</span>}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Share</div>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {it.change !== 0 && (
                  <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${up ? "bg-success-soft text-success" : "bg-destructive-soft text-destructive"}`}>
                    {up ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                    {Math.abs(it.change)}%
                  </span>
                )}
                <span className="text-base font-bold text-foreground tabular-nums w-12 text-right">{it.share}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
