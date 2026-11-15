/** A calendar month written as `YYYY-MM`. */
export type YearMonth = `${number}-${number}`;

export interface SocialLink {
  readonly label: string;
  readonly url: string;
}

export interface Profile {
  readonly name: string;
  readonly role: string;
  readonly employer: string;
  readonly employerUrl: string;
  readonly location: string;
  readonly tagline: string;
  readonly bio: readonly string[];
  /** Site-relative path to the CV PDF, or `null` to hide the CV button. */
  readonly cvPdfPath: string | null;
  readonly socials: readonly SocialLink[];
}

export interface Degree {
  readonly title: string;
  readonly year: number;
  readonly institution: string;
}

export interface Job {
  readonly title: string;
  readonly company: string;
  readonly companyUrl?: string;
  readonly summary: string;
  readonly location: string;
  readonly start: YearMonth;
  /** `null` means the role is current. */
  readonly end: YearMonth | null;
  readonly bullets: readonly string[];
  /** How many bullets to show before the rest are folded away. */
  readonly visibleBullets: number;
  readonly stack: readonly string[];
}

export interface Publication {
  readonly title: string;
  readonly authors: string;
  readonly venue: string;
  readonly year: number;
  readonly links: readonly SocialLink[];
}
