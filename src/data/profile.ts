import type { Degree, Profile, Publication } from "./types";

export const profile: Profile = {
  name: "Sissy Themeli",
  role: "Staff Software Engineer",
  employer: "Unitary",
  employerUrl: "https://www.unitary.ai/",
  location: "Athens, Greece",
  tagline:
    "Staff Software Engineer building platforms where AI agents and human experts automate back-office work.",
  bio: [
    "I'm a software engineer based in Athens, Greece, with over ten years of experience designing scalable backend systems, APIs and microservices in startups. I have built event-driven architectures that process millions of items, and I work mainly with Python, Temporal, Kubernetes and AWS.",
    "At Unitary I architected a Temporal-based workflow orchestration platform where AI agents and human experts automate back-office work in insurance and healthcare. I also build AI coding agents that turn business procedures into running workflows, with a focus on context and harness engineering.",
    "I care about clean architecture, testing, CI/CD and observability, whether the code is written by people or by AI. I have mentored engineers and led knowledge sharing across teams.",
  ],
  cvPdfPath: null,
  socials: [
    { label: "GitHub", url: "https://github.com/sissythem" },
    { label: "GitLab", url: "https://gitlab.com/sissythem" },
    { label: "LinkedIn", url: "https://www.linkedin.com/in/sthemeli/" },
    {
      label: "Scholar",
      url: "https://scholar.google.com/citations?user=Z617qUsAAAAJ",
    },
  ],
};

export const interests: readonly string[] = [
  "Agentic workflows",
  "Context and harness engineering",
  "Event-driven architecture",
  "Multi-agent systems",
  "Observability and testing",
];

export const education: readonly Degree[] = [
  {
    title: "M.Sc. in Computer Science",
    year: 2018,
    institution: "Dep. of Informatics, University of Athens",
  },
  {
    title: "B.Sc. in Management Science & Technology",
    year: 2013,
    institution: "Athens University of Economics and Business",
  },
];

export const publications: readonly Publication[] = [
  {
    title: "A study of text representations for Hate Speech Detection",
    authors: "Chrysoula Themeli, George Giannakopoulos, Nikiforos Pittaras",
    venue: "Springer Nature Switzerland",
    year: 2023,
    links: [
      {
        label: "Publisher",
        url: "https://link.springer.com/chapter/10.1007/978-3-031-24340-0_32",
      },
    ],
  },
  {
    title:
      "DARE platform: a developer-friendly and self-optimising workflows-as-a-service framework for e-science on the cloud",
    authors:
      "Iraklis A. Klampanos, Chrysoula Themeli, Alessandro Spinuso, Rosa Filgueira, Malcolm Atkinson, André Gemünd, Vangelis Karkaletsis",
    venue: "Journal of Open Source Software",
    year: 2020,
    links: [
      {
        label: "PDF",
        url: "https://joss.theoj.org/papers/10.21105/joss.02664.pdf",
      },
    ],
  },
];
