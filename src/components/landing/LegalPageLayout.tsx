import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { KlosifyLogo } from "@/components/icons/KlosifyLogo";
import { Shield, FileText, ArrowLeft } from "lucide-react";

type Section = { id: string; title: string };

export function LegalPageLayout({
  title,
  subtitle,
  lastUpdated,
  sections,
  children,
}: {
  title: string;
  subtitle: string;
  lastUpdated: string;
  sections: Section[];
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 bg-slate-950/90 border-b border-slate-800/60 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <KlosifyLogo size={24} />
            <span className="font-bold text-sm text-white tracking-tight">
              Klosify <span className="text-orange-400">CRM</span>
            </span>
          </Link>
          <Link
            to="/"
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t("legalPageLayout.backToHome")}
          </Link>
        </div>
      </nav>

      {/* ── Hero header ── */}
      <div className="relative bg-slate-950 border-b border-slate-800/60 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_70%_at_50%_0%,rgba(249,115,22,0.08),transparent)] pointer-events-none" />
        <div className="max-w-6xl mx-auto px-6 py-14 relative">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
              <Shield className="w-4 h-4 text-orange-400" />
            </div>
            <span className="text-xs font-medium text-orange-400 uppercase tracking-widest">
              {t("legalPageLayout.legal")}
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white mb-3 leading-tight">
            {title}
          </h1>
          <p className="text-slate-400 max-w-xl leading-relaxed">{subtitle}</p>
          <p className="mt-3 text-xs text-slate-500">
            {t("legalPageLayout.lastUpdated", { date: lastUpdated })}
          </p>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex gap-10 items-start">

          {/* Sidebar nav — desktop */}
          <aside className="hidden lg:block w-56 shrink-0 sticky top-24">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-3">
              {t("legalPageLayout.sections")}
            </p>
            <nav className="space-y-0.5">
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="block text-sm text-slate-400 hover:text-white py-1.5 px-2 rounded-lg hover:bg-slate-800/60 transition-colors truncate"
                >
                  {s.title}
                </a>
              ))}
            </nav>

            {/* Links to other legal page */}
            <div className="mt-8 pt-6 border-t border-slate-800 space-y-1">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-2">
                {t("legalPageLayout.otherDocuments")}
              </p>
              <Link
                to="/privacy"
                className="flex items-center gap-2 text-sm text-slate-400 hover:text-white py-1.5 px-2 rounded-lg hover:bg-slate-800/60 transition-colors"
              >
                <Shield className="w-3.5 h-3.5" /> {t("legalPageLayout.privacy")}
              </Link>
              <Link
                to="/terms"
                className="flex items-center gap-2 text-sm text-slate-400 hover:text-white py-1.5 px-2 rounded-lg hover:bg-slate-800/60 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" /> {t("legalPageLayout.terms")}
              </Link>
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 min-w-0">
            <div className="legal-content">{children}</div>

            {/* Footer contact */}
            <div className="mt-16 pt-8 border-t border-slate-800">
              <p className="text-sm text-slate-400">
                {t("legalPageLayout.questions")}{" "}
                <a
                  href="mailto:hola@klosify.com"
                  className="text-orange-400 hover:text-orange-300 underline underline-offset-2"
                >
                  hola@klosify.com
                </a>
              </p>
            </div>
          </main>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-800/60 py-6 mt-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <KlosifyLogo size={18} />
            <span className="text-xs text-slate-500">{t("legalPageLayout.copyright")}</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <Link to="/privacy" className="hover:text-slate-300 transition-colors">{t("legalPageLayout.privacy")}</Link>
            <Link to="/terms" className="hover:text-slate-300 transition-colors">{t("legalPageLayout.terms")}</Link>
            <Link to="/data-deletion" className="hover:text-slate-300 transition-colors">{t("legalPageLayout.deleteData")}</Link>
          </div>
        </div>
      </footer>

      {/* ── Global styles for legal content ── */}
      <style>{`
        .legal-content h2 {
          font-size: 1.125rem;
          font-weight: 700;
          color: #f1f5f9;
          margin-top: 2.5rem;
          margin-bottom: 0.75rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid rgba(248,113,22,0.15);
          scroll-margin-top: 6rem;
        }
        .legal-content h2:first-child { margin-top: 0; }
        .legal-content h3 {
          font-size: 0.9375rem;
          font-weight: 600;
          color: #cbd5e1;
          margin-top: 1.5rem;
          margin-bottom: 0.5rem;
        }
        .legal-content p {
          font-size: 0.9375rem;
          line-height: 1.75;
          color: #94a3b8;
          margin-bottom: 0.875rem;
        }
        .legal-content ul {
          margin: 0.75rem 0 1rem 0;
          padding-left: 1.25rem;
          space-y: 0.25rem;
        }
        .legal-content ul li {
          font-size: 0.9375rem;
          line-height: 1.7;
          color: #94a3b8;
          margin-bottom: 0.375rem;
          list-style-type: disc;
        }
        .legal-content strong { color: #e2e8f0; }
        .legal-content code {
          background: rgba(249,115,22,0.08);
          border: 1px solid rgba(249,115,22,0.15);
          color: #fb923c;
          font-size: 0.8125rem;
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
        }
        .legal-content a {
          color: #fb923c;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .legal-content a:hover { color: #fdba74; }
      `}</style>
    </div>
  );
}
