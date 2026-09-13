// ============================================================
// Market Hours — IST (Indian Standard Time = UTC+5:30)
// ============================================================

import type { MarketStatus } from './market-data/types';
import { getNseHoliday } from './market-holidays';

// IST offset in minutes
const IST_OFFSET_MINUTES = 330;

export function nowIST(): Date {
  const utc = new Date();
  return new Date(utc.getTime() + IST_OFFSET_MINUTES * 60000);
}

export function toIST(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_MINUTES * 60000);
}

export function getMarketStatus(): MarketStatus {
  const now = nowIST();
  const h = now.getUTCHours();
  const m = now.getUTCMinutes();
  const day = now.getUTCDay(); // 0=Sun, 6=Sat
  const totalMin = h * 60 + m;

  const isWeekend = day === 0 || day === 6;

  if (isWeekend) {
    return {
      isOpen: false,
      session: 'CLOSED_WEEKEND',
      timestamp: new Date(),
    };
  }

  // Check official NSE holiday
  const holiday = getNseHoliday(now);
  if (holiday.isHoliday) {
    return {
      isOpen: false,
      session: 'CLOSED_HOLIDAY',
      holidayName: holiday.holidayName,
      timestamp: new Date(),
    };
  }

  // Pre-open: 09:00–09:15 IST
  if (totalMin >= 540 && totalMin < 555) {
    return { isOpen: false, session: 'PRE_OPEN', timestamp: new Date() };
  }

  // Regular session: 09:15–15:30 IST
  if (totalMin >= 555 && totalMin < 930) {
    const closeAt = new Date();
    closeAt.setUTCHours(10, 0, 0, 0); // 15:30 IST = 10:00 UTC
    return { isOpen: true, session: 'OPEN', nextCloseAt: closeAt, timestamp: new Date() };
  }

  // Post-close
  return { isOpen: false, session: 'POST_CLOSE', timestamp: new Date() };
}

export function isMarketOpen(): boolean {
  return getMarketStatus().isOpen;
}

export function shouldRunCron(): boolean {
  const now = nowIST();
  const h = now.getUTCHours();
  const m = now.getUTCMinutes();
  const day = now.getUTCDay();
  const totalMin = h * 60 + m;
  // Run during 09:15–15:35 IST on weekdays
  return day >= 1 && day <= 5 && totalMin >= 555 && totalMin <= 935;
}

export function formatIST(date: Date): string {
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatISTDate(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function todayIST(): string {
  const now = nowIST();
  return now.toISOString().split('T')[0];
}
