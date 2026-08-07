import {
  Search,
  LayoutDashboard,
  Phone,
  Clock,
  Users,
  BarChart3,
  BookOpen,
  Link2,
  Building2,
  UserCog,
  Timer,
  Star,
  MessageCircle,
  FileUp,
  Video,
  Map,
  Shield,
  Monitor,
  MonitorCog,
  ClipboardList,
  ListChecks,
  Ticket,
  Printer,
  Ban,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permissionKey: string;
  children?: NavItem[];
}

export const navigation: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/',
    icon: LayoutDashboard,
    permissionKey: 'dashboard',
  },
  {
    label: 'Calls',
    href: '/calls',
    icon: Phone,
    permissionKey: 'calls',
  },
  {
    label: 'Leads Available',
    href: '/leads-available',
    icon: ListChecks,
    permissionKey: 'calls',
  },
  {
    label: 'Time Clock',
    href: '/clock',
    icon: Clock,
    permissionKey: 'clock',
  },
  {
    label: 'Existing Clients',
    href: '/clients',
    icon: Users,
    permissionKey: 'clients',
  },
  {
    label: 'Training',
    href: '/training',
    icon: BookOpen,
    permissionKey: 'training',
  },
  {
    label: 'Resources',
    href: '/resources/links',
    icon: Link2,
    permissionKey: 'resources',
    children: [
      { label: 'Useful Links', href: '/resources/links', icon: Link2, permissionKey: 'resources' },
      { label: 'Time Zones & Weather', href: '/resources/timezones', icon: Map, permissionKey: 'resources' },
      { label: 'Business Entities', href: '/resources/entities', icon: Building2, permissionKey: 'resources' },
    ],
  },
  {
    label: 'Reports',
    href: '/reports',
    icon: BarChart3,
    permissionKey: 'reports',
    children: [
      { label: 'Call Reports', href: '/reports', icon: BarChart3, permissionKey: 'reports' },
      { label: 'Video Reports', href: '/reports/videos', icon: Video, permissionKey: 'reports' },
    ],
  },
  {
    label: 'Maintenance',
    href: '/maintenance',
    icon: Monitor,
    permissionKey: 'maintenance',
  },
];

export const adminNavigation: NavItem[] = [
  {
    label: 'Users',
    href: '/admin/users',
    icon: UserCog,
    permissionKey: 'admin_users',
  },
  {
    label: 'Time Management',
    href: '/admin/time',
    icon: Timer,
    permissionKey: 'admin_time',
  },
  {
    label: 'Quotes',
    href: '/admin/quotes',
    icon: Star,
    permissionKey: 'admin_quotes',
  },
  {
    label: 'Rebuttals',
    href: '/admin/rebuttals',
    icon: MessageCircle,
    permissionKey: 'admin_rebuttals',
  },
  // Grouped because they are one job: where leads come from, and what is
  // refused on the way in. Blacklist stays a sibling rather than a section of
  // Find New Leads — the same two lists also filter the CSV importer, and
  // burying it under the scraper hides it from whoever imports by hand.
  {
    label: 'Leads',
    href: '/admin/find-leads',
    icon: Search,
    permissionKey: 'admin_import',
    children: [
      { label: 'Find New Leads', href: '/admin/find-leads', icon: Search, permissionKey: 'admin_import' },
      { label: 'Import Leads', href: '/admin/import', icon: FileUp, permissionKey: 'admin_import' },
      { label: 'Blacklist', href: '/admin/blacklist', icon: Ban, permissionKey: 'admin_import' },
    ],
  },
  {
    label: 'Permissions',
    href: '/admin/permissions',
    icon: Shield,
    permissionKey: 'admin_permissions',
  },
  {
    label: 'IT Maintenance',
    href: '/admin/maintenance/computers',
    icon: MonitorCog,
    permissionKey: 'admin_maintenance',
    children: [
      { label: 'Computers', href: '/admin/maintenance/computers', icon: Monitor, permissionKey: 'admin_maintenance' },
      { label: 'Printers', href: '/admin/maintenance/printers', icon: Printer, permissionKey: 'admin_maintenance' },
      { label: 'Logs', href: '/admin/maintenance/logs', icon: ClipboardList, permissionKey: 'admin_maintenance' },
      { label: 'Tickets', href: '/admin/maintenance/tickets', icon: Ticket, permissionKey: 'admin_maintenance' },
    ],
  },
];
