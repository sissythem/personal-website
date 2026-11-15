import type { YearMonth } from "@/data/types";

const monthFormat = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Formats `2022-06` as `Jun 2022`. */
export function formatMonth(value: YearMonth): string {
  const date = new Date(`${value}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid year-month value: ${value}`);
  }
  return monthFormat.format(date);
}

/** Formats a date as `12 Nov 2026`. */
export function formatDay(date: Date): string {
  return dayFormat.format(date);
}

/** Formats a date as `2026-11-12` for `datetime` attributes. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
