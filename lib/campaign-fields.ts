/**
 * Campaign "need & impact" fields (migration 0030). Schools fill these when
 * creating a campaign; they feed the ASF school-profile/impact email.
 *
 * Plain module (imported by the client form AND server actions).
 * >>> After applying migration 0030, flip CAMPAIGN_IMPACT_READY -> true. <<<
 */
export const CAMPAIGN_IMPACT_READY = false;

export interface ImpactValues {
  students_reached: number | null;
  barrier: string;
  students_missing_out: string;
  usage_context: string;
  usage_frequency: string;
  participation_goal: string;
}

export const EMPTY_IMPACT: ImpactValues = {
  students_reached: null,
  barrier: "",
  students_missing_out: "",
  usage_context: "",
  usage_frequency: "",
  participation_goal: "",
};

/** Select fields, in display order, with their picklist options + labels. */
export const IMPACT_SELECTS = [
  {
    key: "barrier",
    label: "Why can't the school fund this itself?",
    options: [
      "Tight or shrinking school budget",
      "High-cost equipment beyond our means",
      "Community disadvantage / low-SES families",
      "Ageing, broken or unsafe equipment",
      "Growing enrolments outpacing resources",
      "Other",
    ],
  },
  {
    key: "students_missing_out",
    label: "Who is currently missing out?",
    options: [
      "Girls / female participation",
      "Students who can't afford club sport",
      "Students with disability",
      "First Nations students",
      "Newly arrived / EAL/D students",
      "All students — no suitable equipment",
      "Other",
    ],
  },
  {
    key: "usage_context",
    label: "Where and how will it be used?",
    options: [
      "PE / HPE classes",
      "Lunchtime and recess",
      "Before / after school",
      "A specific program",
      "School sport / carnivals",
      "Across multiple settings",
    ],
  },
  {
    key: "usage_frequency",
    label: "How often will it be used?",
    options: [
      "Daily",
      "Several times a week",
      "Weekly",
      "Occasionally / seasonally",
    ],
  },
  {
    key: "participation_goal",
    label: "Is it tied to a participation goal?",
    options: [
      "Getting inactive kids active",
      "Girls' participation",
      "Inclusion (disability / diverse learners)",
      "Broadening access to sport",
      "No specific goal",
      "Other",
    ],
  },
] as const;

/** The DB columns to write for a campaign's impact fields — empty (nothing
 *  written) until the migration is applied and the flag flipped. */
export function impactColumns(impact?: ImpactValues): Record<string, unknown> {
  if (!CAMPAIGN_IMPACT_READY || !impact) return {};
  return {
    students_reached: impact.students_reached ?? null,
    barrier: impact.barrier || null,
    students_missing_out: impact.students_missing_out || null,
    usage_context: impact.usage_context || null,
    usage_frequency: impact.usage_frequency || null,
    participation_goal: impact.participation_goal || null,
  };
}

/** Human labels for the impact fields (for the ASF email). */
export const IMPACT_LABELS: Record<keyof ImpactValues, string> = {
  students_reached: "Students reached",
  barrier: "Barrier to self-funding",
  students_missing_out: "Who's missing out",
  usage_context: "Where/how used",
  usage_frequency: "How often",
  participation_goal: "Participation goal",
};
