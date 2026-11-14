'use client';

import {
  Globe,
  Scale,
  GraduationCap,
  ExternalLink,
  Phone,
  Search,
  Building2,
  Truck,
  Hash,
  FileText,
  Upload,
  Bot,
  SpellCheck,
  Heart,
} from 'lucide-react';
import Header from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';

interface LinkCategory {
  title: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  links: { label: string; url: string }[];
}

const CATEGORIES: LinkCategory[] = [
  {
    title: 'BCA Website',
    icon: Globe,
    links: [
      { label: 'Benjamin Chaise & Associates', url: 'https://www.benjaminchaise.com' },
    ],
  },
  {
    title: 'Debt Collection Guidelines',
    icon: Scale,
    links: [
      { label: 'FDCPA Full Text (FTC)', url: 'https://www.ftc.gov/legal-library/browse/rules/fair-debt-collection-practices-act-text' },
    ],
  },
  {
    title: 'Training Portal',
    icon: GraduationCap,
    links: [
      { label: 'Training Videos & Materials', url: '/training' },
    ],
  },
  {
    title: 'USA Phone Area Codes',
    icon: Phone,
    links: [
      { label: 'allareacodes.com', url: 'https://www.allareacodes.com' },
    ],
  },
  {
    title: 'Free Skip Tracing Websites',
    icon: Search,
    links: [
      { label: 'Fast People Search', url: 'https://www.fastpeoplesearch.com' },
      { label: 'True People Search', url: 'https://www.truepeoplesearch.com' },
      { label: 'Search People Free', url: 'https://www.searchpeoplefree.com' },
      { label: 'Cyber Background Checks', url: 'https://www.cyberbackgroundchecks.com/' },
    ],
  },
  {
    title: 'Business Information Search',
    icon: Building2,
    links: [
      { label: 'Buzzfile', url: 'https://www.buzzfile.com/Home/Basic' },
    ],
  },
  {
    title: 'Commercial / Trucking Companies',
    icon: Truck,
    links: [
      { label: 'DOT Report', url: 'https://dot.report' },
    ],
  },
  {
    title: 'Business FEIN/EIN Numbers',
    icon: Hash,
    links: [
      { label: 'HIPAA Space EIN Verification', url: 'https://www.hipaaspace.com/ein/ein_verification/' },
    ],
  },
  {
    title: 'Combining Files into one PDF',
    icon: FileText,
    links: [
      { label: 'SmallPDF Merge', url: 'https://smallpdf.com/merge-pdf' },
      { label: 'CombinePDF', url: 'https://combinepdf.com/' },
      { label: 'PDFFiller', url: 'https://www.pdffiller.com' },
    ],
  },
  {
    title: 'Emailing Big Files',
    icon: Upload,
    links: [
      { label: 'WeTransfer', url: 'https://wetransfer.com' },
      { label: 'Filemail', url: 'https://www.filemail.com' },
      { label: 'FromSmash', url: 'https://fromsmash.com' },
    ],
  },
  {
    title: 'Help with Composing Emails or Content',
    icon: Bot,
    links: [
      { label: 'ChatGPT', url: 'https://chatgpt.com/' },
    ],
  },
  {
    title: 'Grammar Checker',
    icon: SpellCheck,
    links: [
      { label: 'QuillBot', url: 'https://quillbot.com/grammar-check' },
      { label: 'Grammarly', url: 'https://www.grammarly.com/grammar-check' },
      { label: 'GrammarCheck.net', url: 'https://www.grammarcheck.net/editor/' },
      { label: 'Scribbr', url: 'https://www.scribbr.com/grammar-checker/' },
    ],
  },
  {
    title: 'Helpful Overall',
    icon: Heart,
    links: [
      { label: 'Positivity Guides', url: 'https://www.positivityguides.net/this-is-why-success-benefits-you/' },
    ],
  },
];

export default function UsefulLinksPage() {
  return (
    <>
      <Header title="Useful Links" />

      <div className="mx-auto max-w-[1200px] pt-6">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isInternal = cat.links.length === 1 && cat.links[0].url.startsWith('/');
            return (
              <Card
                key={cat.title}
                className="h-full transition-all hover:border-[var(--accent)] hover:shadow-[var(--shadow-glow)]"
              >
                <CardContent className="p-5">
                  <div className="mb-3 flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: 'var(--bg-secondary)' }}
                    >
                      <Icon className="h-5 w-5" style={{ color: 'var(--accent)' }} />
                    </div>
                    <h3
                      className="text-sm font-semibold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {cat.title}
                    </h3>
                  </div>
                  <div className="space-y-1.5">
                    {cat.links.map((link) => (
                      <a
                        key={link.url}
                        href={link.url}
                        {...(isInternal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
                        className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-[var(--accent-subtle)]"
                        style={{ color: 'var(--accent)' }}
                      >
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-50 group-hover:opacity-100" />
                        <span className="truncate">{link.label}</span>
                      </a>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}
