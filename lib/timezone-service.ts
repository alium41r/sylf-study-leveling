/**
 * Timezone Service — Reusable utility for user-local date/time calculations.
 * 
 * Uses standard Node `Intl.DateTimeFormat` APIs to interpret IANA timezones securely.
 * This guarantees automatic Daylight Saving Time (DST) handling without relying on fixed UTC offsets.
 */

export interface TimezoneOption {
  value: string;   // IANA identifier, e.g. "America/New_York"
  label: string;   // Human-readable name, e.g. "New York (Eastern Time)"
  offset: string;  // e.g. "UTC-04:00" or "UTC+05:00"
  region: string;  // e.g. "Americas", "Europe", "Asia", "Pacific"
}

// Canonical curated IANA timezones covering major population centers worldwide
const CURATED_TIMEZONES = [
  { value: "UTC", label: "UTC / Universal Time", region: "UTC" },

  // Americas
  { value: "America/New_York", label: "New York, Toronto, Miami (Eastern)", region: "Americas" },
  { value: "America/Chicago", label: "Chicago, Dallas, Mexico City (Central)", region: "Americas" },
  { value: "America/Denver", label: "Denver, Phoenix, Calgary (Mountain)", region: "Americas" },
  { value: "America/Los_Angeles", label: "Los Angeles, San Francisco, Vancouver (Pacific)", region: "Americas" },
  { value: "America/Anchorage", label: "Anchorage (Alaska)", region: "Americas" },
  { value: "Pacific/Honolulu", label: "Honolulu (Hawaii)", region: "Americas" },
  { value: "America/Sao_Paulo", label: "São Paulo, Rio de Janeiro", region: "Americas" },
  { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires", region: "Americas" },
  { value: "America/Santiago", label: "Santiago (Chile)", region: "Americas" },
  { value: "America/Bogota", label: "Bogotá, Lima, Quito", region: "Americas" },

  // Europe
  { value: "Europe/London", label: "London, Dublin, Lisbon (GMT/BST)", region: "Europe" },
  { value: "Europe/Paris", label: "Paris, Berlin, Rome, Madrid, Amsterdam (CET)", region: "Europe" },
  { value: "Europe/Athens", label: "Athens, Helsinki, Bucharest, Istanbul (EET)", region: "Europe" },
  { value: "Europe/Moscow", label: "Moscow, St. Petersburg", region: "Europe" },

  // Asia
  { value: "Asia/Dubai", label: "Dubai, Abu Dhabi, Muscat (GST)", region: "Asia" },
  { value: "Asia/Karachi", label: "Karachi, Islamabad, Tashkent (PKT)", region: "Asia" },
  { value: "Asia/Kolkata", label: "Kolkata, Mumbai, New Delhi (IST)", region: "Asia" },
  { value: "Asia/Dhaka", label: "Dhaka, Almaty (BST)", region: "Asia" },
  { value: "Asia/Bangkok", label: "Bangkok, Hanoi, Jakarta (ICT)", region: "Asia" },
  { value: "Asia/Singapore", label: "Singapore, Kuala Lumpur, Manila, Taipei (SGT)", region: "Asia" },
  { value: "Asia/Hong_Kong", label: "Hong Kong, Beijing, Shanghai (CST)", region: "Asia" },
  { value: "Asia/Tokyo", label: "Tokyo, Osaka, Seoul (JST/KST)", region: "Asia" },

  // Australia & Pacific
  { value: "Australia/Perth", label: "Perth (AWST)", region: "Australia & Pacific" },
  { value: "Australia/Adelaide", label: "Adelaide (ACST)", region: "Australia & Pacific" },
  { value: "Australia/Sydney", label: "Sydney, Melbourne, Brisbane (AEST)", region: "Australia & Pacific" },
  { value: "Pacific/Auckland", label: "Auckland, Wellington, Fiji (NZST)", region: "Australia & Pacific" },

  // Africa & Middle East
  { value: "Africa/Cairo", label: "Cairo (EET)", region: "Africa & Middle East" },
  { value: "Africa/Johannesburg", label: "Johannesburg, Cape Town (SAST)", region: "Africa & Middle East" },
  { value: "Africa/Lagos", label: "Lagos, Accra, Kinshasa (WAT)", region: "Africa & Middle East" },
  { value: "Africa/Nairobi", label: "Nairobi, Addis Ababa (EAT)", region: "Africa & Middle East" },
  { value: "Asia/Jerusalem", label: "Jerusalem, Tel Aviv (IST)", region: "Africa & Middle East" },
  { value: "Asia/Riyadh", label: "Riyadh, Doha, Kuwait (AST)", region: "Africa & Middle East" },
];

export class TimezoneService {
  /**
   * Validates if a given string is a supported, standard IANA timezone.
   */
  static validateTimezone(timezone: string): boolean {
    if (!timezone || typeof timezone !== "string") return false;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }


  /**
   * Returns the user's current local calendar date (YYYY-MM-DD).
   * This is what the user perceives as "today".
   */
  static getUserLocalDate(timezone: string, now: Date = new Date()): string {
    const safeTz = this.validateTimezone(timezone) ? timezone : "UTC";
    try {
      const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: safeTz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      return formatter.format(now);
    } catch (e) {
      return now.toISOString().split("T")[0];
    }
  }

  /**
   * Returns the user's current local time (HH:mm).
   */
  static getUserLocalTime(timezone: string, now: Date = new Date()): string {
    const safeTz = this.validateTimezone(timezone) ? timezone : "UTC";
    try {
      const formatter = new Intl.DateTimeFormat("en-GB", {
        timeZone: safeTz,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      return formatter.format(now);
    } catch (e) {
      return now.toISOString().split("T")[1].substring(0, 5);
    }
  }

  /**
   * Returns a target date offset by `daysOffset` from the user's local "today".
   * E.g., daysOffset = 1 means "tomorrow" in the user's local timezone.
   */
  static getUserLocalDateOffset(timezone: string, daysOffset: number, now: Date = new Date()): string {
    const safeTz = this.validateTimezone(timezone) ? timezone : "UTC";
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: safeTz,
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        hour12: false,
      }).formatToParts(now);

      const p: any = {};
      for (const part of parts) {
        p[part.type] = parseInt(part.value, 10);
      }

      // Construct a Date object representing the local time components (ignoring timezone)
      const localEquivalent = new Date(p.year, p.month - 1, p.day, p.hour || 0, p.minute || 0, p.second || 0);
      
      // Add days
      localEquivalent.setDate(localEquivalent.getDate() + daysOffset);

      // Extract the year-month-day
      const y = localEquivalent.getFullYear();
      const m = String(localEquivalent.getMonth() + 1).padStart(2, "0");
      const d = String(localEquivalent.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    } catch (e) {
      const fallback = new Date(now);
      fallback.setDate(fallback.getDate() + daysOffset);
      return fallback.toISOString().split("T")[0];
    }
  }

  /**
   * Returns the Day of Week (e.g. "Monday") in the user's local timezone.
   */
  static getUserDayOfWeek(timezone: string, dateStr?: string, now: Date = new Date()): string {
    const safeTz = this.validateTimezone(timezone) ? timezone : "UTC";
    try {
      if (dateStr) {
         const d = new Date(dateStr + "T12:00:00Z");
         return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(d);
      } else {
         return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: safeTz }).format(now);
      }
    } catch (e) {
      return "Unknown";
    }
  }

  /**
   * Returns an array of date strings [YYYY-MM-DD] in the user's timezone,
   * from startOffset to endOffset inclusive.
   */
  static getDateRangeInUserTimezone(timezone: string, startOffset: number, endOffset: number, now: Date = new Date()): string[] {
    const dates = [];
    for (let i = startOffset; i <= endOffset; i++) {
      dates.push(this.getUserLocalDateOffset(timezone, i, now));
    }
    return dates;
  }

  /**
   * Helper to format a specific Date object into local YYYY-MM-DD
   */
  static getDateString(date: Date, timezone: string): string {
    return this.getUserLocalDate(timezone, date);
  }

  /**
   * Helper equivalent to getDateOffset but with Timezone
   */
  static getDateOffset(timezone: string, daysOffset: number, now: Date = new Date()): string {
    return this.getUserLocalDateOffset(timezone, daysOffset, now);
  }

  /**
   * Returns a Date object representing the precise UTC instant of midnight (00:00:00.000)
   * in the user's local timezone for the local day of `now`.
   */
  static getStartOfDayUTC(timezone: string, now: Date = new Date()): Date {
    const safeTz = this.validateTimezone(timezone) ? timezone : "UTC";
    const localDateStr = this.getUserLocalDate(safeTz, now);
    const [year, month, day] = localDateStr.split('-').map(Number);
    
    const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: safeTz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    });
    
    const parts = formatter.formatToParts(guess);
    const getPart = (type: string) => parseInt(parts.find(p => p.type === type)?.value || "0", 10);
    
    const localHour = getPart('hour');
    const normalizedHour = localHour === 24 ? 0 : localHour;
    
    const localTimeAsUtc = new Date(Date.UTC(
      getPart('year'), getPart('month') - 1, getPart('day'),
      normalizedHour, getPart('minute'), getPart('second')
    ));
    
    const targetLocalAsUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    const diffMs = localTimeAsUtc.getTime() - targetLocalAsUtc.getTime();
    
    return new Date(guess.getTime() - diffMs);
  }

  /**
   * Returns a Date object representing the precise UTC instant of the NEXT midnight (00:00:00.000)
   * in the user's local timezone.
   */
  static getNextMidnightUTC(timezone: string, now: Date = new Date()): Date {
    const safeTz = this.validateTimezone(timezone) ? timezone : "UTC";
    const tomorrowStr = this.getUserLocalDateOffset(safeTz, 1, now);
    const tomorrowNoon = new Date(`${tomorrowStr}T12:00:00Z`);
    return this.getStartOfDayUTC(safeTz, tomorrowNoon);
  }

  /**
   * Returns a Date object representing the precise UTC instant of end-of-day (23:59:59.999)
   * in the user's local timezone for the local day of `now`.
   */
  static getEndOfDayUTC(timezone: string, now: Date = new Date()): Date {
    const nextMidnight = this.getNextMidnightUTC(timezone, now);
    return new Date(nextMidnight.getTime() - 1);
  }

  /**
   * Returns a formatted list of curated standard IANA timezones with live calculated UTC offsets.
   */
  static getTimezoneList(now: Date = new Date()): TimezoneOption[] {
    return CURATED_TIMEZONES.map((tz) => {
      let offset = "UTC+00:00";
      try {
        const formatter = new Intl.DateTimeFormat("en-US", {
          timeZone: tz.value,
          timeZoneName: "shortOffset",
        });
        const parts = formatter.formatToParts(now);
        const tzNamePart = parts.find((p) => p.type === "timeZoneName");
        if (tzNamePart && tzNamePart.value) {
          const raw = tzNamePart.value;
          const match = raw.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
          if (match) {
            const sign = match[1];
            const hours = match[2].padStart(2, "0");
            const mins = match[3] || "00";
            offset = `UTC${sign}${hours}:${mins}`;
          } else if (raw === "GMT" || raw === "UTC") {
            offset = "UTC+00:00";
          } else {
            offset = raw.replace("GMT", "UTC");
          }
        }
      } catch {
        offset = "UTC+00:00";
      }

      return {
        value: tz.value,
        label: tz.label,
        offset,
        region: tz.region,
      };
    });
  }
}
